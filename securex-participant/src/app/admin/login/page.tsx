'use client';

// ============================================================
// SECUREX — Admin Login Page
// Route: /admin/login
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/lib/context/AdminContext';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAdmin();
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
      await login(email, password);
      router.push('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/6 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-red-500/4 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/25 mb-4"
            style={{ boxShadow: '0 0 32px rgba(245,158,11,0.15)' }}>
            <Crown size={30} className="text-amber-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-1">
            SECURE<span className="text-amber-400">X</span>
          </h1>
          <p className="text-slate-500 text-sm">Platform Administration</p>
        </div>

        {/* Card */}
        <div className="sx-card p-8 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white">Admin Sign In</h2>
            <p className="text-sm text-slate-500 mt-1">
              Access the DevArena platform management console
            </p>
          </div>

          {/* Access warning */}
          <div className="flex items-start gap-3 rounded-lg p-3"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <ShieldCheck size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-300/80">
              This portal is restricted to <strong>DevArena platform administrators</strong> only.
              Unauthorized access attempts are logged.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-rose-400/10 border border-rose-400/20 rounded-lg p-3">
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4" id="admin-login-form">
            <div className="sx-input-wrapper">
              <Mail size={16} className="sx-input-leading-icon" />
              <input
                id="admin-login-email"
                type="email"
                placeholder="Admin email"
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
                id="admin-login-password"
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
                id="admin-toggle-pw"
                onClick={() => setShowPw(!showPw)}
                className="sx-input-trailing-icon"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button
              id="admin-login-submit-btn"
              type="submit"
              disabled={loading}
              className="sx-btn w-full"
              style={{ background: 'linear-gradient(135deg, #b45309, #d97706)', color: 'white' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In as Admin
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="text-center">
            <Link
              href="/"
              className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              ← Back to Portal Selection
            </Link>
          </div>
        </div>

        {/* Demo hint */}
        <div className="mt-5 sx-card p-4">
          <p className="text-xs text-slate-500 text-center mb-2 font-semibold uppercase tracking-wide">
            Demo credentials
          </p>
          <div className="text-xs text-slate-600 space-y-1 text-center">
            <p>Email: <span className="text-slate-400 font-mono">admin@securex.platform</span></p>
            <p>Password: <span className="text-slate-400 font-mono">any value</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
