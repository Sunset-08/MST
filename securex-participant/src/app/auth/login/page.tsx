'use client';

// ============================================================
// SECUREX — Login Page
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, GitBranch, Mail, Lock, Eye, EyeOff, ArrowRight, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // TODO: Member 3 — connect NextAuth credentials provider
      // For demo, redirect directly to dashboard
      await new Promise((r) => setTimeout(r, 800));
      router.push('/dashboard');
    } catch {
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGitBranchLogin() {
    setLoading(true);
    // TODO: Member 3 — signIn('github') from next-auth/react
    await new Promise((r) => setTimeout(r, 500));
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-500/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/25 mb-4 glow-blue">
            <ShieldCheck size={32} className="text-blue-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-1">
            SECURE<span className="text-blue-400">X</span>
          </h1>
          <p className="text-slate-500 text-sm">
            Security challenges. Verified rewards.
          </p>
        </div>

        {/* Card */}
        <div className="sx-card p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in to your participant account</p>
          </div>

          {/* GitHub OAuth */}
          <button
            id="github-login-btn"
            onClick={handleGitBranchLogin}
            disabled={loading}
            className="sx-btn sx-btn-secondary w-full gap-3"
          >
            <GitBranch size={18} />
            Continue with GitHub
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-xs text-slate-600">or sign in with email</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Email form */}
          <form onSubmit={handleLogin} className="space-y-4" id="login-form">
            {error && (
              <div className="bg-rose-400/10 border border-rose-400/20 rounded-lg p-3">
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            )}

            <div className="sx-input-wrapper">
              <Mail size={16} className="sx-input-leading-icon" />
              <input
                id="login-email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sx-input sx-input-icon-left"
                required
              />
            </div>

            <div className="sx-input-wrapper">
              <Lock size={16} className="sx-input-leading-icon" />
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sx-input sx-input-icon-left sx-input-icon-right"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="sx-input-trailing-icon"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <div className="flex justify-end">
              <Link href="/auth/forgot-password" className="text-xs text-blue-400 hover:text-blue-300">
                Forgot password?
              </Link>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="sx-btn sx-btn-primary w-full"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Sign up */}
          <p className="text-center text-sm text-slate-500">
            New to SECUREX?{' '}
            <Link href="/auth/signup" className="text-blue-400 hover:text-blue-300 font-medium">
              Create account
            </Link>
          </p>

          {/* Portal back */}
          <div className="text-center">
            <Link href="/" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              ← Back to Portal Selection
            </Link>
          </div>
        </div>

        {/* Points teaser */}
        <div className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-amber-500" />
            Easy: 100 pts
          </span>
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-amber-500" />
            Medium: 250 pts
          </span>
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-amber-500" />
            Hard: 500 pts
          </span>
        </div>
      </div>
    </div>
  );
}
