// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * KnockOrderArenaV2 — stablecoin wager escrow for Action Order on Celo.
 * Built for MiniPay: players stake USDT, USDC, or USDm with a single
 * one-tap transfer; no approvals and no message signing required.
 *
 * Supports any allowlisted stablecoin (USDT, USDC, USDm at deploy).
 *
 * Two entry paths:
 *
 *   MiniPay (single tap, no approval):
 *     1. Player sends a plain ERC-20 transfer of their stake to this contract.
 *     2. The game server verifies the transfer on-chain and calls
 *        recordStake(matchId, player, token, amount) to attribute it.
 *        recordStake can never credit more than the contract actually holds
 *        (balance-backed invariant), so attribution cannot mint funds.
 *
 *   Web (trustless):
 *     1. Player approves this contract for the stake amount.
 *     2. Player calls enterMatch(matchId, token, amount) — pulled via
 *        transferFrom and credited in the same transaction.
 *
 * Settlement:
 *   Server calls completeMatch(matchId, winner) → winner receives 90% of the
 *   combined pot in the staked token; the 10% platform fee stays in the
 *   contract and is withdrawable by the owner. refundMatch returns all stakes.
 *
 * Indexers can follow: StakeRecorded, MatchCompleted, MatchRefunded.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract KnockOrderArenaV2 {

    // ── State ─────────────────────────────────────────────────────────────────
    address public owner;

    uint256 public constant FEE_BPS = 1000; // 10% platform fee on the pot
    uint256 public constant MAX_STAKERS = 2;

    mapping(address => bool) public allowedTokens;

    /// Total credited to open (Active) matches per token. The contract's token
    /// balance is always >= totalCredited[token]; the surplus is platform fees
    /// plus not-yet-attributed transfers.
    mapping(address => uint256) public totalCredited;

    enum MatchStatus { None, Active, Completed, Refunded }

    struct MatchInfo {
        address token;
        uint96  stakerCount;
        MatchStatus status;
        uint64  startedAt;
        address[MAX_STAKERS] stakers;
        uint256[MAX_STAKERS] stakes;
    }

    mapping(bytes32 => MatchInfo) private _matches;

    // ── Events ────────────────────────────────────────────────────────────────
    event StakeRecorded(
        bytes32 indexed matchId,
        address indexed player,
        address indexed token,
        uint256 amount,
        bool    selfServe,
        uint256 timestamp
    );
    event MatchCompleted(
        bytes32 indexed matchId,
        address indexed winner,
        address indexed token,
        uint256 pot,
        uint256 payout,
        uint256 timestamp
    );
    event MatchRefunded(bytes32 indexed matchId, address indexed token, uint256 pot, uint256 timestamp);
    event TokenAllowed(address indexed token, bool allowed);
    event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "KOA2: not owner");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address[] memory tokens) {
        owner = msg.sender;
        for (uint256 i = 0; i < tokens.length; i++) {
            allowedTokens[tokens[i]] = true;
            emit TokenAllowed(tokens[i], true);
        }
    }

    // ── Internal: credit a stake to a match ───────────────────────────────────
    function _credit(bytes32 matchId, address player, address token, uint256 amount, bool selfServe) internal {
        require(allowedTokens[token], "KOA2: token not allowed");
        require(player != address(0),  "KOA2: zero player");
        require(amount > 0,            "KOA2: zero amount");

        MatchInfo storage m = _matches[matchId];
        require(m.status == MatchStatus.None || m.status == MatchStatus.Active, "KOA2: match closed");

        if (m.status == MatchStatus.None) {
            m.status = MatchStatus.Active;
            m.token = token;
            m.startedAt = uint64(block.timestamp);
        } else {
            require(m.token == token, "KOA2: token mismatch");
        }

        require(m.stakerCount < MAX_STAKERS, "KOA2: match full");
        for (uint256 i = 0; i < m.stakerCount; i++) {
            require(m.stakers[i] != player, "KOA2: already staked");
        }

        m.stakers[m.stakerCount] = player;
        m.stakes[m.stakerCount] = amount;
        m.stakerCount++;

        totalCredited[token] += amount;
        // Attribution can never exceed what the contract actually holds.
        require(IERC20(token).balanceOf(address(this)) >= totalCredited[token], "KOA2: unbacked credit");

        emit StakeRecorded(matchId, player, token, amount, selfServe, block.timestamp);
    }

    // ── Server: attribute a plain-transfer stake (MiniPay path) ───────────────
    function recordStake(bytes32 matchId, address player, address token, uint256 amount) external onlyOwner {
        _credit(matchId, player, token, amount, false);
    }

    // ── Player: trustless entry via approve + transferFrom (web path) ─────────
    function enterMatch(bytes32 matchId, address token, uint256 amount) external {
        require(allowedTokens[token], "KOA2: token not allowed");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "KOA2: stake transfer failed");
        _credit(matchId, msg.sender, token, amount, true);
    }

    // ── Server: settle ────────────────────────────────────────────────────────
    function completeMatch(bytes32 matchId, address winner) external onlyOwner {
        MatchInfo storage m = _matches[matchId];
        require(m.status == MatchStatus.Active, "KOA2: not active");
        require(winner != address(0),           "KOA2: zero winner");

        uint256 pot = m.stakes[0] + m.stakes[1];
        uint256 payout = pot * (10000 - FEE_BPS) / 10000;

        m.status = MatchStatus.Completed;
        totalCredited[m.token] -= pot; // fee remainder becomes withdrawable surplus

        require(IERC20(m.token).transfer(winner, payout), "KOA2: payout failed");

        emit MatchCompleted(matchId, winner, m.token, pot, payout, block.timestamp);
    }

    function refundMatch(bytes32 matchId) external onlyOwner {
        MatchInfo storage m = _matches[matchId];
        require(m.status == MatchStatus.Active, "KOA2: not active");

        m.status = MatchStatus.Refunded;
        uint256 pot = m.stakes[0] + m.stakes[1];
        totalCredited[m.token] -= pot;

        for (uint256 i = 0; i < m.stakerCount; i++) {
            require(IERC20(m.token).transfer(m.stakers[i], m.stakes[i]), "KOA2: refund failed");
        }

        emit MatchRefunded(matchId, m.token, pot, block.timestamp);
    }

    // ── Owner: config + fees ──────────────────────────────────────────────────
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// Withdraw platform fees / unattributed surplus. Cannot touch funds
    /// backing open matches.
    function withdrawFees(address token, uint256 amount, address to) external onlyOwner {
        require(to != address(0), "KOA2: zero address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance >= totalCredited[token] + amount, "KOA2: exceeds surplus");
        require(IERC20(token).transfer(to, amount), "KOA2: withdraw failed");
        emit FeesWithdrawn(token, to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "KOA2: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function getMatch(bytes32 matchId)
        external view
        returns (
            address token,
            MatchStatus status,
            uint64 startedAt,
            uint256 pot,
            address[MAX_STAKERS] memory stakers,
            uint256[MAX_STAKERS] memory stakes
        )
    {
        MatchInfo storage m = _matches[matchId];
        return (m.token, m.status, m.startedAt, m.stakes[0] + m.stakes[1], m.stakers, m.stakes);
    }

    function surplus(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this)) - totalCredited[token];
    }
}
