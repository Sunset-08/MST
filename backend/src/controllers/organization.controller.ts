import type { Services } from "../services/index.js";
import { handler, ok } from "../utils/http.js";
import { param } from "./participant.controller.js";

export function createOrganizationController(s: Services) {
  const ctx = (req: Parameters<Parameters<typeof handler>[0]>[0]) => req.orgContext!;
  return {
    // /api/organizations
    listMine: handler(async (req, res) => ok(res, await s.organizations.listMine(req.securexUser!.id))),
    create: handler(async (req, res) => ok(res, await s.organizations.create(req.securexUser!, req.body), 201)),
    get: handler(async (req, res) => ok(res, await s.organizations.get(param(req.params.id), req.securexUser!))),
    update: handler(async (req, res) => ok(res, await s.organizations.update(param(req.params.id), req.securexUser!, req.body))),
    remove: handler(async (req, res) => ok(res, await s.organizations.remove(param(req.params.id), req.securexUser!))),
    listMembers: handler(async (req, res) => ok(res, await s.organizations.listMembers(param(req.params.id), req.securexUser!))),
    addMember: handler(async (req, res) => ok(res, await s.organizations.addMember(param(req.params.id), req.securexUser!, req.body), 201)),
    updateMember: handler(async (req, res) =>
      ok(res, await s.organizations.updateMember(param(req.params.id), req.securexUser!, param(req.params.userId), req.body))),
    removeMember: handler(async (req, res) =>
      ok(res, await s.organizations.removeMember(param(req.params.id), req.securexUser!, param(req.params.userId)))),

    // /api/org (organization context from X-Organization-Id)
    mstStatus: handler(async (_req, res) => ok(res, s.org.mstStatus())),
    stats: handler(async (req, res) => ok(res, await s.org.stats(ctx(req).organizationId))),
    activity: handler(async (req, res) => ok(res, await s.org.activity(ctx(req).organizationId, req.query))),
    listChallenges: handler(async (req, res) => ok(res, await s.org.listChallenges(ctx(req).organizationId, ctx(req).role, req.query))),
    createChallenge: handler(async (req, res) => ok(res, await s.org.createChallenge(ctx(req).organizationId, ctx(req).role, req.body), 201)),
    updateChallenge: handler(async (req, res) =>
      ok(res, await s.org.updateChallenge(ctx(req).organizationId, ctx(req).role, param(req.params.id), req.body))),
    listSubmissions: handler(async (req, res) => ok(res, await s.org.listSubmissions(ctx(req).organizationId, req.query))),
    reviewSubmission: handler(async (req, res) =>
      ok(res, await s.org.review(ctx(req).organizationId, req.securexUser!.id, param(req.params.id), req.body))),

    githubOverview: handler(async (req, res) => ok(res, await s.github.overview(ctx(req).organizationId))),
    githubInstallUrl: handler(async (req, res) => ok(res, await s.github.installUrl(ctx(req).organizationId, req.securexUser!.id))),
    githubLink: handler(async (req, res) => ok(res, await s.github.linkInstallation(ctx(req).organizationId, req.securexUser!, req.body), 201)),
    githubSync: handler(async (req, res) => ok(res, await s.github.sync(ctx(req).organizationId, req.body))),
    githubIssues: handler(async (req, res) => ok(res, await s.github.listIssues(ctx(req).organizationId, req.query))),
  };
}
