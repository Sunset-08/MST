/**
 * Development seed: creates (through the real Supabase Auth sign-up) an administrator, a participant and an
 * organization owner, then promotes the admin and creates the organization. Nothing is fabricated: every
 * account can only sign in with the password recorded in the git-ignored credentials file.
 *
 *   npm run seed
 *
 * Environment (all optional except when email confirmation is enabled in Supabase):
 *   SEED_ADMIN_EMAIL, SEED_PARTICIPANT_EMAIL, SEED_ORG_EMAIL     real mailboxes if confirmation is on
 *   SEED_ADMIN_PASSWORD, SEED_PARTICIPANT_PASSWORD, SEED_ORG_PASSWORD   generated when unset
 *   SEED_ORG_NAME                                                 default "SECUREX Demo Security"
 *   GITHUB_INSTALLATION_ID                                        link + sync this installation for the org
 *   SEED_ONLY=admin                                               create/promote just the administrator (no participant, no org)
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";
import { closeDatabase, db } from "../db/index.js";
import { users } from "../db/schema.js";
import { MstRewardClaims } from "../integrations/blockchain/mst-claims.js";
import { MstRewardProvider } from "../integrations/blockchain/mst-provider.js";
import { OctokitGitHubAppClient } from "../integrations/github/app-client.js";
import { GitHubDeviceFlowAuth } from "../integrations/github/user-auth.js";
import { requireAuth } from "../security/auth.js";
import { AuthServiceError, login, logout, refreshSession, register, toPublicUser } from "../services/auth.service.js";
import { provisionSeedData } from "../seed/provision.js";

const CREDENTIALS_FILE = join(process.cwd(), ".seed-credentials.json");

type Kind = "admin" | "participant" | "org";
interface Account { kind: Kind; email: string; password: string; username: string; displayName: string }

function fail(message: string): never {
  console.error(`\nSeed aborted: ${message}\n`);
  process.exit(1);
}

async function supabaseSettings() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || /^your_/i.test(url) || /^your_/i.test(key)) {
    fail("SUPABASE_URL and SUPABASE_ANON_KEY must be set in backend/.env (Supabase dashboard → Project Settings → API).");
  }
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: key } }).catch(() => null);
  if (!res?.ok) fail("Could not read Supabase auth settings; check SUPABASE_URL and SUPABASE_ANON_KEY.");
  return (await res.json()) as { mailer_autoconfirm?: boolean; disable_signup?: boolean };
}

function loadAccounts(autoconfirm: boolean): Account[] {
  const saved: Partial<Record<Kind, Account>> = existsSync(CREDENTIALS_FILE)
    ? Object.fromEntries((JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8")) as Account[]).map((a) => [a.kind, a]))
    : {};
  const defs: { kind: Kind; envEmail: string; envPassword: string; email: string; username: string; displayName: string }[] = [
    { kind: "admin", envEmail: "SEED_ADMIN_EMAIL", envPassword: "SEED_ADMIN_PASSWORD", email: "securex.admin@example.com", username: "securex_admin", displayName: "SECUREX Admin" },
    { kind: "participant", envEmail: "SEED_PARTICIPANT_EMAIL", envPassword: "SEED_PARTICIPANT_PASSWORD", email: "securex.participant@example.com", username: "securex_participant", displayName: "SECUREX Participant" },
    { kind: "org", envEmail: "SEED_ORG_EMAIL", envPassword: "SEED_ORG_PASSWORD", email: "securex.org@example.com", username: "securex_org", displayName: "SECUREX Org Owner" },
  ];
  return defs.map((d) => {
    const email = process.env[d.envEmail]?.trim() || saved[d.kind]?.email;
    if (!email && !autoconfirm) {
      fail(`Email confirmation is enabled in Supabase, so ${d.envEmail} must be a real mailbox you can open (or disable "Confirm email" under Authentication → Providers → Email).`);
    }
    const password = process.env[d.envPassword]?.trim() || saved[d.kind]?.password || randomBytes(15).toString("base64url");
    return { kind: d.kind, email: email ?? d.email, password, username: d.username, displayName: d.displayName };
  });
}

/** Signs in, creating the account through the real sign-up first when it does not exist. */
async function ensureAccount(a: Account) {
  try {
    return (await login({ email: a.email, password: a.password })).user;
  } catch (error) {
    if (!(error instanceof AuthServiceError)) throw error;
  }
  const registered = await register({ email: a.email, password: a.password, username: a.username, displayName: a.displayName });
  if (registered.user) return registered.user;
  try {
    return (await login({ email: a.email, password: a.password })).user;
  } catch {
    console.log(`  ! ${a.kind}: ${a.email} needs email confirmation (or already exists with a different password). Confirm it, then run "npm run seed" again.`);
    return null;
  }
}

