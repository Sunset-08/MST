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
| `GITHUB_APP_PRIVATE_KEY` | alternative | The PEM itself (literal `\n` allowed) for hosts without a filesystem, e.g. Render; takes precedence over the path |
| `GITHUB_WEBHOOK_SECRET` | for webhooks | Webhook secret configured in the GitHub App |
| `GITHUB_API_URL`, `GITHUB_API_VERSION` | no | Defaults `https://api.github.com`, `2022-11-28` |
| `GITHUB_APP_CLIENT_ID` | for participant GitHub connection | GitHub App client ID (device flow; no secret) |
| `GITHUB_CONNECTION_REQUIRED` | no | `false` lets participants start challenges without GitHub (default `true`) |
| `MST_*` | for rewards | Blockchain configuration; see "Blockchain" |
| `MST_VERIFIER_PRIVATE_KEY` | for rewards | Server-only key with the verifier and reward roles |
| `MST_REWARD_WEI_PER_UNIT` | no | Wei per reward unit (default 0.001 tMSTC) |

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
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me` |
| Participant | `GET /api/users/me`, `GET /api/users/me/stats`, `GET /api/users/me/history`, `GET /api/users/:username` |
| Challenges | `GET /api/challenges?search&difficulty&category&status&page&limit`, `GET /api/challenges/:id`, `POST /api/challenges/:id/start` |
| Submissions | `POST /api/attempts/:attemptId/submit` (202 Pending), `GET /api/submissions/:submissionId/result` |
| Leaderboard | `GET /api/leaderboard?period=global\|weekly\|monthly\|organization&organizationId&page&limit` (`X-Total-Count` header) |
| Rewards | `GET /api/rewards` |
| GitHub (participant) | `POST /api/github/connect/start`, `POST /api/github/connect/poll`, `DELETE /api/github/connect`, `PUT /api/users/me` |
| Claims | `GET /api/rewards/:id/claim-info`, `POST /api/rewards/:id/claim` |
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

Rewards use the deployed SECUREX contracts (`../blockchain`): `ChallengeRegistry`, `SubmissionRegistry`, `RewardVault`.
The vault pays native tMSTC only to a wallet whose on-chain submission was verified, so a reward is claimed in two steps
(`src/integrations/blockchain/mst-claims.ts`):

1. `GET /api/rewards/:id/claim-info`: the backend registers the challenge on-chain if needed and derives a proof
   commitment bound to challenge + wallet + the verified submission content (salt = HMAC of a server secret).
2. The participant's wallet submits it with `submitProof` (an explicit transaction; they only pay gas).
3. `POST /api/rewards/:id/claim { txHash }`: the backend confirms that receipt and its `SubmissionRecorded` event for
   that wallet, verifies the submission on-chain with its verifier key, and calls `distributeReward`. The reward becomes
   **Confirmed** only after the `RewardDistributed` event is seen. Retries are idempotent (no double payment).

Lifecycle (`rewards.status`): `pending` (created; waiting for the claim) → `submitted` (claim running) → `confirmed`.
A failed claim returns to `pending`. If the chain is not configured, claims answer `503 BLOCKCHAIN_NOT_CONFIGURED`.

Setup after deploying the contracts:

```sh
cd ../blockchain && npm run deploy:mst      # needs a funded deployer wallet
cd ../backend && npm run chain:configure    # writes MST_* addresses and the verifier key into .env
```

The verifier key defaults to the deployer key (which holds every role on a fresh deployment); use a dedicated key in
production. Each reward is capped by the vault (`maxRewardPerSubmission`) and by its balance.
`npm run chain:rehearse` runs the whole flow against a local EVM with the real contracts.

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

## Participant GitHub connection

Participants prove they own a GitHub account with the OAuth **device flow** (`src/integrations/github/user-auth.ts`), so
no client secret or callback URL is needed:

1. `POST /api/github/connect/start` returns a one-time `userCode`, the verification URL, and an opaque `flowToken`
   (the device code inside it is encrypted server-side).
2. The participant enters the code at github.com/login/device.
3. The client polls `POST /api/github/connect/poll`; when GitHub authorizes, the backend reads the login name once
   (the user token is discarded) and stores only `users.github_username`. One GitHub account links to one user.

Setup: copy the GitHub App **Client ID** into `GITHUB_APP_CLIENT_ID` and enable **Device Flow** in the App settings.
While `GITHUB_CONNECTION_REQUIRED=true` (default), starting a challenge answers `403 GITHUB_CONNECTION_REQUIRED`
until GitHub is connected.

## Development seed

```sh
npm run seed
```

Creates, through the real Supabase sign-up, an administrator, a participant and an organization owner; promotes the
admin; creates the organization; and, when `GITHUB_INSTALLATION_ID` is set, links and syncs that GitHub installation.
It is idempotent. Passwords are generated (or come from `SEED_*_PASSWORD`) and written to the git-ignored
`.seed-credentials.json`; nothing is printed. If Supabase email confirmation is on, set `SEED_*_EMAIL` to real
mailboxes, confirm them, and run the seed again. The participant is not pre-connected: they must connect GitHub and
link a wallet themselves.

## Testing

```sh
npm test          # 70 tests: real Postgres semantics via in-memory PGlite, no external services
npm run typecheck # type-checks sources and tests
npm run build
```

Tests replace Supabase Auth, GitHub and the MST chain with in-memory fakes and run the production app
factory (`src/app.ts`) against a fresh PGlite database built from `schema.ts`.

## Pending external configuration

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` real values (project settings -> API).
- `GITHUB_APP_CLIENT_ID` (+ Device Flow enabled) for participant GitHub connection.
- `GITHUB_WEBHOOK_SECRET` and the webhook URL (needs a deployed backend URL).
- GitHub App **Setup URL** = `<frontend>/org/github/callback` (finishes the organization install flow).
- A funded MST Testnet deployer wallet to deploy the contracts, then `npm run chain:configure`.
- An automated-test runner for `automated_test` challenges.
- Per-organization MST deposits have no table in the current schema (`MST_ORG_MIN_FUNDING` defaults to 0).
