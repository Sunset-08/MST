'use client';

// ============================================================
// SECUREX — Onboarding Page (post-signup wizard)
// Profile → GitHub (required) → Wallet (link with a signature) → done
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Wallet, GitBranch, CheckCircle, ArrowRight, Zap } from 'lucide-react';
import { useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { GitHubConnect } from '@/components/participant/github/GitHubConnect';
import { updateProfile } from '@/lib/api/profile';
import { errorMessage } from '@/lib/api/client';
import { useAuth } from '@/lib/context/AuthContext';
import { useWalletLink } from '@/lib/chain/useWalletLink';
import { truncateAddress } from '@/lib/utils';

const STEPS = ['profile', 'github', 'wallet', 'done'] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPage() {
  const router = useRouter();
  const { me, status, isReady, reload } = useAuth();
  const [step, setStep] = useState<Step>('profile');
  const [profile, setProfile] = useState({ displayName: '', bio: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { connect, isPending, error: connectError } = useConnect();
  const w = useWalletLink();

  useEffect(() => {
    if (isReady && status === 'anonymous') router.replace('/auth/login');
  }, [isReady, status, router]);

  useEffect(() => {
    if (me) setProfile((p) => ({ displayName: p.displayName || me.displayName || '', bio: p.bio || me.bio || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  const stepIndex = STEPS.indexOf(step);
  const githubRequired = me?.requirements.githubConnection ?? true;
  const githubConnected = Boolean(me?.github.connected);

  function next() {
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep) setStep(nextStep);
    else router.push('/dashboard');
  }

  async function saveProfile() {
    setSaving(true);
    setError('');
    try {
      const patch: { displayName?: string; bio?: string | null } = {};
      if (profile.displayName.trim() && profile.displayName.trim() !== me?.displayName) patch.displayName = profile.displayName.trim();
      if ((profile.bio.trim() || null) !== (me?.bio ?? null)) patch.bio = profile.bio.trim() || null;
      if (Object.keys(patch).length) {
        await updateProfile(patch);
        await reload();
      }
      next();
    } catch (err) {
      setError(errorMessage(err, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  }

  if (!isReady || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <ShieldCheck size={24} className="text-blue-400" />
            <span className="text-2xl font-black text-white">SECURE<span className="text-blue-400">X</span></span>
          </div>
          <h1 className="text-2xl font-bold text-white">Set up your profile</h1>
          <p className="text-slate-500 text-sm mt-1">Get ready to earn Points on security challenges</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {STEPS.slice(0, -1).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < stepIndex ? 'bg-emerald-400 text-white' : i === stepIndex ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-500'
              }`}>
                {i < stepIndex ? <CheckCircle size={16} /> : i + 1}
              </div>
              {i < STEPS.length - 2 && <div className={`w-8 h-px ${i < stepIndex ? 'bg-emerald-400' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        <div className="sx-card p-8">
          {/* Step 1: Profile */}
          {step === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <User size={20} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Your Profile</h2>
                  <p className="text-xs text-slate-500">This is how others will see you on the leaderboard</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Display Name</label>
                  <input
                    id="onboard-display-name"
                    type="text"
                    placeholder="e.g. Alex or @alexsec"
                    value={profile.displayName}
                    maxLength={80}
                    onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))}
                    className="sx-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Bio (optional)</label>
                  <textarea
                    id="onboard-bio"
                    placeholder="Security researcher, web3 enthusiast..."
                    value={profile.bio}
                    maxLength={500}
                    onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                    className="sx-textarea"
                    rows={3}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-rose-400">{error}</p>}
              <button id="onboard-profile-next" onClick={saveProfile} disabled={saving} className="sx-btn sx-btn-primary w-full">
                {saving ? 'Saving…' : <>Continue <ArrowRight size={16} /></>}
              </button>
            </div>
          )}

          {/* Step 2: GitHub */}
          {step === 'github' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                  <GitBranch size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Connect GitHub {githubRequired && <span className="text-rose-400">*</span>}</h2>
                  <p className="text-xs text-slate-500">Required to start challenges and verify your contributions</p>
                </div>
              </div>

              <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
                {[
                  'Verify solutions through GitHub PRs and commits',
                  'Get credit for open source security contributions',
                  'Earn Points only after backend verification',
                ].map((t) => (
                  <div key={t} className="flex items-start gap-3">
                    <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-400">{t}</p>
                  </div>
                ))}
              </div>

              <GitHubConnect />

              <div className="space-y-3">
                <button
                  id="onboard-github-next"
                  onClick={next}
                  disabled={githubRequired && !githubConnected}
                  className="sx-btn sx-btn-primary w-full"
                >
                  Continue <ArrowRight size={16} />
                </button>
                {!githubRequired && !githubConnected && (
                  <button id="onboard-github-skip" onClick={next} className="sx-btn sx-btn-ghost w-full text-slate-500">
                    Skip for now
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Wallet */}
          {step === 'wallet' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <Wallet size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h2 className="font-bold text-white">Connect your Wallet</h2>
                  <p className="text-xs text-slate-500">Receive MST rewards on the MST Blockchain</p>
                </div>
              </div>

              <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-amber-400" />
                  <p className="text-sm font-semibold text-white">How rewards work</p>
                </div>
                <p className="text-xs text-slate-400">
                  After a submission is <span className="text-emerald-400 font-semibold">VERIFIED</span> by the backend you receive Points
                  (for the leaderboard) and an MST reward for your linked wallet. Linking asks you to sign a message; it costs no gas and
                  sends no transaction.
                </p>
              </div>

              <div className="space-y-3">
                {!w.isConnected ? (
                  <button
                    id="onboard-wallet-connect"
                    disabled={isPending}
                    onClick={() => connect({ connector: injected() })}
                    className="sx-btn sx-btn-primary w-full gap-3"
                  >
                    {isPending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Wallet size={18} />}
                    Connect Wallet
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400 text-center">
                      Connected: <span className="font-mono text-slate-200">{w.address && truncateAddress(w.address)}</span>
                    </p>
                    {w.wrongNetwork && (
                      <button id="onboard-wallet-switch" onClick={w.switchNetwork} disabled={w.busy !== 'idle'} className="sx-btn sx-btn-secondary w-full">
                        {w.busy === 'switching' ? 'Switching…' : 'Switch to MST Testnet'}
                      </button>
                    )}
                    {w.isLinked ? (
                      <p className="text-sm text-emerald-400 text-center flex items-center justify-center gap-2">
                        <CheckCircle size={16} /> Wallet linked to your account
                      </p>
                    ) : (
                      <button id="onboard-wallet-link" onClick={() => w.link().catch(() => undefined)} disabled={w.busy !== 'idle'} className="sx-btn sx-btn-primary w-full">
                        {w.busy === 'signing' ? 'Waiting for signature…' : 'Link wallet (sign message)'}
                      </button>
                    )}
                  </div>
                )}
                {(w.error || connectError) && (
                  <p className="text-sm text-rose-400">
                    {w.error ?? (/connector not found|provider/i.test(connectError?.message ?? '') ? 'No wallet found. Install a browser wallet (e.g. BridgeKey or MetaMask) and reload.' : connectError?.message)}
                  </p>
                )}
                <button id="onboard-wallet-next" onClick={next} className={`sx-btn w-full ${w.isLinked ? 'sx-btn-primary' : 'sx-btn-ghost text-slate-500'}`}>
                  {w.isLinked ? <>Continue <ArrowRight size={16} /></> : "Skip — I'll link it later (MST rewards wait for a linked wallet)"}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="space-y-6 text-center animate-fade-in">
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-emerald-400/10 border border-emerald-400/25 flex items-center justify-center">
                  <CheckCircle size={40} className="text-emerald-400" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white mb-2">You&apos;re all set! 🚀</h2>
                <p className="text-slate-400 text-sm">Start solving security challenges and earn Points after each verified submission.</p>
              </div>
              <button id="onboard-go-dashboard" onClick={() => router.push('/dashboard')} className="sx-btn sx-btn-primary w-full sx-btn-lg">
                Go to Dashboard <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
