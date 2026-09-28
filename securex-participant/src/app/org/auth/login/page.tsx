'use client';

// ============================================================
// SECUREX — Organization Login Page
// Member 2 — Organization Side Add-On
// Route: /org/auth/login
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, ArrowRight, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useOrg } from '@/lib/context/OrgContext';
import { errorMessage } from '@/lib/api/client';

export default function OrgLoginPage() {
  const router = useRouter();
  const { login } = useOrg();

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
      const { hasOrganization } = await login(email.trim(), password);
      router.push(hasOrganization ? '/org/dashboard' : '/org/setup');
    } catch (err) {
      setError(errorMessage(err, 'Invalid credentials. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-violet-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-72 h-72 bg-cyan-500/6 rounded-full blur-3xl" />
        <div className="absolute top-2/3 left-1/4 w-48 h-48 bg-blue-500/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/15 border border-violet-500/25 mb-4 glow-violet">
            <Building2 size={30} className="text-violet-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-1">
            SECURE<span className="text-violet-400">X</span>
          </h1>
          <p className="text-slate-500 text-sm">Organization / Admin Portal</p>
        </div>

        {/* Card */}
        <div className="sx-card p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">Organization Sign In</h2>
            <p className="text-sm text-slate-500 mt-1">
              Access your organization dashboard to manage security challenges
            </p>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-3 bg-violet-400/8 border border-violet-400/20 rounded-lg p-3">
            <ShieldCheck size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-violet-300">
              This portal is for <strong>organizations and administrators</strong> only. 
              Participants should use the{' '}
              <Link href="/auth/login" className="underline hover:text-violet-200">
                participant login
              </Link>
              .
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-rose-400/10 border border-rose-400/20 rounded-lg p-3">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4" id="org-login-form">
            <div className="sx-input-wrapper">
              <Mail size={16} className="sx-input-leading-icon" />
              <input
                id="org-login-email"
                type="email"
                placeholder="Organization email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sx-input sx-input-icon-left"
                required
                autoComplete="email"
              />
            </div>

            <div className="sx-input-wrapper">
              <Lock size={16} className="sx-input-leading-icon" />
              <input
                id="org-login-password"
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sx-input sx-input-icon-left sx-input-icon-right"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                id="org-toggle-pw"
                onClick={() => setShowPw(!showPw)}
                className="sx-input-trailing-icon"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button
              id="org-login-submit-btn"
              type="submit"
              disabled={loading}
              className="sx-btn w-full"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In as Organization
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500">
            New organization?{' '}
            <Link href="/org/auth/signup" className="text-violet-400 hover:text-violet-300 font-medium">
              Create an account
            </Link>
          </p>

          <div className="text-center">
            <Link
              href="/"
              className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              ← Back to Portal Selection
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
