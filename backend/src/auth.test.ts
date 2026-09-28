import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Server } from "node:http";
import { createAuthMiddleware } from "./security/auth.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import type { SecurexUser } from "./services/auth.service.js";

const profile: SecurexUser = {
  id: "securex-user-id",
  authUserId: "supabase-user-id",
  username: "player_one",
  displayName: "Player One",
  email: "player@example.com",
  avatarUrl: null,
  bio: null,
  githubUsername: null,
  role: "participant",
  points: 12,
  reputation: 3,
  level: 1,
  currentStreak: 0,
  longestStreak: 0,
  lastActivityAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  const authenticate = createAuthMiddleware({
    verify: async (token) => {
      if (token !== "valid-token") throw new Error("invalid token");
      return { id: "supabase-user-id" } as SupabaseUser;
    },
    findUser: async (authUserId) => authUserId === profile.authUserId ? profile : undefined,
  });
  app.use("/api/auth", createAuthRouter({
    register: async (input) => ({ user: input.username, session: null, emailConfirmationRequired: true }),
    login: async (input) => ({ user: input.email, session: { accessToken: "token" } }),
    logout: async () => undefined,
    authenticate,
    publicUser: (user) => ({ id: user.id, username: user.username, points: user.points }),
  }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("protected request without a bearer token returns 401", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.status, 401);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "AUTH_REQUIRED");
});

test("invalid bearer token returns 401", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: "Bearer invalid-token" } });
  assert.equal(response.status, 401);
});

test("authenticated /me returns the matching SECUREX profile", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: "Bearer valid-token" } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { data: { user: unknown } }).data.user, {
    id: profile.id, username: profile.username, points: profile.points,
  });
});

test("registration rejects malformed input", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bad", password: "s3cr3t-marked" }),
  });
  assert.equal(response.status, 400);
  const body = await response.text();
  assert.equal(JSON.parse(body).error.code, "VALIDATION_ERROR");
  assert.equal(body.includes("s3cr3t-marked"), false, "validation response must not echo a password value");
});

test("login rejects malformed input", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bad", password: "" }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "VALIDATION_ERROR");
});
