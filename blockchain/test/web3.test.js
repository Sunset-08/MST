// Exercises the frontend/server Web3 library against a real local EVM (Hardhat network).
const { expect } = require("chai");
const hre = require("hardhat");
const lib = require("../web3/src/index.js");

const { ethers } = hre;

describe("web3 library (against Hardhat EVM)", function () {
  let addresses, admin, player, attacker;
  const localNet = { ...lib.MST_TESTNET, chainId: 31337, chainName: "Hardhat" };
  const eth = hre.network.provider; // real EIP-1193 provider

  before(async () => {
    [admin, player, attacker] = await ethers.getSigners();
    const c = await ethers.deployContract("ChallengeRegistry", [admin.address]);
    const s = await ethers.deployContract("SubmissionRegistry", [admin.address, await c.getAddress()]);
    const v = await ethers.deployContract("RewardVault", [admin.address, await s.getAddress(), ethers.parseEther("1")]);
    await v.fund({ value: ethers.parseEther("2") });
    addresses = { ChallengeRegistry: await c.getAddress(), SubmissionRegistry: await s.getAddress(), RewardVault: await v.getAddress() };
  });

  const libSigner = async (addr) => {
    const { BrowserProvider } = await import("ethers");
    return new BrowserProvider(eth).getSigner(addr);
  };

  it("wallet: connect, address, chain detection, network checks", async () => {
    // Hardhat's node lacks the wallet-only eth_requestAccounts; answer it like an unlocked wallet does.
    const walletEth = { request: (a) => eth.request(a.method === "eth_requestAccounts" ? { method: "eth_accounts" } : a) };
    const w = await lib.connectWallet(walletEth);
    expect(w.address).to.equal(admin.address);
    expect(w.chainId).to.equal(31337);
    expect(w.isMstTestnet).to.equal(false);
    expect(await lib.getConnectedAddress(eth)).to.equal(admin.address);
    expect(await lib.isMstTestnet(eth)).to.equal(false);
    expect(await lib.isMstTestnet(eth, localNet)).to.equal(true);
    expect(await lib.requireMstTestnet(eth, { network: localNet })).to.equal(31337);
    await expect(lib.requireMstTestnet(eth, { autoSwitch: false })).to.be.rejectedWith(/Wrong network/);
    await expect(lib.requireMstTestnet(eth)).to.be.rejectedWith(lib.WalletError);
    expect(() => lib.getInjectedProvider(undefined)).to.throw(/No EIP-1193 wallet/);
  });

  it("wallet: switch flow adds MST Testnet on 4902 and re-checks chain", async () => {
    const calls = [];
    let chain = "0x7a69";
    const wallet = {
      request: async ({ method, params }) => {
        calls.push(method);
        if (method === "eth_chainId") return chain;
        if (method === "wallet_switchEthereumChain") {
          if (!calls.includes("wallet_addEthereumChain")) throw Object.assign(new Error("unknown chain"), { code: 4902 });
          chain = params[0].chainId;
          return null;
        }
        if (method === "wallet_addEthereumChain") {
          expect(params[0].chainId).to.equal(lib.MST_TESTNET.chainIdHex);
          expect(params[0].rpcUrls).to.deep.equal(lib.MST_TESTNET.rpcUrls);
          chain = params[0].chainId;
          return null;
        }
        throw new Error(`unexpected ${method}`);
      },
    };
    expect(await lib.switchToMstTestnet(wallet)).to.equal(91562037);
    expect(calls).to.include("wallet_addEthereumChain");
  });

  it("wallet: account and chain change subscriptions", async () => {
    const seen = [];
    const offA = lib.onAccountsChanged(eth, (a) => seen.push(["acct", a]));
    const offC = lib.onChainChanged(eth, (id, ok) => seen.push(["chain", id, ok]));
    eth.emit("accountsChanged", [player.address]);
    eth.emit("accountsChanged", []);
    eth.emit("chainChanged", lib.MST_TESTNET.chainIdHex);
    offA();
    offC();
    eth.emit("accountsChanged", [attacker.address]);
    expect(seen).to.deep.equal([["acct", player.address], ["acct", null], ["chain", 91562037, true]]);
  });

  it("full flow: register -> submit -> verify -> reward, with receipts + events + state", async () => {
    const adminC = lib.getContracts(await libSigner(admin.address), addresses);
    const playerC = lib.getContracts(await libSigner(player.address), addresses);
    const attackerC = lib.getContracts(await libSigner(attacker.address), addresses);

    const reg = await lib.registerChallenge(adminC, "case-001", lib.hashContent({ b: 2, a: 1 }));
    expect(reg.event.name).to.equal("ChallengeRegistered");
    expect(lib.hashContent({ a: 1, b: 2 })).to.equal(lib.hashContent({ b: 2, a: 1 }));
    expect((await lib.getChallenge(playerC, "case-001")).statusName).to.equal("Active");
    await expect(lib.registerChallenge(adminC, "case-001", ethers.id("x"))).to.be.rejectedWith(/ChallengeAlreadyRegistered/);
    await expect(lib.registerChallenge(attackerC, "case-002", ethers.id("x"))).to.be.rejectedWith(/AccessControlUnauthorizedAccount/);

    const opening = { solution: "my-answer" };
    const { salt, solutionCommitment } = lib.createSolutionCommitment({ challengeId: "case-001", wallet: player.address, solution: opening.solution });
    opening.salt = salt;
    const sub = await lib.submitProof(playerC, "case-001", solutionCommitment);
    expect(sub.submitter).to.equal(player.address);
    expect(sub.proofHash).to.equal(lib.computeProofHash("case-001", player.address, solutionCommitment));
    expect(sub.submissionId).to.equal(await lib.computeSubmissionId(playerC, "case-001", player.address, sub.proofHash));
    expect((await lib.getSubmission(playerC, sub.submissionId)).statusName).to.equal("Pending");

    await expect(lib.verifySubmission(attackerC, sub.submissionId, opening)).to.be.rejectedWith(/AccessControlUnauthorizedAccount/);
    await expect(lib.verifySubmission(adminC, sub.submissionId, { solution: "wrong", salt })).to.be.rejectedWith(/ProofMismatch/);
    await expect(lib.distributeReward(adminC, sub.submissionId, 1n)).to.be.rejectedWith(/not verified/);

    const ver = await lib.verifySubmission(adminC, sub.submissionId, opening);
    expect(ver.event.name).to.equal("SubmissionVerified");
    expect(ver.receipt.status).to.equal(1);
    await expect(lib.verifySubmission(adminC, sub.submissionId, opening)).to.be.rejectedWith(/already Verified/);

    const amount = ethers.parseEther("0.25");
    await expect(lib.distributeReward(attackerC, sub.submissionId, amount)).to.be.rejectedWith(/AccessControlUnauthorizedAccount/);
    const before = await ethers.provider.getBalance(player.address);
    const rew = await lib.distributeReward(adminC, sub.submissionId, amount);
    expect(rew.event.name).to.equal("RewardDistributed");
    expect(rew.recipient).to.equal(player.address);
    expect((await ethers.provider.getBalance(player.address)) - before).to.equal(amount);
    await expect(lib.distributeReward(adminC, sub.submissionId, amount)).to.be.rejectedWith(/already rewarded/);

    const rs = await lib.getRewardStatus(playerC, sub.submissionId);
    expect(rs).to.deep.equal({ rewarded: true, amount });
    const vi = await lib.getVaultInfo(playerC);
    expect(vi.totalDistributed).to.equal(amount);
    expect(await lib.getRoles(adminC, admin.address)).to.deep.equal({ challengeAdmin: true, verifier: true, rewardDistributor: true, vaultAdmin: true });
    expect(await lib.getRoles(adminC, player.address)).to.deep.equal({ challengeAdmin: false, verifier: false, rewardDistributor: false, vaultAdmin: false });
  });

  it("backend hooks: verification record, tx confirmation and event catch-up", async () => {
    const adminC = lib.getContracts(await libSigner(admin.address), addresses);
    const playerC = lib.getContracts(await libSigner(player.address), addresses);
    await lib.registerChallenge(adminC, "case-hooks", lib.hashContent("hooks"));
    const opening = { solution: { answer: "hooks" } };
    const c = lib.createSolutionCommitment({ challengeId: "case-hooks", wallet: player.address, solution: opening.solution });
    opening.salt = c.salt;
    const sub = await lib.submitProof(playerC, "case-hooks", c.solutionCommitment);

    // A pending attempt is not a verification.
    const pending = await lib.getVerificationRecord(adminC, sub.submissionId);
    expect(pending.verified).to.equal(false);
    expect(pending.statusName).to.equal("Pending");
    await expect(lib.confirmVerificationTx(adminC, sub.hash)).to.be.rejectedWith(/no matching SubmissionVerified/);
    expect(await lib.getVerificationRecord(adminC, ethers.id("missing"))).to.equal(null);

    const ver = await lib.verifySubmission(adminC, sub.submissionId, opening);
    const conf = await lib.confirmVerificationTx(adminC, ver.hash, { expectedSubmissionId: sub.submissionId });
    expect(conf.verified).to.equal(true);
    expect(conf.submitter).to.equal(player.address);
    expect(conf.challengeId).to.equal(lib.toChallengeId("case-hooks"));
    expect(conf.rewarded).to.equal(false);
    await expect(lib.confirmVerificationTx(adminC, ver.hash, { expectedSubmissionId: ethers.id("other") })).to.be.rejectedWith(/no matching/);
    await expect(lib.confirmVerificationTx(adminC, ethers.id("not-a-tx"))).to.be.rejectedWith(/not mined/);

    const evs = await lib.getVerifiedSubmissionEvents(adminC, { challengeId: "case-hooks" });
    expect(evs).to.have.length(1);
    expect(evs[0]).to.include({ submissionId: sub.submissionId, submitter: player.address, txHash: ver.hash });
    expect(await lib.getVerifiedSubmissionEvents(adminC, { submitter: attacker.address })).to.have.length(0);

    await lib.distributeReward(adminC, sub.submissionId, ethers.parseEther("0.01"));
    const after = await lib.getVerificationRecord(adminC, sub.submissionId);
    expect(after.rewarded).to.equal(true);
    expect(after.rewardAmount).to.equal(ethers.parseEther("0.01"));
  });

  it("copied proof from another wallet is not verifiable; opening never goes on-chain", async () => {
    const adminC = lib.getContracts(await libSigner(admin.address), addresses);
    const playerC = lib.getContracts(await libSigner(player.address), addresses);
    const attackerC = lib.getContracts(await libSigner(attacker.address), addresses);
    await lib.registerChallenge(adminC, "case-copy", lib.hashContent("copy"));
    const opening = { solution: "secret-answer" };
    const c = lib.createSolutionCommitment({ challengeId: "case-copy", wallet: player.address, solution: opening.solution });
    opening.salt = c.salt;
    const victim = await lib.submitProof(playerC, "case-copy", c.solutionCommitment);
    // attacker copies the public commitment AND the public proofHash from the chain
    const copy1 = await lib.submitProof(attackerC, "case-copy", c.solutionCommitment);
    const copy2 = await lib.submitProof(attackerC, "case-copy", victim.proofHash);
    for (const copy of [copy1, copy2]) {
      expect(copy.proofHash).to.not.equal(victim.proofHash);
      expect(lib.checkProofOpening(await lib.getSubmission(adminC, copy.submissionId), opening)).to.equal(false);
      await expect(lib.verifySubmission(adminC, copy.submissionId, opening)).to.be.rejectedWith(/ProofMismatch/);
    }
    expect(lib.checkProofOpening(await lib.getSubmission(adminC, victim.submissionId), opening)).to.equal(true);
    expect(lib.checkProofOpening(await lib.getSubmission(adminC, victim.submissionId), { solutionHash: c.solutionHash, salt: c.salt })).to.equal(true);
    // neither the solution nor the salt appears in the submission transaction calldata
    const tx = await ethers.provider.getTransaction(victim.hash);
    expect(tx.data.toLowerCase()).to.not.include(c.salt.slice(2).toLowerCase());
    expect(tx.data.toLowerCase()).to.not.include(ethers.hexlify(ethers.toUtf8Bytes("secret-answer")).slice(2));
    await lib.verifySubmission(adminC, victim.submissionId, opening);
  });

  it("library pre-checks: self-verification, inactive challenge, repeat completion, owner-only status", async () => {
    const adminC = lib.getContracts(await libSigner(admin.address), addresses);
    const playerC = lib.getContracts(await libSigner(player.address), addresses);
    const attackerC = lib.getContracts(await libSigner(attacker.address), addresses);
    await lib.registerChallenge(adminC, "case-guard", lib.hashContent("guard"));
    expect((await lib.getChallenge(adminC, "case-guard")).owner).to.equal(admin.address);
    await expect(lib.setChallengeStatus(attackerC, "case-guard", lib.ChallengeStatus.Retired)).to.be.rejectedWith(/NotChallengeOwner/);

    const mk = (sol, wallet = player.address) => {
      const c = lib.createSolutionCommitment({ challengeId: "case-guard", wallet, solution: sol });
      return { c, opening: { solution: sol, salt: c.salt } };
    };
    const self = mk("admin-own", admin.address);
    const selfSub = await lib.submitProof(adminC, "case-guard", self.c.solutionCommitment);
    await expect(lib.verifySubmission(adminC, selfSub.submissionId, self.opening)).to.be.rejectedWith(/SelfVerification/);

    const a = mk("a");
    const b = mk("b");
    const subA = await lib.submitProof(playerC, "case-guard", a.c.solutionCommitment);
    const subB = await lib.submitProof(playerC, "case-guard", b.c.solutionCommitment);
    await lib.setChallengeStatus(adminC, "case-guard", lib.ChallengeStatus.Paused);
    await expect(lib.verifySubmission(adminC, subA.submissionId, a.opening)).to.be.rejectedWith(/ChallengeNotActive/);
    await lib.setChallengeStatus(adminC, "case-guard", lib.ChallengeStatus.Active);
    await lib.verifySubmission(adminC, subA.submissionId, a.opening);
    await expect(lib.verifySubmission(adminC, subB.submissionId, b.opening)).to.be.rejectedWith(/AlreadyCompleted/);
    await expect(lib.submitProof(playerC, "case-guard", mk("c").c.solutionCommitment)).to.be.rejectedWith(/AlreadyCompleted/);
  });

  it("client library holds no secrets and never switches network implicitly", async () => {
    const fs = require("fs");
    const path = require("path");
    const dir = path.join(__dirname, "../web3/src");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src, f).to.not.match(/PRIVATE_KEY|process\.env|new Wallet\(|personal_sign|eth_sign|signTypedData|sendTransaction/);
    }
    const calls = [];
    const wallet = { request: async ({ method }) => (calls.push(method), method === "eth_chainId" ? "0x1" : null) };
    await expect(lib.requireMstTestnet(wallet)).to.be.rejectedWith(/Wrong network/);
    expect(calls).to.deep.equal(["eth_chainId"]);
  });

  it("sendAndConfirm fails when the expected event is absent", async () => {
    const adminC = lib.getContracts(await libSigner(admin.address), addresses);
    await expect(
      lib.sendAndConfirm(() => adminC.rewardVault.fund({ value: 1n }), { contract: adminC.rewardVault, event: "RewardDistributed" })
    ).to.be.rejectedWith(/expected RewardDistributed event was not emitted/);
  });

  it("verifyRpcChain rejects a non-MST RPC", async () => {
    const { BrowserProvider } = await import("ethers");
    await expect(lib.verifyRpcChain(new BrowserProvider(eth))).to.be.rejectedWith(/expected MST Testnet/);
  });
});
