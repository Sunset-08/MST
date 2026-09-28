// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SubmissionRegistry} from "../SubmissionRegistry.sol";
import {RewardVault} from "../RewardVault.sol";

/// @dev Test-only attacker: submits a proof, then tries to re-enter the vault when paid.
contract ReentrantReceiver {
    RewardVault public vault;
    bytes32 public submissionId;
    bool public reentryBlocked;

    constructor(RewardVault v) {
        vault = v;
    }

    function submit(SubmissionRegistry registry, bytes32 challengeId, bytes32 proofHash) external {
        submissionId = registry.submitProof(challengeId, proofHash);
    }

    receive() external payable {
        try vault.distributeReward(submissionId, msg.value) {
            reentryBlocked = false;
        } catch {
            reentryBlocked = true;
        }
    }
}
