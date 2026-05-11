// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SeasonPassRegistry
 * @notice Players call buySeasonPass() to purchase a ranked season pass.
 *         CELO is forwarded to the treasury; the purchase is recorded on-chain
 *         so each buyer's wallet appears in block explorers and Talent Protocol.
 */
contract SeasonPassRegistry {
    address public owner;
    address payable public treasury;

    uint256 public constant WEEKLY_PRICE  = 0.5 ether;
    uint256 public constant MONTHLY_PRICE = 1.5 ether;
    uint256 public constant SEASON_PRICE  = 3.5 ether;

    uint256 public totalPassesSold;
    mapping(address => uint256) public totalPurchases;

    event PassPurchased(
        address indexed buyer,
        string  plan,
        uint256 amount,
        uint256 totalSold
    );

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address payable _treasury) {
        require(_treasury != address(0), "Zero treasury");
        owner    = msg.sender;
        treasury = _treasury;
    }

    /**
     * @notice Buy a season pass. msg.value must exactly match the plan price.
     * @param plan  "weekly" | "monthly" | "season"
     */
    function buySeasonPass(string calldata plan) external payable {
        uint256 price = _priceFor(plan);
        require(msg.value == price, "Wrong amount");

        (bool sent, ) = treasury.call{value: msg.value}("");
        require(sent, "Treasury transfer failed");

        totalPassesSold++;
        totalPurchases[msg.sender]++;

        emit PassPurchased(msg.sender, plan, msg.value, totalPassesSold);
    }

    function setTreasury(address payable _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero treasury");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        owner = newOwner;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _priceFor(string calldata plan) internal pure returns (uint256) {
        bytes32 h = keccak256(bytes(plan));
        if (h == keccak256("weekly"))  return WEEKLY_PRICE;
        if (h == keccak256("monthly")) return MONTHLY_PRICE;
        if (h == keccak256("season"))  return SEASON_PRICE;
        revert("Invalid plan");
    }
}
