// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGoodDollar {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

/**
 * @title GDollarSeasonPassRegistry
 * @notice Players call buySeasonPass() to purchase a ranked season pass with G$.
 *         Player must first call G$.approve(address(this), price). G$ is pulled
 *         via transferFrom and forwarded to treasury; the purchase is recorded
 *         on-chain so each buyer's wallet — and every G$ token that moves through
 *         this contract — is attributable to Knock Order in block explorers.
 *
 *         Uses approve+transferFrom rather than G$'s ERC-677 transferAndCall
 *         specifically to avoid relying on undocumented fee-deduction behavior
 *         in G$'s SuperToken transfer-and-call path — a plain transferFrom has
 *         no such ambiguity.
 */
contract GDollarSeasonPassRegistry {
    address public owner;
    address public treasury;
    IGoodDollar public immutable gDollar;

    // Owner-adjustable so app-side price changes don't require a redeploy.
    uint256 public weeklyPrice  = 100 ether;  // 100 G$
    uint256 public monthlyPrice = 200 ether;  // 200 G$
    uint256 public seasonPrice  = 7000 ether; // 7000 G$

    uint256 public totalPassesSold;
    mapping(address => uint256) public totalPurchases;

    event PassPurchased(
        address indexed buyer,
        string  plan,
        uint256 amount,
        uint256 totalSold
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    event PricesUpdated(uint256 weekly, uint256 monthly, uint256 season);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _gDollar, address _treasury) {
        require(_gDollar != address(0), "Zero token");
        require(_treasury != address(0), "Zero treasury");
        owner    = msg.sender;
        gDollar  = IGoodDollar(_gDollar);
        treasury = _treasury;
    }

    /**
     * @notice Buy a season pass with G$. Caller must have approved this
     *         contract for at least the plan's price beforehand.
     * @param plan  "weekly" | "monthly" | "season"
     */
    function buySeasonPass(string calldata plan) external {
        uint256 price = _priceFor(plan);

        require(gDollar.transferFrom(msg.sender, address(this), price), "transferFrom failed");
        require(gDollar.transfer(treasury, price), "Treasury transfer failed");

        totalPassesSold++;
        totalPurchases[msg.sender]++;

        emit PassPurchased(msg.sender, plan, price, totalPassesSold);
    }

    function setPrices(uint256 _weekly, uint256 _monthly, uint256 _season) external onlyOwner {
        require(_weekly > 0 && _monthly > 0 && _season > 0, "Zero price");
        weeklyPrice  = _weekly;
        monthlyPrice = _monthly;
        seasonPrice  = _season;
        emit PricesUpdated(_weekly, _monthly, _season);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero treasury");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        owner = newOwner;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _priceFor(string calldata plan) internal view returns (uint256) {
        bytes32 h = keccak256(bytes(plan));
        if (h == keccak256("weekly"))  return weeklyPrice;
        if (h == keccak256("monthly")) return monthlyPrice;
        if (h == keccak256("season"))  return seasonPrice;
        revert("Invalid plan");
    }
}
