// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ChallengeRegistry
/// @notice Registers SECUREX security challenges (ID + content hash + lifecycle status).
///         The registrar is the challenge owner: only that owner (while still holding
///         CHALLENGE_ADMIN_ROLE) or DEFAULT_ADMIN_ROLE may change the challenge status.
contract ChallengeRegistry is AccessControl {
    bytes32 public constant CHALLENGE_ADMIN_ROLE = keccak256("CHALLENGE_ADMIN_ROLE");

    enum ChallengeStatus {
        None,
        Active,
        Paused,
        Retired
    }

    struct Challenge {
        bytes32 contentHash;
        ChallengeStatus status;
        address registrar; // challenge owner
        uint64 registeredAt;
    }

    mapping(bytes32 => Challenge) private _challenges;
    bytes32[] private _challengeIds;

    event ChallengeRegistered(
        bytes32 indexed challengeId, bytes32 indexed contentHash, address indexed registrar, uint256 timestamp
    );
    event ChallengeStatusChanged(bytes32 indexed challengeId, ChallengeStatus oldStatus, ChallengeStatus newStatus);

    error ZeroValue();
    error ChallengeAlreadyRegistered(bytes32 challengeId);
    error ChallengeNotFound(bytes32 challengeId);
    error InvalidStatus();
    error NotChallengeOwner(bytes32 challengeId, address account);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroValue();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CHALLENGE_ADMIN_ROLE, admin);
    }

    function registerChallenge(bytes32 challengeId, bytes32 contentHash) external onlyRole(CHALLENGE_ADMIN_ROLE) {
        if (challengeId == bytes32(0) || contentHash == bytes32(0)) revert ZeroValue();
        if (_challenges[challengeId].status != ChallengeStatus.None) revert ChallengeAlreadyRegistered(challengeId);

        _challenges[challengeId] = Challenge({
            contentHash: contentHash,
            status: ChallengeStatus.Active,
            registrar: msg.sender,
            registeredAt: uint64(block.timestamp)
        });
        _challengeIds.push(challengeId);

        emit ChallengeRegistered(challengeId, contentHash, msg.sender, block.timestamp);
    }

    function setChallengeStatus(bytes32 challengeId, ChallengeStatus newStatus) external {
        Challenge storage c = _challenges[challengeId];
        if (c.status == ChallengeStatus.None) revert ChallengeNotFound(challengeId);
        if (!canManage(challengeId, msg.sender)) revert NotChallengeOwner(challengeId, msg.sender);
        if (newStatus == ChallengeStatus.None || newStatus == c.status) revert InvalidStatus();
        ChallengeStatus old = c.status;
        c.status = newStatus;
        emit ChallengeStatusChanged(challengeId, old, newStatus);
    }

    /// @notice True for DEFAULT_ADMIN_ROLE, or for the challenge owner while it still holds CHALLENGE_ADMIN_ROLE.
    function canManage(bytes32 challengeId, address account) public view returns (bool) {
        Challenge storage c = _challenges[challengeId];
        if (c.status == ChallengeStatus.None) return false;
        return hasRole(DEFAULT_ADMIN_ROLE, account) || (account == c.registrar && hasRole(CHALLENGE_ADMIN_ROLE, account));
    }

    function ownerOf(bytes32 challengeId) external view returns (address) {
        return _challenges[challengeId].registrar;
    }

    function getChallenge(bytes32 challengeId) external view returns (Challenge memory) {
        Challenge memory c = _challenges[challengeId];
        if (c.status == ChallengeStatus.None) revert ChallengeNotFound(challengeId);
        return c;
    }

    function exists(bytes32 challengeId) external view returns (bool) {
        return _challenges[challengeId].status != ChallengeStatus.None;
    }

    function isActive(bytes32 challengeId) external view returns (bool) {
        return _challenges[challengeId].status == ChallengeStatus.Active;
    }

    function challengeCount() external view returns (uint256) {
        return _challengeIds.length;
    }

    function challengeIdAt(uint256 index) external view returns (bytes32) {
        return _challengeIds[index];
    }
}
