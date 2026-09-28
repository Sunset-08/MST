'use client';

// ============================================================
// SECUREX — Wallet Button (BridgeKey / injected EVM wallet via wagmi)
// Connect is read-only. Linking a wallet needs an explicit signature (no transaction, no gas).
// ============================================================

import { useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Wallet, ChevronDown, ExternalLink, AlertTriangle, Link2, CheckCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { truncateAddress } from '@/lib/utils';
import { explorerAddressUrl } from '@/lib/chain/mst';
import { useWalletLink } from '@/lib/chain/useWalletLink';

export function WalletButton() {
  const { connect, isPending } = useConnect();
  const w = useWalletLink();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isPending) {
    return (
      <button className="sx-btn sx-btn-sm sx-btn-secondary opacity-60 cursor-not-allowed" disabled>
        <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        Connecting...
      </button>
    );
  }

  if (w.isConnected && w.address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          id="wallet-connected-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          className="sx-btn sx-btn-sm sx-btn-secondary flex items-center gap-1.5"
        >
          <div className={`w-2 h-2 rounded-full ${w.wrongNetwork ? 'bg-amber-400' : w.isLinked ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`} />
          <span className="text-xs font-mono">{truncateAddress(w.address)}</span>
          <ChevronDown size={12} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-10 w-64 sx-card p-1 z-50 animate-fade-in">
            <div className="px-3 py-2 border-b border-white/5 mb-1">
              <p className="text-xs text-slate-500 mb-1">Connected wallet</p>
              <p className="text-xs font-mono text-slate-300 break-all">{w.address}</p>
              <p className={`text-xs mt-1 flex items-center gap-1 ${w.isLinked ? 'text-emerald-400' : 'text-slate-500'}`}>
                {w.isLinked ? <><CheckCircle size={11} /> Linked to your account</> : 'Not linked to your account yet'}
              </p>
            </div>

            {w.wrongNetwork && (
              <button
                id="wallet-switch-network-btn"
                onClick={w.switchNetwork}
                disabled={w.busy !== 'idle'}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
              >
                <AlertTriangle size={12} />
                {w.busy === 'switching' ? 'Switching…' : 'Switch to MST Testnet'}
              </button>
            )}

            {!w.isLinked && (
              <button
                id="wallet-link-btn"
                onClick={() => w.link().then(() => setMenuOpen(false)).catch(() => undefined)}
                disabled={w.busy !== 'idle'}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-300 hover:bg-blue-400/10 rounded-lg transition-colors"
              >
                <Link2 size={12} />
                {w.busy === 'signing' ? 'Waiting for signature…' : 'Link this wallet (sign message)'}
              </button>
            )}

            {w.error && <p className="px-3 py-2 text-xs text-rose-400">{w.error}</p>}

            <a
              href={explorerAddressUrl(w.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <ExternalLink size={12} />
              View on MST Scan
            </a>
            <button
              id="wallet-disconnect-btn"
              onClick={() => { w.disconnect(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      id="wallet-connect-btn"
      onClick={() => connect({ connector: injected() })}
      className="sx-btn sx-btn-sm sx-btn-secondary flex items-center gap-1.5"
    >
      <Wallet size={14} className="text-blue-400" />
      <span className="text-xs">Connect Wallet</span>
    </button>
  );
}
