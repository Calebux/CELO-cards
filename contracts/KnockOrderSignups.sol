// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KnockOrderSignups
 * @notice On-chain signup registry for Knock Order / Action Order.
 *         Each player wallet calls signUp() exactly once — no payment, gas only —
 *         so every registered player is attributable on-chain via the SignedUp
 *         event (indexed by player address).
 *
 *         signUpFor() lets the treasury record a signup on behalf of a player
 *         (e.g. MiniPay users, where the app avoids extra wallet prompts). The
 *         player address is still the indexed event argument, so indexers can
 *         count unique players either way.
 */
contract KnockOrderSignups {
    address public owner;

    uint256 public totalSignups;
    mapping(address => uint256) public signedUpAt;

    event SignedUp(address indexed player, uint256 indexed index, bool sponsored, uint256 timestamp);
    event OwnershipTransferred(address indexed previous, address indexed next);

    modifier onlyOwner() {
        require(msg.sender == owner, "KOS: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Player signs up with their own wallet. One signup per address.
    function signUp() external {
        _register(msg.sender, false);
    }

    /// @notice Treasury records a signup for a player (MiniPay path).
    function signUpFor(address player) external onlyOwner {
        require(player != address(0), "KOS: zero player");
        _register(player, true);
    }

    function hasSignedUp(address player) external view returns (bool) {
        return signedUpAt[player] != 0;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "KOS: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _register(address player, bool sponsored) internal {
        require(signedUpAt[player] == 0, "KOS: already signed up");
        signedUpAt[player] = block.timestamp;
        totalSignups++;
        emit SignedUp(player, totalSignups, sponsored, block.timestamp);
    }
}
