'use client';

// ============================================================
// DevArena — Signup Page
// Visual: Cyberpunk security workspace background (matches login)
// Panel: Dark translucent glass with neon cyan/magenta accents
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { GitBranch, Mail, Lock, User, ArrowRight, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { errorMessage } from '@/lib/api/client';
import Image from 'next/image';

export default function SignupPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');

  function update(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const username = form.username.trim();
      const result = await register({
        email: form.email.trim(),
        password: form.password,
        username,
        displayName: username,
      });
      if (result.emailConfirmationRequired) setConfirmEmail(true);
      else router.push('/auth/onboarding');
    } catch (err) {
      setError(errorMessage(err, 'Registration failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  // Shared input focus/blur handlers matching login page style
  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border = '1px solid rgba(0,212,255,0.5)';
    e.currentTarget.style.boxShadow = '0 0 12px rgba(0,212,255,0.08)';
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border = '1px solid rgba(0,212,255,0.15)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div className="min-h-screen flex overflow-hidden relative">
      {/* ── Full-screen cyberpunk background ── */}
      <div className="absolute inset-0">
        <Image
          src="/bg-login.jpg"
          alt="DevArena cyberpunk security workspace"
          fill
          className="object-cover object-center"
          priority
          quality={90}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, rgba(8,10,26,0.4) 0%, rgba(8,10,26,0.1) 45%, rgba(5,8,22,0.2) 100%)',
          }}
        />
        {/* Neon atmospheric glows */}
        <div
          className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(180,0,255,0.08) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/4 right-1/3 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)' }}
        />
      </div>

      {/* ── Left: Branding area ── */}
      <div className="hidden lg:flex flex-col justify-between flex-1 relative z-10 p-12 max-w-[55%]">
        {/* Top — logo */}
        <div>
          <Link href="/" className="inline-block">
            <Image
              src="/devarena-logo.jpg"
              alt="DevArena"
              width={180}
              height={48}
              className="object-contain"
              style={{ filter: 'brightness(1.1)' }}
            />
          </Link>
        </div>

        {/* Center — tagline */}
        <div className="space-y-6">
          <div
            className="text-xs font-bold tracking-[0.3em] uppercase mb-3"
            style={{ color: '#b400ff' }}
          >
            // JOIN THE PLATFORM
          </div>
          <h1
            className="text-5xl xl:text-6xl font-black leading-tight"
            style={{ color: '#f1f5f9' }}
          >
            START{' '}
            <span style={{ color: '#b400ff' }}>HUNTING.</span>
            <br />
            GET REWARDED.
          </h1>
          <p className="text-lg text-slate-400 max-w-md leading-relaxed">
            Create your participant account. Solve real security challenges,
            earn Points, build reputation, and receive on-chain MSTC rewards.
          </p>
          <div className="flex items-center gap-8 pt-4">
            <div>
              <p className="text-2xl font-black" style={{ color: '#00d4ff' }}>Free</p>
              <p className="text-xs text-slate-500 uppercase tracking-widest">To join</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <p className="text-2xl font-black text-violet-400">MSTC</p>
              <p className="text-xs text-slate-500 uppercase tracking-widest">On-chain rewards</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <p className="text-2xl font-black text-emerald-400">3</p>
              <p className="text-xs text-slate-500 uppercase tracking-widest">Difficulty levels</p>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <p className="text-xs text-slate-700">
          Accounts are assigned the participant role. Role cannot be changed from the public signup form.
        </p>
      </div>

      {/* ── Right: Signup panel ── */}
      <div className="flex items-center justify-center w-full lg:w-auto lg:min-w-[440px] xl:min-w-[480px] relative z-10 p-6">
        <div
          className="w-full max-w-md"
          style={{
            background: 'rgba(8, 12, 32, 0.82)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(180, 0, 255, 0.18)',
            borderRadius: '0',
            boxShadow: '0 0 60px rgba(180,0,255,0.06), inset 0 1px 0 rgba(180,0,255,0.1)',
            clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
          }}
        >
          {/* Panel header accent */}
          <div
            style={{
              height: '2px',
              background: 'linear-gradient(90deg, #b400ff, #00d4ff, transparent)',
              borderRadius: '0',
            }}
          />

          <div className="p-8 space-y-6">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-2">
              <Image
                src="/devarena-logo.jpg"
                alt="DevArena"
                width={140}
                height={38}
                className="object-contain"
                style={{ filter: 'brightness(1.1)' }}
              />
            </div>

            {/* Header */}
            <div>
              <p
                className="text-xs font-bold tracking-[0.25em] uppercase mb-2"
                style={{ color: '#b400ff' }}
              >
                CREATE ACCOUNT
              </p>
              <h2 className="text-2xl font-black text-white">JOIN DEVARENA</h2>
              <p className="text-sm text-slate-500 mt-1">Solve. Contribute. Get Rewarded.</p>
            </div>

            {confirmEmail ? (
              /* Email confirmation state */
              <div className="space-y-5 text-center py-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                  style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}
                >
                  <CheckCircle size={28} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">Check your email</h3>
                  <p className="text-sm text-slate-400">
                    We sent a confirmation link to{' '}
                    <strong className="text-white">{form.email}</strong>. Confirm
                    it, then sign in.
                  </p>
                </div>
                <Link
                  href="/auth/login"
                  className="w-full py-3.5 font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-200"
                  style={{
                    background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
                    color: '#000',
                    border: '1px solid rgba(0,212,255,0.4)',
                    clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
                  }}
                >
                  Go to Sign In
                  <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <>
                {/* Error */}
                {error && (
                  <div
                    className="rounded-sm p-3"
                    style={{
                      background: 'rgba(255, 0, 80, 0.08)',
                      border: '1px solid rgba(255, 0, 80, 0.25)',
                    }}
                  >
                    <p className="text-sm text-rose-400">{error}</p>
                  </div>
                )}

                {/* Signup form */}
                <form onSubmit={handleSubmit} className="space-y-4" id="signup-form">
                  {/* Username */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <User
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: '#b400ff' }}
                      />
                      <input
                        id="signup-username"
                        type="text"
                        placeholder="your_handle"
                        value={form.username}
                        onChange={(e) => update('username', e.target.value)}
                        className="w-full pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(0,212,255,0.15)',
                          borderRadius: '0',
                        }}
                        onFocus={inputFocus}
                        onBlur={inputBlur}
                        required
                        minLength={3}
                        maxLength={24}
                        pattern="[A-Za-z0-9_]+"
                        title="Letters, numbers and underscores only"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: '#00d4ff' }}
                      />
                      <input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={(e) => update('email', e.target.value)}
                        className="w-full pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(0,212,255,0.15)',
                          borderRadius: '0',
                        }}
                        onFocus={inputFocus}
                        onBlur={inputBlur}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: '#00d4ff' }}
                      />
                      <input
                        id="signup-password"
                        type="password"
                        placeholder="8+ characters"
                        value={form.password}
                        onChange={(e) => update('password', e.target.value)}
                        className="w-full pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(0,212,255,0.15)',
                          borderRadius: '0',
                        }}
                        onFocus={inputFocus}
                        onBlur={inputBlur}
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    id="signup-submit-btn"
                    type="submit"
                    disabled={loading}
                    className="relative w-full py-3.5 font-bold text-sm uppercase tracking-widest transition-all duration-200 flex items-center justify-center gap-2"
                    style={{
                      background: loading
                        ? 'rgba(0,212,255,0.2)'
                        : 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
                      color: loading ? '#00d4ff' : '#000',
                      border: '1px solid rgba(0,212,255,0.4)',
                      clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
                    }}
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                        CREATING ACCOUNT...
                      </>
                    ) : (
                      <>
                        CREATE ACCOUNT
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>

                {/* Terms */}
                <p className="text-xs text-slate-600 text-center">
                  By signing up you agree to our Terms of Service and Privacy Policy.
                  Your account will be assigned the <span style={{ color: '#00d4ff' }}>participant</span> role.
                </p>

                {/* Sign in link */}
                <p className="text-center text-sm text-slate-500">
                  Already have an account?{' '}
                  <Link
                    href="/auth/login"
                    id="signin-link"
                    className="font-semibold transition-colors"
                    style={{ color: '#00d4ff' }}
                  >
                    Sign in
                  </Link>
                </p>

                {/* Portal back */}
                <div className="text-center">
                  <Link
                    href="/"
                    className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    ← Back to Portal Selection
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
