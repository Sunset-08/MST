# SECUREX — Blockchain module

Contracts, MST Testnet deployment and the Web3 integration layer. No UI, backend, DB or game logic.

| Path | Purpose |
|---|---|
| `contracts/ChallengeRegistry.sol` | Challenge ID + content hash + status + owner (registrar); `CHALLENGE_ADMIN_ROLE` registers; only the owner (still holding the role) or `DEFAULT_ADMIN_ROLE` changes status |
| `contracts/SubmissionRegistry.sol` | Player wallet submits a solution commitment, bound on-chain to challenge + wallet; only `VERIFIER_ROLE` verifies/rejects once; no self-verification; only Active challenges; one verified completion per wallet per challenge |
| `contracts/RewardVault.sol` | Holds tMSTC; `REWARD_DISTRIBUTOR_ROLE` pays **the verified submitter only**, once per submission, capped; `RewardDistributed` |
| `web3/` (`@securex/web3`) | **Client-safe** library: wallet connect, account/chain events, MST checks + switch, reads, confirmed writes |
| `server/verifier.js` | **Server-only**: signs verify / reward / register with `VERIFIER_PRIVATE_KEY` |
| `deployments/mstTestnet.json` | Recorded addresses (written by deploy) |
| `web3/src/generated/` | ABIs + addresses for the frontend (written by `npm run compile` / deploy) |

MST Testnet: chainId `91562037` (`0x5752035`), RPC `https://testnetrpc.mstblockchain.com`,
explorer `https://testnet.mstscan.com`, faucet `https://faucet.mstblockchain.com`, coin `tMSTC`.

## Run

```bash
npm install
npm test                 # compile + 17 tests (contracts + web3 library)
npm run wallet:new       # creates DEPLOYER_PRIVATE_KEY in .env, prints address to fund
# fund that address with tMSTC at https://faucet.mstblockchain.com (>= ~0.3 tMSTC)
npm run deploy:mst       # deploy + fund vault + record addresses + export for frontend
npm run check:mst        # read-only check of the live deployment
npm run flow:mst         # full on-chain flow: register -> submit -> verify -> reward
```

## Frontend usage

```js
import { connectWallet, requireMstTestnet, onAccountsChanged, onChainChanged,
         getContracts, submitProof, getSubmission, getRewardStatus, hashContent } from "@securex/web3";

const { signer, address } = await connectWallet();  // read-only: requests accounts, sends nothing
await requireMstTestnet();                          // detection only; on a user click: switchToMstTestnet()
const c = getContracts(signer);
// On the user's explicit "Submit" action:
const { solutionCommitment, salt } = createSolutionCommitment({ challengeId: "case-001", wallet: address, solution });
const { submissionId, hash } = await submitProof(c, "case-001", solutionCommitment);
// send { submissionId, solution, salt } to the backend API; solution and salt never go on-chain
// submitProof resolves only after: receipt.status === 1 + SubmissionRecorded event + on-chain Pending state
```

## Backend usage (verifier)

```js
import { createVerifierClient } from "./server/verifier.js";
const v = await createVerifierClient();             // reads VERIFIER_PRIVATE_KEY, checks chain + roles
await v.verifyAndReward(submissionId, { solution, salt }, "0.01"); // opening checked vs on-chain proof first
```

Every write resolves only after a mined receipt with status 1, the expected event in that receipt,
and a read-back of the resulting contract state. A tx hash alone is never reported as success.

## Backend integration (points / leaderboard / streaks are OFF-CHAIN)

Points (Easy 100 / Medium 250 / Hard 500), score, leaderboard, streaks and history live in the backend.
The chain provides only the trusted trigger and the MST reward:

```js
const v = await createVerifierClient();
// 1. On-chain verification. Refuses (no tx) unless { solution, salt } opens THIS submission's proof for its wallet.
const ver = await v.verifySubmission(submissionId, { solution, salt });
// 2. Trusted trigger for points: re-check by tx hash, then award points off-chain, idempotent on submissionId
const rec = await v.confirmVerificationTx(ver.hash, { expectedSubmissionId: submissionId });
//    rec = { submissionId, challengeId, submitter, proofHash, status, verified: true, verifier, reviewedAt, rewarded, rewardAmount, txHash, blockNumber }
// 3. MST testnet reward (mined + RewardDistributed; contract rejects duplicates)
await v.distributeReward(submissionId, "0.01");
// Recovery after a restart: find verifications that have no points yet
const events = await v.getVerifiedSubmissionEvents({ fromBlock });
// Any time: joined read challenge -> submission -> wallet -> verification -> reward
await v.getVerificationRecord(submissionId);
```

Only `status === Verified` counts as success; Pending (attempt) and Rejected never trigger points or rewards.
The client library never submits, verifies, pays, approves or signs on its own: every transaction comes from
an explicit call (`submitProof` by the player; verify/reward only in `server/`).