async function main() {
  const settings = await supabaseSettings();
  if (settings.disable_signup) fail("Sign-ups are disabled in Supabase (Authentication → Sign In / Providers).");
  const onlyAdmin = process.env.SEED_ONLY?.trim() === "admin";
  const everyAccount = loadAccounts(Boolean(settings.mailer_autoconfirm));
  const accounts = onlyAdmin ? everyAccount.filter((a) => a.kind === "admin") : everyAccount;

  console.log(`Supabase email confirmation: ${settings.mailer_autoconfirm ? "off (accounts are usable immediately)" : "ON"}`);
  const profiles = new Map<Kind, { id: string }>();
  for (const a of accounts) {
    const user = await ensureAccount(a);
    if (user) {
      const row = (await db.select().from(users).where(eq(users.email, a.email)).limit(1))[0];
      if (row) profiles.set(a.kind, { id: row.id });
      console.log(`  ✔ ${a.kind}: ${a.email} (signed up${row ? "" : ", profile pending"})`);
    }
  }
  const kept = onlyAdmin && existsSync(CREDENTIALS_FILE)
    ? (JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8")) as Account[]).filter((a) => a.kind !== "admin")
    : [];
  writeFileSync(CREDENTIALS_FILE, JSON.stringify([...kept, ...accounts], null, 2) + "\n", { mode: 0o600 });
  chmodSync(CREDENTIALS_FILE, 0o600);

  const admin = profiles.get("admin");
  const orgOwner = profiles.get("org");
  if (onlyAdmin) {
    if (!admin) console.log("  ! Admin not promoted: the account cannot sign in yet (confirm its email, then run the seed again).");
    else {
      await db.update(users).set({ role: "platform_admin", updatedAt: new Date() }).where(eq(users.id, admin.id));
      console.log("  ✔ admin role granted");
    }
  } else if (admin && orgOwner) {
    const config = loadConfig();
    const github = new OctokitGitHubAppClient(config.github);
    const { services } = createApp({
      db, config, github,
      githubUser: new GitHubDeviceFlowAuth({ clientId: config.github.clientId, apiUrl: config.github.apiUrl, apiVersion: config.github.apiVersion }),
      blockchain: new MstRewardProvider(config.mst), claims: new MstRewardClaims(config.mst, config.signingSecret), authenticate: requireAuth,
      auth: { register, login, logout, refresh: refreshSession, publicUser: toPublicUser }, rateLimit: false,
    });
    const result = await provisionSeedData(services, {
      admin, orgOwner,
      organizationName: process.env.SEED_ORG_NAME?.trim() || "SECUREX Demo Security",
      githubInstallationId: process.env.GITHUB_INSTALLATION_ID?.trim() || undefined,
    });
    console.log(`  ✔ admin role granted; organization ${result.organizationCreated ? "created" : "already present"} (${result.organizationId})`);
    if (result.github) {
      console.log(result.github.linked
        ? `  ✔ GitHub installation linked; ${result.github.repositoriesSynced} repositories and ${result.github.issuesSynced} issues synced`
        : `  ! GitHub not linked: ${result.github.skipped}`);
    }
  } else {
    console.log("  ! Admin/organization provisioning skipped until both accounts can sign in.");
  }
  console.log(`\nCredentials (emails and passwords) are stored in ${CREDENTIALS_FILE} (git-ignored).`);
  console.log("The participant still has to connect GitHub and link a wallet in the app; nothing is pre-connected.");
}

main().then(() => closeDatabase()).catch(async (error) => {
  console.error(`Seed failed: ${(error as Error).message}`);
  await closeDatabase();
  process.exit(1);
});
