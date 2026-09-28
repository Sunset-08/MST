'use client';

// GitHub App "Setup URL" target: GitHub redirects here after the organization installs the securexMST app.
// The signed state (issued by the backend) proves the install was started from this organization.

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { linkGithubInstallation, syncOrgGithub } from '@/lib/api/org';
import { errorMessage } from '@/lib/api/client';
import { useAuth } from '@/lib/context/AuthContext';

function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const { isReady, status } = useAuth();
  const [message, setMessage] = useState('Linking your GitHub installation…');
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!isReady) return;
    if (status === 'anonymous') {
      router.replace('/org/auth/login');
      return;
    }
    if (started.current) return;
    started.current = true;
    const installationId = params.get('installation_id');
    const state = params.get('state') ?? undefined;
    if (!installationId) {
      setFailed(true);
      setMessage('GitHub did not return an installation id. Start the connection again from Settings.');
      return;
    }
    (async () => {
      try {
        const linked = await linkGithubInstallation(installationId, state);
        setMessage(`Linked ${linked.login}. Fetching repositories and issues…`);
        const synced = await syncOrgGithub();
        setMessage(`Connected. Synced ${synced.repositoriesSynced} repositories and ${synced.issuesSynced} issues.`);
        setDone(true);
        setTimeout(() => router.replace('/org/settings'), 1800);
      } catch (err) {
        setFailed(true);
        setMessage(errorMessage(err, 'Could not link the GitHub installation'));
      }
    })();
  }, [isReady, status, params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="sx-card p-8 max-w-md text-center space-y-4">
        {failed ? <AlertTriangle size={36} className="text-rose-400 mx-auto" /> : done ? <CheckCircle size={36} className="text-emerald-400 mx-auto" /> : <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto" />}
        <p className="text-slate-300 text-sm">{message}</p>
        {failed && <button className="sx-btn sx-btn-secondary" onClick={() => router.replace('/org/settings')}>Back to settings</button>}
      </div>
    </div>
  );
}

export default function GithubCallbackPage() {
  return (
    <Suspense fallback={null}>
      <Callback />
    </Suspense>
  );
}
