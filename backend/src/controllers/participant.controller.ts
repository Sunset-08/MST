import type { Services } from "../services/index.js";
import { handler, ok } from "../utils/http.js";

const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export function createParticipantController(s: Services) {
  return {
    me: handler(async (req, res) => ok(res, await s.users.me(req.securexUser!))),
    stats: handler(async (req, res) => ok(res, await s.users.stats(req.securexUser!))),
    history: handler(async (req, res) => ok(res, await s.users.history(req.securexUser!))),
    updateMe: handler(async (req, res) => ok(res, await s.users.updateProfile(req.securexUser!.id, req.body))),
    githubConnectStart: handler(async (req, res) => ok(res, await s.githubConnect.start(req.securexUser!))),
    githubConnectPoll: handler(async (req, res) => ok(res, await s.githubConnect.poll(req.securexUser!, req.body))),
    githubDisconnect: handler(async (req, res) => ok(res, await s.githubConnect.disconnect(req.securexUser!))),
    publicProfile: handler(async (req, res) => ok(res, await s.users.publicProfile(param(req.params.username)))),

    listChallenges: handler(async (req, res) => ok(res, await s.challenges.list(req.query, req.securexUser?.id))),
    getChallenge: handler(async (req, res) => ok(res, await s.challenges.get(param(req.params.id), req.securexUser?.id))),
    startChallenge: handler(async (req, res) => {
      const { created, attempt } = await s.challenges.start(param(req.params.id), req.securexUser!);
      ok(res, attempt, created ? 201 : 200);
    }),
    submit: handler(async (req, res) => ok(res, await s.submissions.submit(param(req.params.attemptId), req.securexUser!, req.body), 202)),
    result: handler(async (req, res) => ok(res, await s.submissions.result(param(req.params.submissionId), req.securexUser!))),

    leaderboard: handler(async (req, res) => {
      const board = await s.leaderboard.get(req.query, req.securexUser);
      res.setHeader("X-Total-Count", String(board.total));
      ok(res, board.entries);
    }),
    rewards: handler(async (req, res) => ok(res, await s.rewards.listForUser(req.securexUser!.id))),
    rewardClaimInfo: handler(async (req, res) => ok(res, await s.rewards.claimInfo(req.securexUser!.id, param(req.params.id)))),
    rewardClaim: handler(async (req, res) => ok(res, await s.rewards.claim(req.securexUser!.id, param(req.params.id), req.body))),

    listWallets: handler(async (req, res) => ok(res, await s.wallets.list(req.securexUser!.id))),
    walletChallenge: handler(async (req, res) => ok(res, await s.wallets.createChallenge(req.securexUser!, req.body))),
    walletVerify: handler(async (req, res) => ok(res, await s.wallets.verifyAndLink(req.securexUser!, req.body), 201)),
    walletPrimary: handler(async (req, res) => ok(res, await s.wallets.setPrimary(req.securexUser!.id, param(req.params.id)))),
    walletRemove: handler(async (req, res) => ok(res, await s.wallets.remove(req.securexUser!.id, param(req.params.id)))),
  };
}

export { param };
