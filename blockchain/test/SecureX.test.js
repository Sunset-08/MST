const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const id = (s) => ethers.id(s);
const MAX = ethers.parseEther("1");
const REWARD = ethers.parseEther("0.1");

async function deploy() {
  const [admin, verifier, player, attacker, other] = await ethers.getSigners();
  const challenges = await ethers.deployContract("ChallengeRegistry", [admin.address]);
  const submissions = await ethers.deployContract("SubmissionRegistry", [admin.address, await challenges.getAddress()]);
  const vault = await ethers.deployContract("RewardVault", [admin.address, await submissions.getAddress(), MAX]);
  await submissions.grantRole(await submissions.VERIFIER_ROLE(), verifier.address);
  await vault.grantRole(await vault.REWARD_DISTRIBUTOR_ROLE(), verifier.address);
  await admin.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("5") });

  const challengeId = id("challenge:poisoned-node:001");
  const contentHash = id("content-v1");
  await challenges.registerChallenge(challengeId, contentHash);
  return { admin, verifier, player, attacker, other, challenges, submissions, vault, challengeId, contentHash };
}

async function submitted() {
  const f = await deploy();
  const commitment = id("commitment:player");
  await f.submissions.connect(f.player).submitProof(f.challengeId, commitment);
  const proofHash = await f.submissions.computeProofHash(f.challengeId, f.player.address, commitment);
  const submissionId = await f.submissions.computeSubmissionId(f.challengeId, f.player.address, proofHash);
  return { ...f, commitment, proofHash, submissionId };
}

const unauthorized = (c, p) => expect(p).to.be.revertedWithCustomError(c, "AccessControlUnauthorizedAccount");

describe("ChallengeRegistry", () => {
  it("registers, stores and reads a challenge with event", async () => {
    const { challenges, admin } = await loadFixture(deploy);
    const cid = id("c2");
    await expect(challenges.registerChallenge(cid, id("h2")))
      .to.emit(challenges, "ChallengeRegistered")
      .withArgs(cid, id("h2"), admin.address, (t) => t > 0n);
    const c = await challenges.getChallenge(cid);
    expect(c.contentHash).to.equal(id("h2"));
    expect(c.status).to.equal(1n);
    expect(await challenges.isActive(cid)).to.equal(true);
    expect(await challenges.challengeCount()).to.equal(2n);
    expect(await challenges.challengeIdAt(1)).to.equal(cid);
  });

  it("rejects duplicates, zero values and unauthorized registration", async () => {
    const { challenges, challengeId, attacker } = await loadFixture(deploy);
    await expect(challenges.registerChallenge(challengeId, id("x"))).to.be.revertedWithCustomError(challenges, "ChallengeAlreadyRegistered");
    await expect(challenges.registerChallenge(ethers.ZeroHash, id("x"))).to.be.revertedWithCustomError(challenges, "ZeroValue");
    await unauthorized(challenges, challenges.connect(attacker).registerChallenge(id("y"), id("y")));
    await expect(challenges.connect(attacker).setChallengeStatus(challengeId, 3)).to.be.revertedWithCustomError(challenges, "NotChallengeOwner");
    await expect(challenges.getChallenge(id("missing"))).to.be.revertedWithCustomError(challenges, "ChallengeNotFound");
  });

  it("changes status; non-active challenges refuse submissions", async () => {
    const { challenges, submissions, challengeId, player } = await loadFixture(deploy);
    await expect(challenges.setChallengeStatus(challengeId, 2)).to.emit(challenges, "ChallengeStatusChanged").withArgs(challengeId, 1, 2);
    await expect(submissions.connect(player).submitProof(challengeId, id("p"))).to.be.revertedWithCustomError(submissions, "ChallengeNotActive");
    await expect(challenges.setChallengeStatus(challengeId, 2)).to.be.revertedWithCustomError(challenges, "InvalidStatus");
  });
});

