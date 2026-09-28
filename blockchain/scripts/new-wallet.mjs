// Generates a testnet deployer key into .env (git-ignored) and prints only the address to fund.
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { Wallet } from "ethers";

const envFile = new URL("../.env", import.meta.url);
const current = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const key = process.argv[2] === "player" ? "PLAYER_PRIVATE_KEY" : "DEPLOYER_PRIVATE_KEY";
const existing = current.match(new RegExp(`^${key}=(0x[0-9a-fA-F]{64})`, "m"));
if (existing) {
  console.log(`${key} already set; address ${new Wallet(existing[1]).address}`);
} else {
  const w = Wallet.createRandom();
  appendFileSync(envFile, `${current && !current.endsWith("\n") ? "\n" : ""}${key}=${w.privateKey}\n`);
  console.log(`${key} written to .env; address ${w.address}`);
}
