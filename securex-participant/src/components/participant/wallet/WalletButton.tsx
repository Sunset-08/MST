'use client';

// ============================================================
// SECUREX — Wallet Button (BridgeKey via wagmi injected)
// ============================================================

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Wallet, ChevronDown, ExternalLink } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { truncateAddress } from '@/lib/utils';

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
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

  if (isConnected && address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          id="wallet-connected-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          className="sx-btn sx-btn-sm sx-btn-secondary flex items-center gap-1.5"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono">{truncateAddress(address)}</span>
          <ChevronDown size={12} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-10 w-48 sx-card p-1 z-50 animate-fade-in">
            <div className="px-3 py-2 border-b border-white/5 mb-1">
              <p className="text-xs text-slate-500 mb-1">BridgeKey Wallet</p>
              <p className="text-xs font-mono text-slate-300">{truncateAddress(address)}</p>
            </div>
            <a
              href={`https://explorer.mstblockchain.com/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <ExternalLink size={12} />
              View on MST Scan
            </a>
            <button
              id="wallet-disconnect-btn"
              onClick={() => { disconnect(); setMenuOpen(false); }}
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
