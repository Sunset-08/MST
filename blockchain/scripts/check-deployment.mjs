// Read-only check of the recorded MST Testnet deployment via the public RPC.
import "dotenv/config";
import { formatEther } from "ethers";
import { MST_TESTNET, deployment, getReadProvider, verifyRpcChain, getContracts, getVaultInfo, addressUrl } from "../web3/src/index.js";

const provider = getReadProvider(MST_TESTNET, process.env.MST_TESTNET_RPC_URL || MST_TESTNET.rpcUrls[0]);
const { chainId, blockNumber } = await verifyRpcChain(provider);
console.log(`RPC OK: chain ${chainId}, block ${blockNumber}`);

const contracts = getContracts(provider);
for (const [name, address] of Object.entries(deployment.addresses)) {
  const code = await provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no bytecode at ${address}`);
  console.log(`${name}: ${address} (${(code.length - 2) / 2} bytes) ${addressUrl(address)}`);
}
if ((await contracts.submissionRegistry.challengeRegistry()).toLowerCase() !== deployment.addresses.ChallengeRegistry.toLowerCase())
  throw new Error("SubmissionRegistry -> ChallengeRegistry wiring mismatch");
if ((await contracts.rewardVault.submissionRegistry()).toLowerCase() !== deployment.addresses.SubmissionRegistry.toLowerCase())
  throw new Error("RewardVault -> SubmissionRegistry wiring mismatch");

const v = await getVaultInfo(contracts);
console.log(`challengeCount=${await contracts.challengeRegistry.challengeCount()} submissionCount=${await contracts.submissionRegistry.submissionCount()}`);
console.log(`vault balance=${formatEther(v.balance)} tMSTC, maxReward=${formatEther(v.maxRewardPerSubmission)}, totalDistributed=${formatEther(v.totalDistributed)}`);
console.log("Deployment readable: OK");
