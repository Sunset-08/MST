// SERVER-ONLY module: signs privileged SECUREX transactions (challenge registration,
// submission verification, reward distribution) with a key read from the environment.
// Never import this from browser/frontend code.
import { Wallet, parseEther } from "ethers";
import {
  MST_TESTNET,
  getReadProvider,
  verifyRpcChain,
  getContracts,
  getRoles,
  hashContent,
  registerChallenge,
  verifySubmission,
  rejectSubmission,
  distributeReward,
  getSubmission,
  getRewardStatus,
  getVaultInfo,
  getVerificationRecord,
  confirmVerificationTx,
  getVerifiedSubmissionEvents,
} from "../web3/src/index.js";

if (typeof window !== "undefined") {
  throw new Error("server/verifier.js must never run in a browser: it handles a private key.");
}

/**
 * Creates a verifier client bound to MST Testnet.
 * Env: VERIFIER_PRIVATE_KEY (falls back to DEPLOYER_PRIVATE_KEY), MST_TESTNET_RPC_URL (optional).
 */
export async function createVerifierClient({
  privateKey = process.env.VERIFIER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY,
  rpcUrl = process.env.MST_TESTNET_RPC_URL || MST_TESTNET.rpcUrls[0],
  network = MST_TESTNET,
  addresses,
} = {}) {
  if (!privateKey) throw new Error("VERIFIER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) is not set.");
  const provider = getReadProvider(network, rpcUrl);
  await verifyRpcChain(provider, network);
  const wallet = new Wallet(privateKey, provider);
  const contracts = getContracts(wallet, addresses);
  const roles = await getRoles(contracts, wallet.address);

  const requireRole = (flag, name) => {
    if (!roles[flag]) throw new Error(`${wallet.address} lacks ${name} on MST Testnet.`);
  };

  return {
    address: wallet.address,
    wallet,
    contracts,
    roles,
    registerChallenge(challengeId, content) {
      requireRole("challengeAdmin", "CHALLENGE_ADMIN_ROLE");
      const contentHash = typeof content === "string" && /^0x[0-9a-fA-F]{64}$/.test(content) ? content : hashContent(content);
      return registerChallenge(contracts, challengeId, contentHash);
    },
    /** opening: { solution, salt } received from the player off-chain; checked against the on-chain proofHash. */
    verifySubmission(submissionId, opening) {
      requireRole("verifier", "VERIFIER_ROLE");
      return verifySubmission(contracts, submissionId, opening);
    },
    rejectSubmission(submissionId) {
      requireRole("verifier", "VERIFIER_ROLE");
      return rejectSubmission(contracts, submissionId);
    },
    /** amount: bigint wei or decimal tMSTC string such as "0.01". */
    distributeReward(submissionId, amount) {
      requireRole("rewardDistributor", "REWARD_DISTRIBUTOR_ROLE");
      return distributeReward(contracts, submissionId, typeof amount === "string" ? parseEther(amount) : amount);
    },
    /** Verify (if still pending) then pay; both steps confirmed by receipt + event + state. */
    async verifyAndReward(submissionId, opening, amount) {
      const s = await getSubmission(contracts, submissionId);
      if (!s) throw new Error(`Submission ${submissionId} does not exist on-chain.`);
      const verification = s.statusName === "Pending" ? await this.verifySubmission(submissionId, opening) : null;
      const reward = await this.distributeReward(submissionId, amount);
      return { verification, reward };
    },
    getSubmission: (sid) => getSubmission(contracts, sid),
    getRewardStatus: (sid) => getRewardStatus(contracts, sid),
    getVaultInfo: () => getVaultInfo(contracts),
    // Read-only hooks for off-chain points/leaderboard/streaks (backend owns those; nothing here writes them).
    getVerificationRecord: (sid) => getVerificationRecord(contracts, sid),
    confirmVerificationTx: (txHash, opts) => confirmVerificationTx(contracts, txHash, opts),
    getVerifiedSubmissionEvents: (opts) => getVerifiedSubmissionEvents(contracts, opts),
  };
}
