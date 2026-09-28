// Client-safe SECUREX Web3 API. Contains no private keys; privileged calls
// (verifySubmission, distributeReward, registerChallenge) need a signer that holds
// the role, which on MST Testnet lives only in the server module (../../server).
export * from "./network.js";
export * from "./wallet.js";
export * from "./contracts.js";
export { deployment } from "./generated/deployment.js";
