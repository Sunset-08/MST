import { eq } from "drizzle-orm";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseClient, getSupabaseUrl } from "../config/supabase.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export interface ProfileInput {
  email: string;
  username: string;
  displayName: string;
}

export type SecurexUser = typeof users.$inferSelect;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  githubUsername: string | null;
  role: "participant" | "platform_admin";
  points: number;
  reputation: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  tokenType: string;
}

export function toPublicUser(user: SecurexUser): PublicUser {
  const { id, username, displayName, email, avatarUrl, bio, githubUsername, role,
    points, reputation, level, currentStreak, longestStreak, lastActivityAt,
    createdAt, updatedAt } = user;
  return { id, username, displayName, email, avatarUrl, bio, githubUsername, role,
    points, reputation, level, currentStreak, longestStreak, lastActivityAt,
    createdAt, updatedAt };
}

export async function findSecurexUser(authUserId: string): Promise<SecurexUser | undefined> {
  const [user] = await db.select().from(users).where(eq(users.authUserId, authUserId)).limit(1);
  return user;
}

function profileFromMetadata(authUser: SupabaseUser): ProfileInput | undefined {
  const metadata = authUser.user_metadata as Record<string, unknown> | undefined;
  const username = metadata?.username;
  const displayName = metadata?.display_name;
  if (
    typeof username !== "string" || !/^[a-zA-Z0-9_]{3,24}$/.test(username) ||
    typeof displayName !== "string" || displayName.trim().length < 1 || displayName.length > 80 ||
    !authUser.email
  ) {
    return undefined;
  }
  return { email: authUser.email, username, displayName };
}

/** Keeps identity and email aligned while preserving profile and gamification fields. */
export async function synchronizeAuthUser(
  authUser: SupabaseUser,
  profile?: ProfileInput,
): Promise<SecurexUser> {
  const existing = await findSecurexUser(authUser.id);
  const verifiedEmail = authUser.email ?? profile?.email;
  if (existing) {
    if (verifiedEmail && existing.email !== verifiedEmail) {
      const [updated] = await db.update(users)
        .set({ email: verifiedEmail, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      if (updated) return updated;
    }
    return existing;
  }

  const initialProfile = profile ?? profileFromMetadata(authUser);
  if (!initialProfile || !verifiedEmail) {
    throw new AuthServiceError("AUTH_PROFILE_SETUP_REQUIRED", "Complete profile setup before continuing", 409);
  }

  try {
    const [created] = await db.insert(users).values({
      authUserId: authUser.id,
      email: verifiedEmail,
      username: initialProfile.username,
      displayName: initialProfile.displayName,
    }).returning();
    if (!created) throw new Error("User profile insert returned no row");
    return created;
  } catch (error) {
    // Concurrent requests may create the same profile; retrieve the winner.
    const concurrentUser = await findSecurexUser(authUser.id);
    if (concurrentUser) return concurrentUser;
    if (isUniqueConstraintError(error)) {
      throw new AuthServiceError("AUTH_PROFILE_CONFLICT", "Username or email is already in use", 409);
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class AuthServiceError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "AuthServiceError";
  }
}

function sessionFrom(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  token_type?: string;
} | null): AuthSession | null {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    tokenType: session.token_type ?? "bearer",
  };
}

export async function register(input: ProfileInput & { password: string }) {
  let data, error;
  try {
    const res = await getSupabaseClient().auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { username: input.username, display_name: input.displayName } },
    });
    data = res.data;
    error = res.error;
  } catch (err) {
    throw new AuthServiceError("AUTH_CONFIG_ERROR", "Authentication service is misconfigured or unavailable", 502);
  }

  if (error) {
    if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
      throw new AuthServiceError("AUTH_NETWORK_ERROR", "Unable to connect to the authentication server. Please try again.", 502);
    }
    throw new AuthServiceError("AUTH_REGISTRATION_FAILED", error.message || "Unable to register with these details", 400);
  }

  const session = sessionFrom(data.session);
  let user = null;
  if (session && data?.user) {
    try {
      user = await synchronizeAuthUser(data.user, input);
    } catch (err) {
      if (err instanceof AuthServiceError) throw err;
      throw new AuthServiceError("AUTH_DATABASE_ERROR", "Unable to synchronize profile with the database. Please check configuration.", 502);
    }
  }
  return { user: user ? toPublicUser(user) : null, session, emailConfirmationRequired: !session };
}

export async function login(input: { email: string; password: string }) {
  let data, error;
  try {
    const res = await getSupabaseClient().auth.signInWithPassword(input);
    data = res.data;
    error = res.error;
  } catch (err) {
    throw new AuthServiceError("AUTH_CONFIG_ERROR", "Authentication service is misconfigured or unavailable", 502);
  }

  if (error) {
    if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
      throw new AuthServiceError("AUTH_NETWORK_ERROR", "Unable to connect to the authentication server. Please try again.", 502);
    }
    throw new AuthServiceError("AUTH_INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  if (!data?.user || !data?.session) {
    throw new AuthServiceError("AUTH_INVALID_CREDENTIALS", "Invalid email or password", 401);
  }
  let user;
  try {
    user = await synchronizeAuthUser(data.user);
  } catch (err) {
    if (err instanceof AuthServiceError) throw err;
    throw new AuthServiceError("AUTH_DATABASE_ERROR", "Unable to synchronize profile with the database. Please check configuration.", 502);
  }
  return { user: toPublicUser(user), session: sessionFrom(data.session)! };
}

/** Exchanges a Supabase refresh token for a new session (used by the frontend before access tokens expire). */
export async function refreshSession(refreshToken: string) {
  const { data, error } = await getSupabaseClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    throw new AuthServiceError("AUTH_REFRESH_FAILED", "Session expired; sign in again", 401);
  }
  const user = await synchronizeAuthUser(data.user);
  return { user: toPublicUser(user), session: sessionFrom(data.session)! };
}

export async function verifyAccessToken(accessToken: string): Promise<SupabaseUser> {
  let data, error;
  try {
    const res = await getSupabaseClient().auth.getUser(accessToken);
    data = res.data;
    error = res.error;
  } catch (err) {
    throw new AuthServiceError("AUTH_CONFIG_ERROR", "Authentication service is misconfigured or unavailable", 502);
  }

  if (error || !data?.user) {
    throw new AuthServiceError("AUTH_INVALID_TOKEN", "Invalid or expired access token", 401);
  }
  return data.user;
}

/** Revokes the authenticated Supabase session using GoTrue's logout endpoint. */
export async function logout(accessToken: string): Promise<void> {
  let response;
  try {
    response = await fetch(`${getSupabaseUrl().replace(/\/$/, "")}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: getSupabaseAnonKey(),
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (err) {
    throw new AuthServiceError("AUTH_CONFIG_ERROR", "Authentication service is misconfigured or unavailable", 502);
  }

  if (!response.ok) {
    throw new AuthServiceError("AUTH_LOGOUT_FAILED", "Unable to end the Supabase session", 502);
  }
}
