// Deploys ChallengeRegistry, SubmissionRegistry and RewardVault to MST Testnet,
// funds the vault with controlled tMSTC, verifies bytecode + reads, and records addresses.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const { ethers, network } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is not set in .env");
  const { chainId } = await ethers.provider.getNetwork();
  if (network.name === "mstTestnet" && chainId !== 91562037n) throw new Error(`Connected to chain ${chainId}, expected MST Testnet 91562037`);

  const maxReward = ethers.parseEther(process.env.MAX_REWARD_TMSTC || "0.05");
  const funding = ethers.parseEther(process.env.VAULT_FUNDING_TMSTC || "0.2");
  const verifier = process.env.VERIFIER_ADDRESS || deployer.address;

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Network ${network.name} (${chainId}) | deployer ${deployer.address} | balance ${ethers.formatEther(bal)} tMSTC`);
  if (bal === 0n) throw new Error(`Deployer has no tMSTC. Fund ${deployer.address} at https://faucet.mstblockchain.com`);

  const deployed = async (name, args) => {
    const c = await ethers.deployContract(name, args);
    const tx = c.deploymentTransaction();
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error(`${name} deployment reverted (${tx.hash})`);
    const address = await c.getAddress();
    if ((await ethers.provider.getCode(address)) === "0x") throw new Error(`${name} has no code at ${address}`);
    console.log(`${name}: ${address} (tx ${tx.hash}, block ${receipt.blockNumber})`);
    return { c, address, txHash: tx.hash, blockNumber: receipt.blockNumber };
  };

  const challenges = await deployed("ChallengeRegistry", [deployer.address]);
  const submissions = await deployed("SubmissionRegistry", [deployer.address, challenges.address]);
  const vault = await deployed("RewardVault", [deployer.address, submissions.address, maxReward]);

  if (verifier.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await submissions.c.grantRole(await submissions.c.VERIFIER_ROLE(), verifier)).wait();
    await (await vault.c.grantRole(await vault.c.REWARD_DISTRIBUTOR_ROLE(), verifier)).wait();
    console.log(`Granted VERIFIER_ROLE + REWARD_DISTRIBUTOR_ROLE to ${verifier}`);
  }

  if (funding > 0n) {
    const r = await (await vault.c.fund({ value: funding })).wait();
    if (r.status !== 1) throw new Error("Vault funding reverted");
    console.log(`Funded RewardVault with ${ethers.formatEther(funding)} tMSTC (tx ${r.hash})`);
  }

  // Read-back checks against the live deployment.
  if ((await submissions.c.challengeRegistry()) !== challenges.address) throw new Error("SubmissionRegistry wiring mismatch");
  if ((await vault.c.submissionRegistry()) !== submissions.address) throw new Error("RewardVault wiring mismatch");
  if (!(await submissions.c.hasRole(await submissions.c.VERIFIER_ROLE(), verifier))) throw new Error("Verifier role missing");
  console.log(`Vault balance: ${ethers.formatEther(await vault.c.vaultBalance())} tMSTC, max/submission ${ethers.formatEther(maxReward)}`);

  const record = {
    network: network.name,
    chainId: Number(chainId),
    deployer: deployer.address,
    verifier,
    deployedAt: new Date().toISOString(),
    addresses: { ChallengeRegistry: challenges.address, SubmissionRegistry: submissions.address, RewardVault: vault.address },
    transactions: { ChallengeRegistry: challenges.txHash, SubmissionRegistry: submissions.txHash, RewardVault: vault.txHash },
    blocks: { ChallengeRegistry: challenges.blockNumber, SubmissionRegistry: submissions.blockNumber, RewardVault: vault.blockNumber },
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  // A localhost RPC is an offline rehearsal (e.g. HARDHAT_CHAIN_ID=91562037 node): never record it as MST Testnet.
  const isLocal = /localhost|127\.0\.0\.1/.test(network.config.url || "");
  const file = network.name === "mstTestnet" && !isLocal ? "mstTestnet.json" : `${isLocal ? "localRehearsal" : network.name}.json`;
  fs.writeFileSync(path.join(dir, file), JSON.stringify(record, null, 2) + "\n");
  console.log(`Recorded deployments/${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
