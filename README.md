# DevArena

Gamified web3 security platform: organizations publish security challenges from real GitHub issues, participants solve
them, verified solutions earn Points (off-chain) and MST testnet rewards (on-chain).

| Folder | What it is |
|---|---|
| `backend/` | Express + TypeScript API (Supabase Auth + Postgres via Drizzle, GitHub App, verification, gamification, reward claims) |
| `securex-participant/` | Next.js frontend: participant, organization and admin portals |
| `blockchain/` | Solidity contracts (`ChallengeRegistry`, `SubmissionRegistry`, `RewardVault`), MST Testnet deployment, Web3 library |

## Configure

| File | Purpose |
|---|---|
| `backend/.env` | Copy `backend/.env.example`. Needs `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_SIGNING_SECRET`, GitHub App values |
| `securex-participant/.env.local` | `NEXT_PUBLIC_API_URL=http://localhost:3001/api` (match the backend `PORT`) |
| `blockchain/.env` | `DEPLOYER_PRIVATE_KEY` (see `blockchain/README.md`). Never commit it |

Supabase: Authentication -> Providers -> Email. For local testing switch **Confirm email** off (otherwise sign-ups wait
for a confirmation email, and Supabase's default mailer only delivers to project members).

## Run

```sh
# 1. Backend (http://localhost:3001 per backend/.env)
cd backend && npm install
npm run db:push          # applies the schema constraints
npm run seed             # admin + participant + organization (credentials -> backend/.seed-credentials.json)
npm run dev

# 2. Frontend (http://localhost:3000)
cd securex-participant && npm install && npm run dev

# 3. Blockchain (once): deploy, then hand the addresses to the backend
cd blockchain && npm install && npm test
npm run deploy:mst       # needs tMSTC in the deployer wallet (faucet: https://faucet.mstblockchain.com)
cd ../backend && npm run chain:configure && npm run dev
```

## Portals and logins

- Participants: `/auth/signup` (or the seeded participant), then onboarding: connect **GitHub** (required) and link a **wallet** (sign a message).
- Organizations: `/org/auth/signup` or `/org/auth/login`; connect GitHub in Settings, sync repositories/issues, create challenges from an issue.
- Admins: `/admin/login`; admin accounts come from `npm run seed` (or `update users set role = 'platform_admin' ...`).
- Logins only work for accounts that signed up through Supabase; nothing is hard-coded.

## Verify

```sh
cd backend && npm test && npm run typecheck && npm run build   # 70 tests
cd securex-participant && npx tsc --noEmit && npm run build
cd blockchain && npm test                                       # 28 tests
```
