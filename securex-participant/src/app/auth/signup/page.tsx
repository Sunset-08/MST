'use client';

// ============================================================
// SECUREX — Signup Page
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, GitBranch, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authRegister } from '@/lib/api/auth';

export default function SignupPage() {
  const router = useRouter();
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
      const result = await authRegister(
        form.email,
        form.password,
        form.username,
        form.username, // displayName defaults to username; user can update in profile
      );
      if (result.emailConfirmationRequired) {
        router.push('/auth/onboarding?confirm=true');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-500/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src="/devarena-logo.jpg"
              alt="DevArena"
              className="h-10 object-contain"
              style={{ filter: 'brightness(1.05)' }}
            />
          </div>
          <p className="text-slate-500 text-sm mt-1">Start your security journey today</p>
        </div>

        <div className="sx-card p-8 space-y-5">
          <button
            id="github-signup-btn"
            onClick={() => { setLoading(true); router.push('/auth/onboarding'); }}
            className="sx-btn sx-btn-secondary w-full gap-3"
          >
            <GitBranch size={18} />
            Continue with GitHub
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-xs text-slate-600">or with email</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" id="signup-form">
            {error && (
              <div className="bg-rose-400/10 border border-rose-400/20 rounded-lg p-3">
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            )}

            <div className="sx-input-wrapper">
              <User size={16} className="sx-input-leading-icon" />
              <input
                id="signup-username"
                type="text"
                placeholder="Username"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                className="sx-input sx-input-icon-left"
                required
                minLength={3}
              />
            </div>

            <div className="sx-input-wrapper">
              <Mail size={16} className="sx-input-leading-icon" />
              <input
                id="signup-email"
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="sx-input sx-input-icon-left"
                required
              />
            </div>

            <div className="sx-input-wrapper">
              <Lock size={16} className="sx-input-leading-icon" />
              <input
                id="signup-password"
                type="password"
                placeholder="Password (8+ characters)"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                className="sx-input sx-input-icon-left"
                required
                minLength={8}
              />
            </div>

            <button
              id="signup-submit-btn"
              type="submit"
              disabled={loading}
              className="sx-btn sx-btn-primary w-full"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </>
              ) : (
                <>Create Account <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="text-xs text-slate-600 text-center">
            By signing up you agree to our Terms of Service and Privacy Policy
          </p>

          <p className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
