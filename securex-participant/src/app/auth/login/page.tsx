'use client';

// ============================================================
// DevArena — Login Page
// Visual: Cyberpunk security workspace background (Image 1 ref)
// Panel: Dark translucent glass with neon cyan/magenta accents
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { GitBranch, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { errorMessage } from '@/lib/api/client';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const me = await login(email.trim(), password);
      if (me.role === 'platform_admin') router.push('/admin/dashboard');
      else if (me.requirements?.githubConnection && !me.github?.connected) router.push('/auth/onboarding');
      else router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err, 'Sign in failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGitHubLogin() {
    setLoading(true);
    // TODO: Member 3 — signIn('github') from next-auth/react
    await new Promise((r) => setTimeout(r, 500));
    router.push('/dashboard');
  }
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
          style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/4 right-1/3 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,0,180,0.06) 0%, transparent 70%)' }}
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
            style={{ color: '#00d4ff' }}
          >
            // SECURITY CHALLENGE PLATFORM
          </div>
          <h1
            className="text-5xl xl:text-6xl font-black leading-tight"
            style={{ color: '#f1f5f9' }}
          >
            SOLVE.{' '}
            <span style={{ color: '#00d4ff' }}>CONTRIBUTE.</span>
            <br />
            GET REWARDED.
          </h1>
          <p className="text-lg text-slate-400 max-w-md leading-relaxed">
            Hunt real security vulnerabilities in open-source projects. Earn Points, reputation,
            and on-chain MST rewards validated by verified organizations.
          </p>
          {/* Stats teaser */}
          <div className="flex items-center gap-8 pt-4">
            <div>
              <p className="text-2xl font-black" style={{ color: '#00d4ff' }}>100–500</p>
              <p className="text-xs text-slate-500 uppercase tracking-widest">Points / challenge</p>
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
          Backend authentication enforces role access. Selecting a portal does not grant permissions.
        </p>
      </div>

      {/* ── Right: Login panel ── */}
      <div className="flex items-center justify-center w-full lg:w-auto lg:min-w-[440px] xl:min-w-[480px] relative z-10 p-6">
        <div
          className="w-full max-w-md"
          style={{
            background: 'rgba(8, 12, 32, 0.82)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(0, 212, 255, 0.18)',
            borderRadius: '0',
            boxShadow: '0 0 60px rgba(0,212,255,0.06), inset 0 1px 0 rgba(0,212,255,0.1)',
            // Angular/chamfered corner effect
            clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))',
          }}
        >
          {/* Panel header accent */}
          <div
            style={{
              height: '2px',
              background: 'linear-gradient(90deg, #00d4ff, #b400ff, transparent)',
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
                style={{ color: '#00d4ff' }}
              >
                WELCOME BACK
              </p>
              <h2 className="text-2xl font-black text-white">LOG IN TO DEVARENA</h2>
              <p className="text-sm text-slate-500 mt-1">Solve. Contribute. Get Rewarded.</p>
            </div>

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

            {/* Email form */}
            <form onSubmit={handleLogin} className="space-y-4" id="login-form">
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
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(0,212,255,0.15)',
                      borderRadius: '0',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = '1px solid rgba(0,212,255,0.5)';
                      e.currentTarget.style.boxShadow = '0 0 12px rgba(0,212,255,0.08)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = '1px solid rgba(0,212,255,0.15)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
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
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(0,212,255,0.15)',
                      borderRadius: '0',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.border = '1px solid rgba(0,212,255,0.5)';
                      e.currentTarget.style.boxShadow = '0 0 12px rgba(0,212,255,0.08)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = '1px solid rgba(0,212,255,0.15)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    id="toggle-password-btn"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Remember + forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    className="w-4 h-4 flex items-center justify-center transition-all"
                    style={{
                      border: `1px solid ${rememberMe ? '#00d4ff' : 'rgba(255,255,255,0.2)'}`,
                      background: rememberMe ? 'rgba(0,212,255,0.15)' : 'transparent',
                    }}
                    onClick={() => setRememberMe(!rememberMe)}
                  >
                    {rememberMe && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors select-none">
                    Remember me
                  </span>
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs transition-colors"
                  style={{ color: '#00d4ff' }}
                >
                  Forgot password?
                </Link>
              </div>

              {/* Submit */}
              <button
                id="login-submit-btn"
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
                    LOGGING IN...
                  </>
                ) : (
                  <>
                    LOG IN
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-xs text-slate-600 uppercase tracking-widest">OR CONTINUE WITH</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}
