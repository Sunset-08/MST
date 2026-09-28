// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SubmissionRegistry} from "./SubmissionRegistry.sol";

/// @title RewardVault
/// @notice Holds controlled native MST testnet coin (tMSTC) and pays one reward per verified submission.
///         Rewards always go to the on-chain submitter of the verified submission; the caller cannot redirect them.
contract RewardVault is AccessControl, ReentrancyGuard {
    bytes32 public constant REWARD_DISTRIBUTOR_ROLE = keccak256("REWARD_DISTRIBUTOR_ROLE");

    SubmissionRegistry public immutable submissionRegistry;

    uint256 public maxRewardPerSubmission;
    uint256 public totalDistributed;

    mapping(bytes32 => uint256) private _rewardOf;
    mapping(bytes32 => bool) private _rewarded;

    event VaultFunded(address indexed from, uint256 amount);
    event RewardDistributed(
        bytes32 indexed submissionId,
        bytes32 indexed challengeId,
        address indexed recipient,
        uint256 amount,
        address distributor
    );
    event MaxRewardUpdated(uint256 oldMax, uint256 newMax);
    event AdminWithdrawal(address indexed to, uint256 amount);

    error ZeroValue();
    error SubmissionNotVerified(bytes32 submissionId);
    error AlreadyRewarded(bytes32 submissionId);
    error RewardAboveMax(uint256 amount, uint256 max);
    error InsufficientVaultBalance(uint256 requested, uint256 available);
    error TransferFailed();

    constructor(address admin, SubmissionRegistry registry, uint256 maxReward) {
        if (admin == address(0) || address(registry) == address(0) || maxReward == 0) revert ZeroValue();
        submissionRegistry = registry;
        maxRewardPerSubmission = maxReward;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REWARD_DISTRIBUTOR_ROLE, admin);
    }

    receive() external payable {
        emit VaultFunded(msg.sender, msg.value);
    }

    function fund() external payable {
        if (msg.value == 0) revert ZeroValue();
        emit VaultFunded(msg.sender, msg.value);
    }

    function distributeReward(bytes32 submissionId, uint256 amount)
        external
        onlyRole(REWARD_DISTRIBUTOR_ROLE)
        nonReentrant
    {
        if (amount == 0) revert ZeroValue();
        if (amount > maxRewardPerSubmission) revert RewardAboveMax(amount, maxRewardPerSubmission);
        if (_rewarded[submissionId]) revert AlreadyRewarded(submissionId);
        if (!submissionRegistry.isVerified(submissionId)) revert SubmissionNotVerified(submissionId);
        if (amount > address(this).balance) revert InsufficientVaultBalance(amount, address(this).balance);

        SubmissionRegistry.Submission memory s = submissionRegistry.getSubmission(submissionId);

        _rewarded[submissionId] = true;
        _rewardOf[submissionId] = amount;
        totalDistributed += amount;

        (bool ok,) = payable(s.submitter).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RewardDistributed(submissionId, s.challengeId, s.submitter, amount, msg.sender);
    }

    function setMaxRewardPerSubmission(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMax == 0) revert ZeroValue();
        emit MaxRewardUpdated(maxRewardPerSubmission, newMax);
        maxRewardPerSubmission = newMax;
    }

    /// @notice Admin-only recovery of unused testnet funds.
    function withdraw(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0) || amount == 0) revert ZeroValue();
        if (amount > address(this).balance) revert InsufficientVaultBalance(amount, address(this).balance);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit AdminWithdrawal(to, amount);
    }

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function isRewarded(bytes32 submissionId) external view returns (bool) {
        return _rewarded[submissionId];
    }

    function rewardOf(bytes32 submissionId) external view returns (uint256) {
        return _rewardOf[submissionId];
    }
}
