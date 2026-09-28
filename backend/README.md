# SECUREX backend

Express + TypeScript API for SECUREX. Data lives in Supabase Postgres (Drizzle ORM); identity comes from
Supabase Auth. Points, reputation, streaks, levels and the leaderboard are computed here, off-chain. MST
rewards go through a blockchain provider boundary that stays inactive until the reward contract is final.

## Setup

```sh
cd backend
npm install
cp .env.example .env   # then fill in the values (see below)
npm run dev            # tsx watch on http://localhost:4000
```

Production: `npm run build` then `npm start` (runs `dist/server.js`).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Supabase Postgres connection string used by Drizzle |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | yes | Supabase Auth (register/login/token validation). No service-role key is used |
| `PORT` | no | HTTP port (default 4000) |
| `NODE_ENV` | no | `production` enables proxy trust; errors never include stack traces in any mode |
| `CORS_ORIGINS` | prod | Comma-separated allowed origins |
| `PUBLIC_APP_URL` | no | Domain/URI shown in wallet-link messages |
| `APP_SIGNING_SECRET` | for wallets + GitHub install | HMAC key for wallet-link challenges and GitHub install state |
| `GITHUB_APP_ID`, `GITHUB_APP_NAME` | for GitHub | `5112750`, `securexMST` |
| `GITHUB_APP_PRIVATE_KEY_PATH` | for GitHub | Path to the App PEM key (keep under `backend/secrets/`, which is git-ignored) |
| `GITHUB_WEBHOOK_SECRET` | for webhooks | Webhook secret configured in the GitHub App |
| `GITHUB_API_URL`, `GITHUB_API_VERSION` | no | Defaults `https://api.github.com`, `2022-11-28` |
| `MST_*` | later | Blockchain configuration; see "Blockchain" |

Secrets are only read into the process. `GET /api/admin/settings` reports whether each integration is
configured, never the values.

## Database

The schema is `src/db/schema.ts` (Drizzle). This version adds four uniqueness constraints that make the
exactly-once guarantees hold at the database level:

- `submission_attempt_unique` (`submissions.attempt_id`): one submission per attempt
- `verification_submission_unique` (`verifications.submission_id`): one verification per submission
- `reputation_event_submission_type_unique` (`reputation_events.submission_id, event_type`): points/reputation recorded once
- `reward_submission_unique` (`rewards.submission_id`): one MST reward per submission

Apply them with `npm run db:push`. The code does not depend on them to be correct (it also uses row
locks and status guards), so the API works before they are applied. Other scripts: `npm run db:check`,
`npm run db:generate`.

## Supabase Auth

Email/password auth is handled by Supabase Auth (unchanged). `POST /api/auth/register|login|logout` and
`GET /api/auth/me`. Every protected call sends `Authorization: Bearer <accessToken>`; the token is
validated with Supabase on each request and mapped to the `users` row via `users.auth_user_id`. Roles
come only from the database (`users.role`, `organization_members.role`), never from the client.

## Authorization

- **Participant routes** need a valid token.
- **Organization routes** need membership. For `/api/org/*`, send `X-Organization-Id` when the user
  belongs to more than one organization. Non-members get 404 (no enumeration). Owners and admins manage
  challenges, reviews and GitHub. Members read.
- **Admin routes** (`/api/admin/*`) need `users.role = platform_admin`. Promote a user with
  `UPDATE users SET role = 'platform_admin' WHERE email = '...'`.
- Organization members cannot attempt their own organization's challenges. Reviewers cannot review
  their own submissions.

## API

All responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "code", "message" } }`.
Enum values are returned with the frontend labels (`Easy`, `SecurityReport`, `Under Review`, `Processing`, ...).

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Participant | `GET /api/users/me`, `GET /api/users/me/stats`, `GET /api/users/me/history`, `GET /api/users/:username` |
| Challenges | `GET /api/challenges?search&difficulty&category&status&page&limit`, `GET /api/challenges/:id`, `POST /api/challenges/:id/start` |
| Submissions | `POST /api/attempts/:attemptId/submit` (202 Pending), `GET /api/submissions/:submissionId/result` |
| Leaderboard | `GET /api/leaderboard?period=global\|weekly\|monthly\|organization&organizationId&page&limit` (`X-Total-Count` header) |
| Rewards | `GET /api/rewards` |
| Wallets | `GET /api/wallets`, `POST /api/wallets/challenge`, `POST /api/wallets/verify`, `POST /api/wallets/:id/primary`, `DELETE /api/wallets/:id` |
| Organizations | `GET/POST /api/organizations`, `GET/PUT/DELETE /api/organizations/:id`, `GET/POST /api/organizations/:id/members`, `PUT/DELETE /api/organizations/:id/members/:userId` |
| Org dashboard | `GET /api/org/stats`, `GET /api/org/activity`, `GET/POST /api/org/challenges`, `PUT /api/org/challenges/:id`, `GET /api/org/submissions`, `POST /api/org/submissions/:id/review` |
| Org GitHub | `GET /api/org/github`, `GET /api/org/github/install-url`, `POST /api/org/github/installations`, `POST /api/org/github/sync`, `GET /api/org/github/issues` |
| Admin | `GET /api/admin/{dashboard,users,organizations,challenges,submissions,rewards,github,analytics,settings}`, `POST /api/admin/submissions/:id/review`, `POST /api/admin/rewards/process`, `POST /api/admin/rewards/:id/refresh` |
| Webhooks | `POST /api/webhooks/github` |

Lists are paginated (`page`, `limit` up to 100). Request bodies are validated with Zod (`.strict()`, so
unknown fields are rejected). Bodies are limited to 32 KB, or 256 KB for submissions. Auth and write
endpoints are rate limited.

## Challenges, verification and gamification

- Organizations create challenges (`POST /api/org/challenges`). `challengeConfig` holds `questions`,
  `acceptedAnswers`, `passingScore`, `shortDescription`, `tags` and `expiresAt`. Answer keys are never
  returned to participants. Points default by difficulty (Easy 100, Medium 250, Hard 500, Expert 750);
  reputation is 10/20/40/80. Scoring fields cannot change once a challenge has submissions.
- Verification providers (`src/verification`):
  - `rule_based` grades answers against server-held keys, automatically. It is capped at 5 attempts
    unless `maxAttempts` is set.
  - `admin_review` and `peer_review` are decided by an organization owner/admin or a platform admin
    through the review endpoints.
  - `automated_test` stays **Pending** with a "not configured" reason until a test runner exists.
  - Nothing is ever marked verified without a decision.
- When a submission becomes Verified, one transaction:
  1. locks the submission and the participant;
  2. awards points and reputation once;
  3. updates level, current/longest streak (UTC days) and `last_activity_at`;
  4. writes a `challenge_verified` reputation event;
  5. evaluates achievements;
  6. creates the MST reward when the user has a verified wallet.

  Re-processing, retries and concurrent reviewers are no-ops.
- Activity days come from `challenge_verified` events. The leaderboard ranks by points (global) or by
  points earned in the last 7/30 days (weekly/monthly). The organization leaderboard counts points from
  that organization's challenges and is visible to members only.

## GitHub App (securexMST)

Authentication uses the official GitHub App model through Octokit (`octokit` package): a JWT signed with
the App key, then short-lived installation tokens. Octokit caches those tokens in memory and refreshes
them; they are never stored in the database. The App currently has **Issues: read** and
**Metadata: read**, which is all SECUREX uses.

Flow:
1. An org owner/admin calls `GET /api/org/github/install-url` and opens the returned URL. The URL
   carries a signed `state`.
2. After installing, the client posts `{ installationId, state }` to `POST /api/org/github/installations`.
   The installation must have been created after the state was issued, so pre-existing installations
   cannot be claimed. Platform admins can link without state.
3. `POST /api/org/github/sync` upserts repositories and issues into `repositories` / `github_issues`,
   keyed by GitHub IDs so there are no duplicates. Pull requests are skipped, each sync is capped at 10
   pages per resource, and later syncs are incremental.
4. Issues are imported data only. An organization chooses one when creating a challenge (`githubIssueId`).

GitHub App settings to add when deploying: a **Setup URL** pointing at the frontend page that finishes
step 2, and the webhook below.

## Webhooks

`POST /api/webhooks/github` verifies `X-Hub-Signature-256` (HMAC-SHA256 over the raw body,
constant-time compare) with `GITHUB_WEBHOOK_SECRET`. It returns 503 if the secret is not set, and 401 on
a bad signature; unsigned payloads are never stored. Deliveries are stored in `github_events`, keyed
unique by `X-GitHub-Delivery`, and processed once. Handled events: `issues` (upsert or mark deleted),
`installation_repositories` (add/deactivate), `installation.deleted` (deactivate repos). **Pending:** the
webhook URL and secret must be configured in the GitHub App settings once the backend has a public URL.

## Blockchain (MST rewards)

`src/integrations/blockchain` defines `BlockchainRewardProvider` (`sendReward`, `getTransactionStatus`).
`MstRewardProvider` reads transaction status with standard EVM JSON-RPC (`eth_getTransactionReceipt`)
once `MST_RPC_URL` and `MST_CHAIN_ID` are set. It checks that the RPC's chain ID matches. **Sending is
pending:** it needs the finalized reward contract (`MST_REWARD_CONTRACT_ADDRESS`, `MST_REWARD_CONTRACT_ABI`)
and a `RewardContractAdapter` that calls the contract's real function. SECUREX does not guess function
names, invent addresses, or generate or store private keys.

Reward lifecycle (`rewards.status`): `pending` (API shows Pending) → `submitted` (Processing, tx hash
stored) → `confirmed` (Confirmed, only when the provider reports a successful receipt) or `failed`.
Until the provider is configured, rewards stay Pending and `/api/admin/rewards/process` reports
"blockchain not configured".

## Wallet linking (provider-agnostic, BridgeKey-ready)

1. `POST /api/wallets/challenge { address }` returns an EIP-4361-style `message` (10-minute expiry) and
   an HMAC-signed `challengeToken`.
2. The frontend asks the wallet (BridgeKey or any EIP-1193 wallet) to `personal_sign` the message. This
   is a user action with no transaction and no gas.
3. `POST /api/wallets/verify { address, signature, challengeToken }`: the backend recovers the signer
   and requires it to match the address, the account and the expiry. A wallet verified for another
   account is refused.
4. The backend stores only the public address and `verified_at`. The first wallet becomes primary.
   Verified solves that were waiting for a wallet get their pending reward.

EOA signatures only (EIP-1271 smart-contract wallets are not yet supported). Nothing sensitive (private
keys, seed or recovery phrases) is ever requested or stored.

## Testing

```sh
npm test          # 52 tests: real Postgres semantics via in-memory PGlite, no external services
npm run typecheck # type-checks sources and tests
npm run build
```

Tests replace Supabase Auth, GitHub and the MST chain with in-memory fakes and run the production app
factory (`src/app.ts`) against a fresh PGlite database built from `schema.ts`.

## Pending external configuration

- `GITHUB_WEBHOOK_SECRET` and the webhook URL (needs a deployed backend URL).
- GitHub App Setup URL (frontend page that posts `installationId` + `state`).
- MST reward contract: address, ABI, the function to call and the signing model. After that, implement
  `RewardContractAdapter` and pass it to `MstRewardProvider` in `src/server.ts`.
- `MST_RPC_URL`, `MST_CHAIN_ID`, `MST_EXPLORER_URL` for transaction status.
- An automated-test runner for `automated_test` challenges.
- Organization MST funding (`OrgMstStatus` in the frontend) has no table in the current schema.
