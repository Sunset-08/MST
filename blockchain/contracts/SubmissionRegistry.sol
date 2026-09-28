// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ChallengeRegistry} from "./ChallengeRegistry.sol";

/// @title SubmissionRegistry
/// @notice Records submission/proof hashes from player wallets and their verification by an authorized verifier.
/// @dev The player submits solutionCommitment = keccak256(abi.encode(challengeId, wallet, keccak256(solution), salt)),
///      computed off-chain. The contract additionally binds it to msg.sender: proofHash = keccak256(abi.encode(
///      challengeId, submitter, solutionCommitment)). The backend verifies only if the player's opening reproduces the
///      commitment for THIS submission's challenge and submitter, so a commitment copied by another wallet can never
///      be opened for that wallet. Solution and salt never go on-chain.
///      Each wallet can have at most one Verified submission per challenge; rejected attempts may be retried.
contract SubmissionRegistry is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum SubmissionStatus {
        None,
        Pending,
        Verified,
        Rejected
    }

    struct Submission {
        bytes32 challengeId;
        address submitter;
        bytes32 proofHash;
        SubmissionStatus status;
        uint64 submittedAt;
        uint64 reviewedAt;
        address verifier;
    }

    ChallengeRegistry public immutable challengeRegistry;

    mapping(bytes32 => Submission) private _submissions;
    uint256 public submissionCount;
    /// challengeId => submitter => verified submissionId (zero if not completed)
    mapping(bytes32 => mapping(address => bytes32)) private _completion;

    event SubmissionRecorded(
        bytes32 indexed submissionId,
        bytes32 indexed challengeId,
        address indexed submitter,
        bytes32 proofHash,
        uint256 timestamp
    );
    event SubmissionVerified(
        bytes32 indexed submissionId,
        bytes32 indexed challengeId,
        address indexed submitter,
        address verifier,
        uint256 timestamp
    );
    event SubmissionRejected(
        bytes32 indexed submissionId,
        bytes32 indexed challengeId,
        address indexed submitter,
        address verifier,
        uint256 timestamp
    );

    error ZeroValue();
    error ChallengeNotActive(bytes32 challengeId);
    error DuplicateSubmission(bytes32 submissionId);
    error SubmissionNotFound(bytes32 submissionId);
    error SubmissionAlreadyReviewed(bytes32 submissionId, SubmissionStatus status);
    error SelfVerification(bytes32 submissionId);
    error AlreadyCompleted(bytes32 challengeId, address submitter, bytes32 completedSubmissionId);

    constructor(address admin, ChallengeRegistry registry) {
        if (admin == address(0) || address(registry) == address(0)) revert ZeroValue();
        challengeRegistry = registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    /// @notice Deterministic submission ID, computable off-chain.
    function computeSubmissionId(bytes32 challengeId, address submitter, bytes32 proofHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(challengeId, submitter, proofHash));
    }

    /// @notice Proof hash bound to challenge + submitter wallet, computable off-chain.
    function computeProofHash(bytes32 challengeId, address submitter, bytes32 solutionCommitment)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(challengeId, submitter, solutionCommitment));
    }

    /// @notice Called by the player's wallet; msg.sender is the submitter.
    /// @param solutionCommitment keccak256(abi.encode(challengeId, msg.sender, keccak256(solution), salt)), off-chain.
    function submitProof(bytes32 challengeId, bytes32 solutionCommitment) external returns (bytes32 submissionId) {
        if (solutionCommitment == bytes32(0)) revert ZeroValue();
        if (!challengeRegistry.isActive(challengeId)) revert ChallengeNotActive(challengeId);
        bytes32 completed = _completion[challengeId][msg.sender];
        if (completed != bytes32(0)) revert AlreadyCompleted(challengeId, msg.sender, completed);

        bytes32 proofHash = computeProofHash(challengeId, msg.sender, solutionCommitment);
        submissionId = computeSubmissionId(challengeId, msg.sender, proofHash);
        if (_submissions[submissionId].status != SubmissionStatus.None) revert DuplicateSubmission(submissionId);

        _submissions[submissionId] = Submission({
            challengeId: challengeId,
            submitter: msg.sender,
            proofHash: proofHash,
            status: SubmissionStatus.Pending,
            submittedAt: uint64(block.timestamp),
            reviewedAt: 0,
            verifier: address(0)
        });
        unchecked {
            ++submissionCount;
        }

        emit SubmissionRecorded(submissionId, challengeId, msg.sender, proofHash, block.timestamp);
    }

    function verifySubmission(bytes32 submissionId) external onlyRole(VERIFIER_ROLE) {
        Submission storage s = _review(submissionId);
        if (s.submitter == msg.sender) revert SelfVerification(submissionId);
        if (!challengeRegistry.isActive(s.challengeId)) revert ChallengeNotActive(s.challengeId);
        bytes32 completed = _completion[s.challengeId][s.submitter];
        if (completed != bytes32(0)) revert AlreadyCompleted(s.challengeId, s.submitter, completed);
        _completion[s.challengeId][s.submitter] = submissionId;
        s.status = SubmissionStatus.Verified;
        emit SubmissionVerified(submissionId, s.challengeId, s.submitter, msg.sender, block.timestamp);
    }

    function rejectSubmission(bytes32 submissionId) external onlyRole(VERIFIER_ROLE) {
        Submission storage s = _review(submissionId);
        s.status = SubmissionStatus.Rejected;
        emit SubmissionRejected(submissionId, s.challengeId, s.submitter, msg.sender, block.timestamp);
    }

    function _review(bytes32 submissionId) private returns (Submission storage s) {
        s = _submissions[submissionId];
        if (s.status == SubmissionStatus.None) revert SubmissionNotFound(submissionId);
        if (s.status != SubmissionStatus.Pending) revert SubmissionAlreadyReviewed(submissionId, s.status);
        s.reviewedAt = uint64(block.timestamp);
        s.verifier = msg.sender;
    }

    function getSubmission(bytes32 submissionId) external view returns (Submission memory) {
        Submission memory s = _submissions[submissionId];
        if (s.status == SubmissionStatus.None) revert SubmissionNotFound(submissionId);
        return s;
    }

    function getStatus(bytes32 submissionId) external view returns (SubmissionStatus) {
        return _submissions[submissionId].status;
    }

    function isVerified(bytes32 submissionId) external view returns (bool) {
        return _submissions[submissionId].status == SubmissionStatus.Verified;
    }

    /// @notice The verified submission of `account` for `challengeId`, or zero if not completed.
    function completionOf(bytes32 challengeId, address account) external view returns (bytes32) {
        return _completion[challengeId][account];
    }

    function submitterOf(bytes32 submissionId) external view returns (address) {
        return _submissions[submissionId].submitter;
    }
}
