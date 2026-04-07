// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * KnockOrderArena — on-chain match registry for Action Order (Celo MiniPay).
 *
 * Supports two currencies:
 *   - cUSD  (ERC-20)  via enterMatch()
 *   - CELO  (native)  via enterMatchWithCelo()
 *
 * Talent Protocol / any indexer can follow:
 *   MatchEntered   — player + entry fee + currency
 *   MatchCompleted — winner + loser + payout + currency
 *   MatchRefunded  — cancelled match refund
 *
 * Flow (cUSD):
 *   1. Player approves this contract to spend ENTRY_FEE cUSD
 *   2. Player calls enterMatch(matchId)
 *   3. Server calls completeMatch(matchId, winner) → 0.18 cUSD to winner
 *
 * Flow (CELO):
 *   1. Player calls enterMatchWithCelo{value: ENTRY_FEE}(matchId)
 *   2. Server calls completeMatch(matchId, winner) → 0.18 CELO to winner
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract KnockOrderArena {

    // ── State ─────────────────────────────────────────────────────────────────
    IERC20  public immutable cusd;
    address public owner;

    // Micro amounts — optimised for agent activity volume
    uint256 public constant ENTRY_FEE  = 7_000_000_000_000; // 0.000007 (18 dec)
    uint256 public constant WIN_PAYOUT = 7_000_000_000_000; // 0.000007 (18 dec)

    enum Currency    { CUSD, CELO }
    enum MatchStatus { None, Active, Completed, Refunded }

    struct Match {
        address     player;
        MatchStatus status;
        uint64      startedAt;
        Currency    currency;
    }

    mapping(bytes32 => Match) public matches;

    // ── Events ────────────────────────────────────────────────────────────────
    event MatchEntered(
        bytes32 indexed matchId,
        address indexed player,
        uint256 entryFee,
        Currency currency,
        uint256 timestamp
    );
    event MatchCompleted(
        bytes32 indexed matchId,
        address indexed winner,
        address indexed player,
        uint256 payout,
        Currency currency,
        uint256 timestamp
    );
    event MatchRefunded(
        bytes32 indexed matchId,
        address indexed player,
        uint256 refund,
        Currency currency,
        uint256 timestamp
    );
    event FeesWithdrawn(address indexed to, uint256 amount, Currency currency);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "KOA: not owner");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _cusd) {
        cusd  = IERC20(_cusd);
        owner = msg.sender;
    }

    /// Accept native CELO sent to fund payouts
    receive() external payable {}

    // ── Player: enter with cUSD ───────────────────────────────────────────────
    function enterMatch(bytes32 matchId) external {
        require(matches[matchId].status == MatchStatus.None, "KOA: matchId used");
        require(
            cusd.transferFrom(msg.sender, address(this), ENTRY_FEE),
            "KOA: fee transfer failed"
        );

        matches[matchId] = Match({
            player:    msg.sender,
            status:    MatchStatus.Active,
            startedAt: uint64(block.timestamp),
            currency:  Currency.CUSD
        });

        emit MatchEntered(matchId, msg.sender, ENTRY_FEE, Currency.CUSD, block.timestamp);
    }

    // ── Player: enter with native CELO ────────────────────────────────────────
    function enterMatchWithCelo(bytes32 matchId) external payable {
        require(matches[matchId].status == MatchStatus.None, "KOA: matchId used");
        require(msg.value == ENTRY_FEE, "KOA: wrong CELO amount");

        matches[matchId] = Match({
            player:    msg.sender,
            status:    MatchStatus.Active,
            startedAt: uint64(block.timestamp),
            currency:  Currency.CELO
        });

        emit MatchEntered(matchId, msg.sender, ENTRY_FEE, Currency.CELO, block.timestamp);
    }

    // ── Owner: resolve match ──────────────────────────────────────────────────
    function completeMatch(bytes32 matchId, address winner) external onlyOwner {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Active, "KOA: not active");
        require(winner != address(0),            "KOA: zero winner");

        m.status = MatchStatus.Completed;

        if (m.currency == Currency.CUSD) {
            require(
                cusd.balanceOf(address(this)) >= WIN_PAYOUT,
                "KOA: insufficient cUSD"
            );
            require(cusd.transfer(winner, WIN_PAYOUT), "KOA: payout failed");
        } else {
            require(address(this).balance >= WIN_PAYOUT, "KOA: insufficient CELO");
            (bool ok,) = payable(winner).call{value: WIN_PAYOUT}("");
            require(ok, "KOA: CELO payout failed");
        }

        emit MatchCompleted(matchId, winner, m.player, WIN_PAYOUT, m.currency, block.timestamp);
    }

    function refundMatch(bytes32 matchId) external onlyOwner {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Active, "KOA: not active");

        m.status = MatchStatus.Refunded;

        if (m.currency == Currency.CUSD) {
            require(cusd.transfer(m.player, ENTRY_FEE), "KOA: refund failed");
        } else {
            (bool ok,) = payable(m.player).call{value: ENTRY_FEE}("");
            require(ok, "KOA: CELO refund failed");
        }

        emit MatchRefunded(matchId, m.player, ENTRY_FEE, m.currency, block.timestamp);
    }

    // ── Owner: withdraw fees ──────────────────────────────────────────────────
    function withdrawFees(uint256 amount, address to) external onlyOwner {
        require(to != address(0), "KOA: zero address");
        require(cusd.transfer(to, amount), "KOA: withdraw failed");
        emit FeesWithdrawn(to, amount, Currency.CUSD);
    }

    function withdrawCelo(uint256 amount, address to) external onlyOwner {
        require(to != address(0),             "KOA: zero address");
        require(address(this).balance >= amount, "KOA: insufficient CELO");
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "KOA: CELO withdraw failed");
        emit FeesWithdrawn(to, amount, Currency.CELO);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "KOA: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function getMatch(bytes32 matchId)
        external view
        returns (address player, MatchStatus status, uint64 startedAt, Currency currency)
    {
        Match storage m = matches[matchId];
        return (m.player, m.status, m.startedAt, m.currency);
    }

    function contractBalance() external view returns (uint256) {
        return cusd.balanceOf(address(this));
    }

    function celoBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
