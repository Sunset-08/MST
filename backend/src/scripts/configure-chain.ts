/**
 * Copies the recorded MST Testnet deployment into backend/.env so on-chain reward claims work:
 *
 *   1. In blockchain/: npm run deploy:mst        (writes blockchain/deployments/mstTestnet.json)
 *   2. In backend/:    npm run chain:configure
 *
 * It sets MST_* addresses, chain id, RPC and explorer, and copies blockchain/.env's DEPLOYER_PRIVATE_KEY into
 * MST_VERIFIER_PRIVATE_KEY (the deployer holds every contract role on a fresh deployment). Keys are copied
 * file-to-file and never printed. Use a dedicated verifier key in production.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const backendEnv = join(process.cwd(), ".env");
const chainDir = join(process.cwd(), "..", "blockchain");
const deploymentFile = join(chainDir, "deployments", "mstTestnet.json");

if (!existsSync(deploymentFile)) {
  console.error("No blockchain/deployments/mstTestnet.json yet. Deploy first: cd ../blockchain && npm run deploy:mst");
  process.exit(1);
}
const deployment = JSON.parse(readFileSync(deploymentFile, "utf8")) as { chainId: number; addresses: Record<string, string> };
if (deployment.chainId !== 91562037) {
  console.error(`Unexpected chain id ${deployment.chainId}; expected MST Testnet 91562037.`);
  process.exit(1);
}
const chainEnvFile = join(chainDir, ".env");
const chainEnv = existsSync(chainEnvFile) ? readFileSync(chainEnvFile, "utf8") : "";
const verifierKey = process.env.MST_VERIFIER_PRIVATE_KEY
  ?? chainEnv.match(/^VERIFIER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/m)?.[1]
  ?? chainEnv.match(/^DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/m)?.[1];
if (!verifierKey) {
  console.error("No verifier key found (blockchain/.env DEPLOYER_PRIVATE_KEY or VERIFIER_PRIVATE_KEY).");
  process.exit(1);
}

const updates: Record<string, string> = {
  MST_NETWORK: "mst-testnet",
  MST_RPC_URL: "https://testnetrpc.mstblockchain.com",
  MST_CHAIN_ID: String(deployment.chainId),
  MST_EXPLORER_URL: "https://testnet.mstscan.com",
  MST_CHALLENGE_REGISTRY_ADDRESS: deployment.addresses.ChallengeRegistry!,
  MST_SUBMISSION_REGISTRY_ADDRESS: deployment.addresses.SubmissionRegistry!,
  MST_REWARD_CONTRACT_ADDRESS: deployment.addresses.RewardVault!,
  MST_VERIFIER_PRIVATE_KEY: verifierKey,
};

let env = existsSync(backendEnv) ? readFileSync(backendEnv, "utf8") : "";
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${env.replace(/\n*$/, "\n")}${line}\n`;
}
writeFileSync(backendEnv, env, { mode: 0o600 });
console.log("Updated backend/.env:");
for (const key of Object.keys(updates)) console.log(`  ${key}=${key.endsWith("PRIVATE_KEY") ? "<copied, hidden>" : updates[key]}`);
console.log("Restart the backend to apply. Fund the RewardVault if needed; rewards cannot exceed its balance.");