describe("ChallengeRegistry ownership", () => {
  it("records the owner; only owner (with role) or admin can change status", async () => {
    const { challenges, admin, verifier: companyA, other: companyB, player } = await loadFixture(deploy);
    const role = await challenges.CHALLENGE_ADMIN_ROLE();
    await challenges.grantRole(role, companyA.address);
    await challenges.grantRole(role, companyB.address);
    const cid = id("company-a:challenge");
    await challenges.connect(companyA).registerChallenge(cid, id("private-code-hash"));
    expect(await challenges.ownerOf(cid)).to.equal(companyA.address);
    expect((await challenges.getChallenge(cid)).registrar).to.equal(companyA.address);
    expect(await challenges.canManage(cid, companyA.address)).to.equal(true);
    expect(await challenges.canManage(cid, companyB.address)).to.equal(false);
    expect(await challenges.canManage(cid, player.address)).to.equal(false);

    await expect(challenges.connect(companyB).setChallengeStatus(cid, 2)).to.be.revertedWithCustomError(challenges, "NotChallengeOwner");
    await expect(challenges.connect(companyA).setChallengeStatus(cid, 2)).to.emit(challenges, "ChallengeStatusChanged");
    await expect(challenges.connect(admin).setChallengeStatus(cid, 1)).to.emit(challenges, "ChallengeStatusChanged");

    await challenges.revokeRole(role, companyA.address);
    await expect(challenges.connect(companyA).setChallengeStatus(cid, 3)).to.be.revertedWithCustomError(challenges, "NotChallengeOwner");
  });

  it("participants cannot register or modify challenges", async () => {
    const { challenges, player, challengeId } = await loadFixture(deploy);
    await unauthorized(challenges, challenges.connect(player).registerChallenge(id("p"), id("p")));
    await expect(challenges.connect(player).setChallengeStatus(challengeId, 3)).to.be.revertedWithCustomError(challenges, "NotChallengeOwner");
    await expect(challenges.connect(player).registerChallenge(challengeId, id("overwrite"))).to.be.revertedWithCustomError(
      challenges,
      "AccessControlUnauthorizedAccount"
    );
    expect((await challenges.getChallenge(challengeId)).contentHash).to.equal(id("content-v1"));
  });
});

describe("SubmissionRegistry", () => {
  it("records submission with timestamp and pending status", async () => {
    const { submissions, player, challengeId, proofHash, submissionId } = await loadFixture(submitted);
    const s = await submissions.getSubmission(submissionId);
    expect(s.challengeId).to.equal(challengeId);
    expect(s.submitter).to.equal(player.address);
    expect(s.proofHash).to.equal(proofHash);
    expect(s.status).to.equal(1n);
    expect(s.submittedAt).to.be.greaterThan(0n);
    expect(await submissions.submissionCount()).to.equal(1n);
  });

  it("rejects duplicate submission, zero proof and unknown challenge", async () => {
    const { submissions, player, challengeId, commitment: proofHash } = await loadFixture(submitted);
    await expect(submissions.connect(player).submitProof(challengeId, proofHash)).to.be.revertedWithCustomError(submissions, "DuplicateSubmission");
    await expect(submissions.connect(player).submitProof(challengeId, ethers.ZeroHash)).to.be.revertedWithCustomError(submissions, "ZeroValue");
    await expect(submissions.connect(player).submitProof(id("nope"), proofHash)).to.be.revertedWithCustomError(submissions, "ChallengeNotActive");
  });

  it("only verifier can verify; emits event; duplicate verification rejected", async () => {
    const { submissions, verifier, attacker, player, challengeId, submissionId } = await loadFixture(submitted);
    await unauthorized(submissions, submissions.connect(attacker).verifySubmission(submissionId));
    await unauthorized(submissions, submissions.connect(player).verifySubmission(submissionId));
    await unauthorized(submissions, submissions.connect(player).rejectSubmission(submissionId));
    await expect(submissions.connect(verifier).verifySubmission(submissionId))
      .to.emit(submissions, "SubmissionVerified")
      .withArgs(submissionId, challengeId, player.address, verifier.address, (t) => t > 0n);
    expect(await submissions.isVerified(submissionId)).to.equal(true);
    const s = await submissions.getSubmission(submissionId);
    expect(s.verifier).to.equal(verifier.address);
    expect(s.reviewedAt).to.be.greaterThan(0n);
    await expect(submissions.connect(verifier).verifySubmission(submissionId)).to.be.revertedWithCustomError(submissions, "SubmissionAlreadyReviewed");
    await expect(submissions.connect(verifier).rejectSubmission(submissionId)).to.be.revertedWithCustomError(submissions, "SubmissionAlreadyReviewed");
    await expect(submissions.connect(verifier).verifySubmission(id("missing"))).to.be.revertedWithCustomError(submissions, "SubmissionNotFound");
  });
});

