'use client';

// ============================================================
// SECUREX — Organization Sign Up
// Creates a real account (Supabase Auth via the backend) and then the organization it owns.
// ============================================================

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Lock, User, ArrowRight, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { createOrganization } from '@/lib/api/org';
import { errorMessage } from '@/lib/api/client';

export default function OrgSignupPage() {
  const router = useRouter();
  const { register, reload } = useAuth();
  const [form, setForm] = useState({ organization: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmEmail, setConfirmEmail] = useState(false);
  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const username = form.username.trim();
      const result = await register({ email: form.email.trim(), password: form.password, username, displayName: username });
      if (result.emailConfirmationRequired) {
        setConfirmEmail(true);
        return;
      }
      await createOrganization({ name: form.organization.trim() });
      await reload();
      router.push('/org/dashboard');
    } catch (err) {
      setError(errorMessage(err, 'Sign up failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md relative z-10 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/15 border border-violet-500/25 mb-4">
            <Building2 size={26} className="text-violet-400" />
          </div>
          <h1 className="text-3xl font-black text-white">SECURE<span className="text-violet-400">X</span> for Organizations</h1>
          <p className="text-slate-500 text-sm mt-1">Create your organization account</p>
        </div>

        {confirmEmail ? (
          <div className="sx-card p-8 space-y-4 text-center">
            <CheckCircle size={40} className="text-emerald-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">Check your email</h2>
            <p className="text-sm text-slate-400">
              Confirm <strong className="text-white">{form.email}</strong>, then sign in. You will be asked to create your organization on first sign-in.
            </p>
            <Link href="/org/auth/login" className="sx-btn w-full" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
              Go to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="sx-card p-8 space-y-4" id="org-signup-form">
            {error && (
              <div className="bg-rose-400/10 border border-rose-400/20 rounded-lg p-3">
                <p className="text-sm text-rose-400">{error}</p>
              </div>
            )}
            <div className="sx-input-wrapper">
              <Building2 size={16} className="sx-input-leading-icon" />
              <input id="org-signup-name" className="sx-input sx-input-icon-left" placeholder="Organization name" value={form.organization}
                onChange={(e) => update('organization', e.target.value)} required minLength={2} maxLength={100} />
            </div>
            <div className="sx-input-wrapper">
              <User size={16} className="sx-input-leading-icon" />
              <input id="org-signup-username" className="sx-input sx-input-icon-left" placeholder="Your username" value={form.username}
                onChange={(e) => update('username', e.target.value)} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" title="Letters, numbers and underscores" />
            </div>
            <div className="sx-input-wrapper">
              <Mail size={16} className="sx-input-leading-icon" />
              <input id="org-signup-email" type="email" className="sx-input sx-input-icon-left" placeholder="Work email" value={form.email}
                onChange={(e) => update('email', e.target.value)} required autoComplete="email" />
            </div>
            <div className="sx-input-wrapper">
              <Lock size={16} className="sx-input-leading-icon" />
              <input id="org-signup-password" type="password" className="sx-input sx-input-icon-left" placeholder="Password (8+ characters)" value={form.password}
                onChange={(e) => update('password', e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
            <button id="org-signup-submit-btn" type="submit" disabled={loading} className="sx-btn w-full"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
              {loading ? 'Creating…' : <>Create organization <ArrowRight size={16} /></>}
            </button>
            <p className="text-center text-sm text-slate-500">
              Already registered? <Link href="/org/auth/login" className="text-violet-400 hover:text-violet-300 font-medium">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
