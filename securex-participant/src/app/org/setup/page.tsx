'use client';

// Organization setup for a signed-in user who does not belong to an organization yet.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { createOrganization } from '@/lib/api/org';
import { errorMessage } from '@/lib/api/client';

export default function OrgSetupPage() {
  const router = useRouter();
  const { status, isReady, me, reload } = useAuth();
  const [form, setForm] = useState({ name: '', description: '', website: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isReady) return;
    if (status === 'anonymous') router.replace('/org/auth/login');
    else if (me && me.organizations.length > 0) router.replace('/org/dashboard');
  }, [isReady, status, me, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await createOrganization({
        name: form.name.trim(),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.website.trim() ? { website: form.website.trim() } : {}),
      });
      await reload();
      router.push('/org/dashboard');
    } catch (err) {
      setError(errorMessage(err, 'Could not create the organization'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="sx-card p-8 w-full max-w-md space-y-4" id="org-setup-form">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/15 border border-violet-500/25">
            <Building2 size={26} className="text-violet-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Create your organization</h1>
          <p className="text-sm text-slate-500">You will be its owner and can invite teammates later.</p>
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <input id="org-setup-name" className="sx-input" placeholder="Organization name" value={form.name} required minLength={2} maxLength={100}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <textarea id="org-setup-description" className="sx-textarea" rows={3} placeholder="What does your organization do? (optional)" value={form.description}
          maxLength={2000} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <input id="org-setup-website" type="url" className="sx-input" placeholder="https://your-site.com (optional)" value={form.website}
          onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
        <button id="org-setup-submit" type="submit" disabled={loading} className="sx-btn w-full"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
          {loading ? 'Creating…' : <>Create organization <ArrowRight size={16} /></>}
        </button>
      </form>
    </div>
  );
}