describe("SubmissionRegistry hardening", () => {
  it("binds the proof hash to challenge + wallet: a copied commitment yields a different proof", async () => {
    const { submissions, player, attacker, challengeId, commitment, proofHash } = await loadFixture(submitted);
    await submissions.connect(attacker).submitProof(challengeId, commitment);
    const copiedProof = await submissions.computeProofHash(challengeId, attacker.address, commitment);
    expect(copiedProof).to.not.equal(proofHash);
    const copiedId = await submissions.computeSubmissionId(challengeId, attacker.address, copiedProof);
    const copied = await submissions.getSubmission(copiedId);
    expect(copied.submitter).to.equal(attacker.address);
    expect(copied.proofHash).to.equal(copiedProof);
    // the original remains the player's
    const original = await submissions.getSubmission(await submissions.computeSubmissionId(challengeId, player.address, proofHash));
    expect(original.submitter).to.equal(player.address);
  });

  it("verifier cannot verify their own submission", async () => {
    const { submissions, verifier, challengeId } = await loadFixture(deploy);
    await submissions.connect(verifier).submitProof(challengeId, id("self"));
    const ph = await submissions.computeProofHash(challengeId, verifier.address, id("self"));
    const sid = await submissions.computeSubmissionId(challengeId, verifier.address, ph);
    await expect(submissions.connect(verifier).verifySubmission(sid)).to.be.revertedWithCustomError(submissions, "SelfVerification");
  });

  it("paused or retired challenges cannot be verified (rejection still allowed)", async () => {
    const { challenges, submissions, verifier, challengeId, submissionId } = await loadFixture(submitted);
    await challenges.setChallengeStatus(challengeId, 2);
    await expect(submissions.connect(verifier).verifySubmission(submissionId)).to.be.revertedWithCustomError(submissions, "ChallengeNotActive");
    await challenges.setChallengeStatus(challengeId, 3);
    await expect(submissions.connect(verifier).verifySubmission(submissionId)).to.be.revertedWithCustomError(submissions, "ChallengeNotActive");
    await expect(submissions.connect(verifier).rejectSubmission(submissionId)).to.emit(submissions, "SubmissionRejected");
  });

  it("one verified completion per wallet per challenge; failed attempts can retry", async () => {
    const { submissions, vault, verifier, player, challengeId, submissionId } = await loadFixture(submitted);
    // retry after rejection is allowed
    await submissions.connect(verifier).rejectSubmission(submissionId);
    await submissions.connect(player).submitProof(challengeId, id("retry-1"));
    await submissions.connect(player).submitProof(challengeId, id("retry-2"));
    const sidOf = async (c) => submissions.computeSubmissionId(challengeId, player.address, await submissions.computeProofHash(challengeId, player.address, c));
    const s1 = await sidOf(id("retry-1"));
    const s2 = await sidOf(id("retry-2"));
    await submissions.connect(verifier).verifySubmission(s1);
    expect(await submissions.completionOf(challengeId, player.address)).to.equal(s1);
    // a second pending submission can no longer be verified, and new submissions are refused
    await expect(submissions.connect(verifier).verifySubmission(s2)).to.be.revertedWithCustomError(submissions, "AlreadyCompleted");
    await expect(submissions.connect(player).submitProof(challengeId, id("retry-3"))).to.be.revertedWithCustomError(submissions, "AlreadyCompleted");
    // so only one reward is possible for this wallet + challenge
    await vault.connect(verifier).distributeReward(s1, REWARD);
    await expect(vault.connect(verifier).distributeReward(s2, REWARD)).to.be.revertedWithCustomError(vault, "SubmissionNotVerified");
  });

  it("different wallets complete the same challenge independently", async () => {
    const { submissions, vault, verifier, player, other, challengeId, submissionId } = await loadFixture(submitted);
    await submissions.connect(other).submitProof(challengeId, id("commitment:other"));
    const otherSid = await submissions.computeSubmissionId(
      challengeId,
      other.address,
      await submissions.computeProofHash(challengeId, other.address, id("commitment:other"))
    );
    await submissions.connect(verifier).verifySubmission(submissionId);
    await submissions.connect(verifier).verifySubmission(otherSid);
    const tx1 = vault.connect(verifier).distributeReward(submissionId, REWARD);
    await expect(tx1).to.changeEtherBalance(player, REWARD);
    const tx2 = vault.connect(verifier).distributeReward(otherSid, REWARD);
    await expect(tx2).to.changeEtherBalance(other, REWARD);
    expect(await submissions.completionOf(challengeId, player.address)).to.equal(submissionId);
    expect(await submissions.completionOf(challengeId, other.address)).to.equal(otherSid);
  });
});

