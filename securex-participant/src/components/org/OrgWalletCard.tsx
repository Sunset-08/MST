'use client';

// ============================================================
// SECUREX — Organization Wallet Card
// Member 2 — Organization Side Add-On
//
// Displays:
//   - Connect Wallet state
//   - Wallet address
//
// Does NOT execute blockchain transactions (Member 4 handles that).
// ============================================================

import { useState } from 'react';
import { Wallet, Loader2, ArrowUpRight, Copy, CheckCircle } from 'lucide-react';
import { useOrg } from '@/lib/context/OrgContext';

export function OrgWalletCard() {
  const { wallet, isLoading, connectWallet, disconnectWallet } = useOrg();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  function handleCopyAddress() {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  }

  return (
    <>
      <div
        className="sx-card p-6 space-y-5"
        style={{ border: '1px solid rgba(139, 92, 246, 0.2)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)' }}
            >
              <Wallet size={20} className="text-violet-400" />
            </div>
            <div>
              <h3 className="font-bold text-white">Organization Wallet</h3>
              <p className="text-xs text-slate-500">For future MST reward funding</p>
            </div>
          </div>
        </div>

        {/* State */}
        {wallet ? (
          <div className="space-y-4">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)' }}
            >
              <CheckCircle size={16} className="text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">
                Connected
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                Wallet Address
              </p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs text-slate-300 bg-[var(--sx-bg-elevated)] px-3 py-2 rounded-lg flex-1 truncate">
                  {wallet.address}
                </p>
                <button
                  onClick={handleCopyAddress}
                  className="sx-btn-ghost p-2 rounded-lg"
                  title="Copy wallet address"
                >
                  <Copy size={13} className={copiedAddress ? 'text-emerald-400' : ''} />
                </button>
              </div>
            </div>

            {wallet.network && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  Network
                </p>
                <p className="text-sm font-semibold text-white">{wallet.network}</p>
              </div>
            )}

            <button
              id="org-disconnect-wallet-btn"
              onClick={disconnectWallet}
              disabled={isLoading}
              className="sx-btn sx-btn-secondary w-full"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-sm font-semibold text-slate-400">
                Not connected
              </span>
            </div>
            <p className="text-xs text-slate-500">
              This wallet will be used for future security challenge reward funding.
            </p>

            <button
              id="org-connect-wallet-btn"
              onClick={() => setShowConnectModal(true)}
              disabled={isLoading}
              className="sx-btn w-full"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: 'white',
              }}
            >
              <Wallet size={16} />
              Connect Wallet
              <ArrowUpRight size={16} />
            </button>
          </div>
        )}
      </div>

      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowConnectModal(false)} />
          <div
            className="relative w-full max-w-md sx-card p-6 space-y-5"
            style={{ border: '1px solid rgba(139, 92, 246, 0.3)' }}
          >
            <div>
              <h3 className="text-lg font-bold text-white">Connect Wallet</h3>
              <p className="text-sm text-slate-500 mt-1">
                Enter your organization's public wallet address.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Public Wallet Address
              </label>
              <input
                id="org-wallet-address-input"
                type="text"
                placeholder="0x..."
                className="sx-input font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    setShowConnectModal(false);
                    connectWallet(e.currentTarget.value.trim());
                  }
                }}
              />
              <p className="text-xs text-slate-600">
                Never share your private key or seed phrase.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConnectModal(false)} className="sx-btn sx-btn-secondary flex-1">
                Cancel
              </button>
              <button
                id="org-confirm-wallet-btn"
                onClick={() => {
                  const input = document.getElementById('org-wallet-address-input') as HTMLInputElement;
                  if (input && input.value.trim()) {
                    setShowConnectModal(false);
                    connectWallet(input.value.trim());
                  }
                }}
                className="sx-btn flex-1"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
