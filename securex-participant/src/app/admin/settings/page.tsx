'use client';

import { AdminShell } from '@/components/admin/AdminShell';
import { Settings, ShieldCheck, Bell, Database, Globe } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <AdminShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings size={22} className="text-slate-400" /> Platform Settings
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Global SECUREX platform configuration — managed by platform administrators
          </p>
        </div>

        {/* Settings sections */}
        {[
          {
            icon: ShieldCheck,
            color: '#3b82f6',
            title: 'Verification Engine',
            description: 'Configure verification parameters, timeout thresholds, and scoring rules.',
            items: [
              { label: 'Verification timeout', value: '120 seconds' },
              { label: 'Max retry attempts', value: '3' },
              { label: 'Auto-reject threshold', value: '5 failed attempts' },
            ],
          },
          {
            icon: Globe,
            color: '#7c3aed',
            title: 'MST / Blockchain',
            description: 'Minimum MST requirements and reward configuration.',
            items: [
              { label: 'Min MST for organizations', value: '10 MSTC' },
              { label: 'Network', value: 'MST Blockchain (EVM)' },
              { label: 'Reward wallet', value: '0x...platform (Member 4)' },
            ],
          },
          {
            icon: Database,
            color: '#10b981',
            title: 'Data & Storage',
            description: 'Platform data retention and backup configuration.',
            items: [
              { label: 'Submission retention', value: '2 years' },
              { label: 'Backup frequency', value: 'Daily' },
              { label: 'CDN region', value: 'Global' },
            ],
          },
          {
            icon: Bell,
            color: '#f59e0b',
            title: 'Notifications',
            description: 'Platform-wide notification and alerting configuration.',
            items: [
              { label: 'Alert on verification failure rate >', value: '30%' },
              { label: 'Alert on pending reviews >', value: '50' },
              { label: 'Webhook errors alert', value: 'Enabled' },
            ],
          },
        ].map(({ icon: Icon, color, title, description, items }) => (
          <div key={title} className="sx-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                <Icon size={20} style={{ color }} />
              </div>
              <div>
                <h2 className="font-bold text-white">{title}</h2>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-white/5 pt-4">
              {items.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-white">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600">
              Edit via backend configuration. Frontend changes are reflected after next sync.
            </p>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
