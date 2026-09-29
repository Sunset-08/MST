'use client';

// ============================================================
// SECUREX — Connect GitHub (participant)
// GitHub OAuth device flow, run by the backend: the participant enters a one-time code on github.com,
// the backend confirms which GitHub account authorized it and records only the username.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { GitBranch, CheckCircle, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import { disconnectGithub, pollGithubConnect, startGithubConnect, type GithubConnectStart } from '@/lib/api/github';
import { useAuth } from '@/lib/context/AuthContext';

type Phase = 'idle' | 'starting' | 'waiting' | 'error';

export function GitHubConnect({ onConnected }: { onConnected?: (username: string) => void }) {
  const { me, reload } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [flow, setFlow] = useState<GithubConnectStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const extraDelay = useRef(0);
  const connected = me?.github.connected ? me.github.username : null;

  async function start() {
    setPhase('starting');
    setError(null);
    extraDelay.current = 0;
    try {
      setFlow(await startGithubConnect());
      setPhase('waiting');
    } catch (err) {
      setError(errorMessage(err, 'Could not start the GitHub connection'));
      setPhase('error');
    }
  }

  useEffect(() => {
    if (phase !== 'waiting' || !flow) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await pollGithubConnect(flow.flowToken);
        if (cancelled) return;
        if (r.status === 'connected') {
          await reload();
          setPhase('idle');
          setFlow(null);
          onConnected?.(r.githubUsername);
          return;
        }
        if (r.status === 'expired' || r.status === 'denied') {
          setError(r.status === 'expired' ? 'The code expired. Start again.' : 'GitHub authorization was denied.');
          setPhase('error');
          return;
        }
        if (r.slowDown) extraDelay.current += 5;
        timer = setTimeout(tick, (flow.interval + extraDelay.current) * 1000);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err, 'Lost contact with the backend while connecting GitHub'));
        setPhase('error');
      }
    };
    timer = setTimeout(tick, flow.interval * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, flow]);

  async function disconnect() {
    await disconnectGithub();
    await reload();
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between gap-3 bg-emerald-400/5 border border-emerald-400/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-white">GitHub connected</p>
            <a href={`https://github.com/${connected}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">
              @{connected}
            </a>
          </div>
        </div>
        <button id="github-disconnect-btn" onClick={disconnect} className="sx-btn sx-btn-ghost sx-btn-sm text-slate-500">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {phase === 'waiting' && flow ? (
        <div className="bg-white/3 border border-white/10 rounded-xl p-4 space-y-3 text-center">
          <p className="text-xs text-slate-500">1. Open GitHub and enter this code</p>
          <div className="flex items-center justify-center gap-2">
            <code id="github-user-code" className="text-2xl font-black tracking-widest text-white">{flow.userCode}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(flow.userCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="sx-btn-ghost p-2 rounded-lg"
              title="Copy code"
            >
              <Copy size={14} className={copied ? 'text-emerald-400' : ''} />
            </button>
          </div>
          <a href={flow.verificationUri} target="_blank" rel="noopener noreferrer" id="github-open-btn" className="sx-btn sx-btn-secondary w-full gap-2">
            <ExternalLink size={16} /> Open github.com/login/device
          </a>
          <p className="text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw size={12} className="animate-spin" /> 2. Waiting for you to authorize…
          </p>
        </div>
      ) : (
        <button
          id="github-connect-btn"
          onClick={start}
          disabled={phase === 'starting'}
          className="sx-btn sx-btn-secondary w-full gap-3"
        >
          <GitBranch size={18} />
          {phase === 'starting' ? 'Starting…' : 'Connect GitHub Account'}
        </button>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
