import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { githubIssues, submissions } from "../db/schema.js";
import type { GitHubPullRequestData, GitHubRepositoryData } from "../integrations/github/types.js";
import { seedOrgWithChallenge, startTestApp, type TestContext } from "./harness.js";

let ctx: TestContext;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.close(); });

const repoOf = (id: string, name: string): GitHubRepositoryData => ({
  id, name, fullName: `pr-org/${name}`, owner: "pr-org", url: `https://github.com/pr-org/${name}`, defaultBranch: "main", archived: false, private: false,
});
const SHA = "a".repeat(20) + "b".repeat(20);
const ISSUE_BODY = "The signer key is read from a world-readable file. Move it to a secret store.";

describe("organization GitHub challenge → participant pull request → real commit SHA", () => {
  let org: Awaited<ReturnType<typeof seedOrgWithChallenge>>;
  let challengeId = "";
  let attemptId = "";
  let participant: Awaited<ReturnType<TestContext["user"]>>;
  const H = () => ({ "X-Organization-Id": org.orgId });
  const orgApi = (method: string, path: string, body?: unknown) => ctx.api(method, path, { token: org.owner.token, headers: H(), body });
  const prAt = (when: Date, overrides: Partial<GitHubPullRequestData> = {}): GitHubPullRequestData => ({
    number: 7, url: "https://github.com/pr-org/app/pull/7", title: "Fix signer key exposure (#1)", body: "Closes #1", state: "open", merged: false,
    author: `gh-${participant.username}`, createdAt: when.toISOString(), baseRepository: "pr-org/app", baseRef: "main",
    headRepository: `gh-${participant.username}/app`, headRef: "fix-signer", headSha: SHA, mergeCommitSha: null,
    changedFiles: ["src/signer.ts", "README.md"], ...overrides,
  });
  const submit = (body: Record<string, unknown>) => ctx.api("POST", `/api/attempts/${attemptId}/submit`, { token: participant.token, body });

  test("organization connects multiple repositories and creates a challenge from an exact issue", async () => {
    org = await seedOrgWithChallenge(ctx);
    const url = await orgApi("GET", "/api/org/github/install-url");
    ctx.github.installations.set("991", {
      id: "991", account: { id: "9991", login: "pr-org", type: "Organization", name: "PR Org", htmlUrl: "https://github.com/pr-org" },
      repositorySelection: "selected", permissions: { issues: "read", pull_requests: "read", metadata: "read" }, createdAt: ctx.clock.now.toISOString(), suspendedAt: null,
    });
    ctx.github.repos.set("991", [repoOf("9101", "app"), repoOf("9102", "lib")]);
    ctx.github.issues.set("pr-org/app", [{
      id: "88001", number: 1, title: "Signer key exposed", body: ISSUE_BODY, author: "reporter", url: "https://github.com/pr-org/app/issues/1",
      state: "open", labels: ["security"], createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z",
    }]);
    const linked = await orgApi("POST", "/api/org/github/installations", { installationId: "991", state: url.body.data.state });
    assert.equal(linked.status, 201, JSON.stringify(linked.body));
    assert.equal((await orgApi("POST", "/api/org/github/sync", { importAll: true })).body.data.repositoriesSynced, 2);
    assert.equal((await orgApi("GET", "/api/org/github")).body.data.repositories.length, 2);

    const [issue] = await ctx.db.select().from(githubIssues).where(eq(githubIssues.githubIssueId, "88001"));
    const created = await orgApi("POST", "/api/org/challenges", {
      title: "Signer key exposure", description: "  Exact statement written by the organization: fix how the signer key is loaded.  ",
      category: "Backend Security", difficulty: "medium", challengeType: "fix", verificationType: "admin_review", mstReward: 5,
      githubIssueId: issue!.id, status: "published",
      challengeConfig: { securityIssue: "Signer key readable by any process", targetFiles: ["src/signer.ts"] },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    challengeId = created.body.data.id;
    assert.equal(created.body.data.githubRepository, "pr-org/app");
    assert.equal(created.body.data.githubIssueNumber, 1);
  });

  test("the challenge appears in the organization list, can be fetched and edited in place", async () => {
    const list = await orgApi("GET", "/api/org/challenges?limit=100");
    const row = list.body.data.data.find((c: any) => c.id === challengeId);
    assert.ok(row, "created challenge is listed for its organization");
    assert.equal(row.githubRepository, "pr-org/app");
    assert.equal(row.status, "published");
    const before = list.body.data.total;

    const one = await orgApi("GET", `/api/org/challenges/${challengeId}`);
    assert.equal(one.status, 200);
    assert.deepEqual(one.body.data.challengeConfig.targetFiles, ["src/signer.ts"]);
    assert.ok(one.body.data.githubRepositoryId);

    const edited = await orgApi("PUT", `/api/org/challenges/${challengeId}`, {
      title: "Signer key exposure (updated)", description: "Updated statement: load the signer key from the secret store.", pointsReward: 300,
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.data.id, challengeId);
    // Re-sending the GitHub issue reference (as the edit form does) must also work and keep the link.
    const withIssue = await orgApi("PUT", `/api/org/challenges/${challengeId}`, { githubIssueId: one.body.data.githubIssueId, status: "published" });
    assert.equal(withIssue.status, 200, JSON.stringify(withIssue.body));
    assert.equal(withIssue.body.data.githubRepository, "pr-org/app");
    const after = await orgApi("GET", "/api/org/challenges?limit=100");
    assert.equal(after.body.data.total, before, "editing must not create a duplicate");
    assert.equal(after.body.data.data.find((c: any) => c.id === challengeId).title, "Signer key exposure (updated)");

    const stranger = await seedOrgWithChallenge(ctx);
    const denied = await ctx.api("GET", `/api/org/challenges/${challengeId}`, { token: stranger.owner.token, headers: { "X-Organization-Id": stranger.orgId } });
    assert.equal(denied.status, 404, "another organization cannot read or edit it");
  });

  test("the participant sees the exact statement, repository, issue with link, and target files", async () => {
    const detail = await ctx.api("GET", `/api/challenges/${challengeId}`);
    assert.equal(detail.status, 200);
    const c = detail.body.data;
    assert.equal(c.description, "Updated statement: load the signer key from the secret store.", "the edited, exact text is what participants read");
    assert.equal(c.githubRepo, "pr-org/app");
    assert.equal(c.githubRepoUrl, "https://github.com/pr-org/app");
    assert.equal(c.githubIssueUrl, "https://github.com/pr-org/app/issues/1");
    assert.equal(c.githubIssue.body, ISSUE_BODY);
    assert.equal(c.githubIssue.title, "Signer key exposed");
    assert.equal(c.githubDefaultBranch, "main");
    assert.equal(c.securityIssue, "Signer key readable by any process");
    assert.deepEqual(c.targetFiles, ["src/signer.ts"]);
    assert.equal(c.submissionMode, "pull_request");
  });

  test("a participant must submit a pull request to the challenge repository; nothing is typed in", async () => {
    participant = await ctx.user("solver");
    const start = await ctx.api("POST", `/api/challenges/${challengeId}/start`, { token: participant.token });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    attemptId = start.body.data.id;
    const later = new Date(ctx.clock.now.getTime() + 60_000);

    const missing = await submit({ patch: "diff --git a/x b/x" });
    assert.equal(missing.body.error.code, "SUBMISSION_INCOMPLETE");
    const oldFields = await submit({ commitHash: "abc1234", repositoryUrl: "https://github.com/pr-org/app" });
    assert.equal(oldFields.status, 400, "a manual commit hash / repository is not accepted");
    const badUrl = await submit({ pullRequestUrl: "https://example.com/pr-org/app/pull/7" });
    assert.equal(badUrl.body.error.code, "PR_URL_INVALID");
    const wrongRepo = await submit({ pullRequestUrl: "https://github.com/pr-org/lib/pull/7" });
    assert.equal(wrongRepo.body.error.code, "PR_REPOSITORY_MISMATCH");
    const unknown = await submit({ pullRequestUrl: "https://github.com/pr-org/app/pull/404" });
    assert.equal(unknown.body.error.code, "PR_NOT_FOUND");

    ctx.github.pulls.set("pr-org/app#7", prAt(later, { author: "someone-else" }));
    assert.equal((await submit({ pullRequestUrl: "https://github.com/pr-org/app/pull/7" })).body.error.code, "PR_AUTHOR_MISMATCH");
    ctx.github.pulls.set("pr-org/app#7", prAt(new Date(ctx.clock.now.getTime() - 86_400_000)));
    assert.equal((await submit({ pullRequestUrl: "https://github.com/pr-org/app/pull/7" })).body.error.code, "PR_PREDATES_CHALLENGE");
    ctx.github.pulls.set("pr-org/app#7", prAt(later, { changedFiles: ["docs/readme.md"] }));
    assert.equal((await submit({ pullRequestUrl: "https://github.com/pr-org/app/pull/7" })).body.error.code, "PR_MISSES_TARGET");
    ctx.github.pulls.set("pr-org/app#7", prAt(later, { state: "closed" }));
    assert.equal((await submit({ pullRequestUrl: "https://github.com/pr-org/app/pull/7" })).body.error.code, "PR_CLOSED");
    ctx.github.pulls.set("pr-org/app#7", prAt(later, { baseRepository: "pr-org/lib" }));
    assert.equal((await submit({ pullRequestUrl: "https://github.com/pr-org/app/pull/7" })).body.error.code, "PR_REPOSITORY_MISMATCH");
    assert.equal((await ctx.db.select().from(submissions)).filter((s) => s.challengeId === challengeId).length, 0, "rejected attempts store nothing");
  });

  test("a valid pull request stores the real commit SHA read from GitHub and verification proceeds", async () => {
    const later = new Date(ctx.clock.now.getTime() + 60_000);
    ctx.github.pulls.set("pr-org/app#7", prAt(later));
    const ok = await submit({ pullRequestUrl: "https://github.com/pr-org/app/pull/7", explanation: "Loaded the key from the secret store." });
    assert.equal(ok.status, 202, JSON.stringify(ok.body));
    assert.equal(ok.body.data.commitSha, SHA);

    const [row] = await ctx.db.select().from(submissions).where(eq(submissions.challengeId, challengeId));
    const data = row!.submissionData as Record<string, unknown>;
    assert.equal(data.commitSha, SHA);
    assert.equal(data.repository, "pr-org/app");
    assert.equal(data.pullRequestNumber, 7);
    assert.equal(data.authorLogin, `gh-${participant.username}`);
    assert.equal(data.referencesIssue, true);
    assert.deepEqual(data.changedFiles, ["src/signer.ts", "README.md"]);
    assert.ok(!("commitHash" in data));
    assert.ok(row!.solutionHash.length === 64, "the solution hash covers the real SHA");

    const review = await orgApi("GET", "/api/org/submissions");
    assert.equal(review.body.data.data[0].submissionData.commitSha, SHA, "the reviewing organization sees the retrieved SHA");
    const approved = await orgApi("POST", `/api/org/submissions/${ok.body.data.submissionId}/review`, { decision: "approve", reason: "Verified the fix in the pull request" });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const result = await ctx.api("GET", `/api/submissions/${ok.body.data.submissionId}/result`, { token: participant.token });
    assert.equal(result.body.data.status, "Verified");
  });

  test("a challenge without a GitHub repository still takes a patch and rejects a pull request URL", async () => {
    const plain = await orgApi("POST", "/api/org/challenges", {
      title: "Patch without repo", description: "Describe and submit a patch for the described flaw.", category: "Web Security", difficulty: "easy",
      challengeType: "fix", verificationType: "admin_review", mstReward: 0, status: "published",
    });
    const solver = await ctx.user("patcher");
    const start = await ctx.api("POST", `/api/challenges/${plain.body.data.id}/start`, { token: solver.token });
    const send = (body: Record<string, unknown>) => ctx.api("POST", `/api/attempts/${start.body.data.id}/submit`, { token: solver.token, body });
    assert.equal((await send({ pullRequestUrl: "https://github.com/pr-org/app/pull/7" })).body.error.code, "SUBMISSION_FIELDS_INVALID");
    assert.equal((await send({ explanation: "no patch" })).body.error.code, "SUBMISSION_INCOMPLETE");
    assert.equal((await send({ patch: "--- a\n+++ b", explanation: "fixed" })).status, 202);
  });
});
