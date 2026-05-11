// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MatchRegistry — records each time a player uses their season pass to enter
 * a ranked match. The transaction comes FROM the player's wallet, making it
 * visible on Celoscan and Talent Protocol.
 *
 * No payment required — just gas (~30,000 per call).
 */
contract MatchRegistry {
    address public owner;

    uint256 public totalMatches;
    mapping(address => uint256) public matchesPlayed;

    event MatchRecorded(
        address indexed player,
        string  matchId,
        uint256 playerTotal,
        uint256 globalTotal
    );

    constructor() {
        owner = msg.sender;
    }

    /// @notice Called by a player when they enter a ranked match.
    function recordMatch(string calldata matchId) external {
        matchesPlayed[msg.sender]++;
        totalMatches++;
        emit MatchRecorded(msg.sender, matchId, matchesPlayed[msg.sender], totalMatches);
    }
}