describe("RewardVault", () => {
  it("pays the verified submitter once and emits RewardDistributed", async () => {
    const { submissions, vault, verifier, player, challengeId, submissionId } = await loadFixture(submitted);
    await submissions.connect(verifier).verifySubmission(submissionId);
    const before = await vault.vaultBalance();
    const tx = vault.connect(verifier).distributeReward(submissionId, REWARD);
    await expect(tx).to.emit(vault, "RewardDistributed").withArgs(submissionId, challengeId, player.address, REWARD, verifier.address);
    await expect(tx).to.changeEtherBalances([player, vault], [REWARD, -REWARD]);
    expect(await vault.isRewarded(submissionId)).to.equal(true);
    expect(await vault.rewardOf(submissionId)).to.equal(REWARD);
    expect(await vault.totalDistributed()).to.equal(REWARD);
    expect(await vault.vaultBalance()).to.equal(before - REWARD);
    await expect(vault.connect(verifier).distributeReward(submissionId, REWARD)).to.be.revertedWithCustomError(vault, "AlreadyRewarded");
  });

  it("refuses unverified or rejected submissions", async () => {
    const { submissions, vault, verifier, submissionId } = await loadFixture(submitted);
    await expect(vault.connect(verifier).distributeReward(submissionId, REWARD)).to.be.revertedWithCustomError(vault, "SubmissionNotVerified");
    await submissions.connect(verifier).rejectSubmission(submissionId);
    await expect(vault.connect(verifier).distributeReward(submissionId, REWARD)).to.be.revertedWithCustomError(vault, "SubmissionNotVerified");
  });

  it("cannot be drained by arbitrary users; caps and balance enforced", async () => {
    const { submissions, vault, verifier, attacker, player, submissionId } = await loadFixture(submitted);
    await submissions.connect(verifier).verifySubmission(submissionId);
    await unauthorized(vault, vault.connect(attacker).distributeReward(submissionId, REWARD));
    await unauthorized(vault, vault.connect(player).distributeReward(submissionId, REWARD));
    await unauthorized(vault, vault.connect(attacker).withdraw(attacker.address, 1n));
    await unauthorized(vault, vault.connect(verifier).withdraw(verifier.address, 1n));
    await unauthorized(vault, vault.connect(attacker).setMaxRewardPerSubmission(ethers.parseEther("100")));
    await expect(vault.connect(verifier).distributeReward(submissionId, MAX + 1n)).to.be.revertedWithCustomError(vault, "RewardAboveMax");
    await vault.setMaxRewardPerSubmission(ethers.parseEther("100"));
    await expect(vault.connect(verifier).distributeReward(submissionId, ethers.parseEther("50"))).to.be.revertedWithCustomError(vault, "InsufficientVaultBalance");
  });

  it("blocks reentrancy from a malicious submitter", async () => {
    const { submissions, vault, verifier, challengeId } = await loadFixture(deploy);
    const evil = await ethers.deployContract("ReentrantReceiver", [await vault.getAddress()]);
    await evil.submit(await submissions.getAddress(), challengeId, id("evil"));
    const sid = await evil.submissionId();
    await submissions.connect(verifier).verifySubmission(sid);
    await vault.connect(verifier).distributeReward(sid, REWARD);
    expect(await evil.reentryBlocked()).to.equal(true);
    expect(await ethers.provider.getBalance(await evil.getAddress())).to.equal(REWARD);
  });

  it("admin can withdraw unused testnet funds", async () => {
    const { vault, other } = await loadFixture(deploy);
    await expect(vault.withdraw(other.address, REWARD)).to.emit(vault, "AdminWithdrawal").withArgs(other.address, REWARD);
  });
});
