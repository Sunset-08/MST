'use client';

// ============================================================
// SECUREX — Onboarding Page (post-signup wizard)
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Wallet, GitBranch, CheckCircle, ArrowRight, Zap } from 'lucide-react';
import { useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

const STEPS = ['profile', 'github', 'wallet', 'done'] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('profile');
  const [profile, setProfile] = useState({ displayName: '', bio: '' });
  const { connect, isPending } = useConnect();

  const stepIndex = STEPS.indexOf(step);

  function next() {
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep) setStep(nextStep);
    else router.push('/dashboard');
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
                i < stepIndex
                  ? 'bg-emerald-400 text-white'
                  : i === stepIndex
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 text-slate-500'
              }`}>
                {i < stepIndex ? <CheckCircle size={16} /> : i + 1}
              </div>
              {i < STEPS.length - 2 && (
                <div className={`w-8 h-px ${i < stepIndex ? 'bg-emerald-400' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Steps */}
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
                    onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                    className="sx-textarea"
                    rows={3}
                  />
                </div>
              </div>

              <button id="onboard-profile-next" onClick={next} className="sx-btn sx-btn-primary w-full">
                Continue <ArrowRight size={16} />
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
                  <h2 className="font-bold text-white">Connect GitHub</h2>
                  <p className="text-xs text-slate-500">Helps verify your contributions to challenge repos</p>
                </div>
              </div>

              <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-400">Verify solutions through GitHub PRs and commits</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-400">Get credit for open source security contributions</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-400">Earn Points only after backend verification</p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  id="onboard-github-connect"
                  onClick={next}
                  className="sx-btn sx-btn-secondary w-full gap-3"
                >
                  <GitBranch size={18} />
                  Connect GitHub Account
                </button>
                <button id="onboard-github-skip" onClick={next} className="sx-btn sx-btn-ghost w-full text-slate-500">
                  Skip for now
                </button>
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
                  <h2 className="font-bold text-white">Connect BridgeKey Wallet</h2>
                  <p className="text-xs text-slate-500">Receive MSTC rewards on the MST Blockchain</p>
                </div>
              </div>

              <div className="bg-emerald-400/5 border border-emerald-400/15 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-amber-400" />
                  <p className="text-sm font-semibold text-white">How rewards work</p>
                </div>
                <p className="text-xs text-slate-400">
                  After a submission is <span className="text-emerald-400 font-semibold">VERIFIED</span> by the backend engine, 
                  you receive both Points (for the leaderboard) and MSTC tokens (on-chain reward) deposited to your wallet.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  id="onboard-wallet-connect"
                  disabled={isPending}
                  onClick={() => {
                    connect({ connector: injected() });
                    setTimeout(next, 1000);
                  }}
                  className="sx-btn sx-btn-primary w-full gap-3"
                >
                  {isPending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Wallet size={18} />
                  )}
                  Connect BridgeKey Wallet
                </button>
                <button id="onboard-wallet-skip" onClick={next} className="sx-btn sx-btn-ghost w-full text-slate-500">
                  Skip — I&apos;ll connect later
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
                <p className="text-slate-400 text-sm">
                  Start solving security challenges and earn Points after each verified submission.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[['Easy', '100'], ['Medium', '250'], ['Hard', '500']].map(([d, p]) => (
                  <div key={d} className="bg-white/3 rounded-xl p-3 border border-white/5">
                    <p className="text-lg font-black text-amber-400">+{p}</p>
                    <p className="text-xs text-slate-500">{d} pts</p>
                  </div>
                ))}
              </div>
              <button
                id="onboard-go-dashboard"
                onClick={() => router.push('/dashboard')}
                className="sx-btn sx-btn-primary w-full sx-btn-lg"
              >
                Go to Dashboard <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
