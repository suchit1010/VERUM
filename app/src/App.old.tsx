import React, { useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import '@solana/wallet-adapter-react-ui/styles.css';
import { RPC_URL } from './utils/constants';
import { useProtocolState } from './hooks/useProtocolState';
import { buildMintBasketTx, buildRedeemBasketTx, buildSvsDepositTx, getAdaptiveCR } from './utils/basket-sdk';
import { Activity, ShieldAlert, ArrowRightLeft, TrendingUp, Droplet, Coins, CircleDollarSign, LineChart } from 'lucide-react';

function InnerApp() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { state, prices, btcConfBps, program, refresh } = useProtocolState();   
  const [tab, setTab] = useState('deposit');     
  const [amount, setAmount] = useState('');
  const [selectedAsset, setSelectedAsset] = useState('XAU');
  const [txStatus, setTxStatus] = useState('idle');
  const [txMsg, setTxMsg] = useState('');

  const { cr, regime, cls } = getAdaptiveCR(btcConfBps);

  const ASSETS = [
    { key: 'XAU', label: 'XAU', name: 'Gold (dUSD1)',      icon: '🥇', priceKey: 'XAU' },
    { key: 'WTI', label: 'WTI', name: 'Crude Oil (dUSD2)', icon: '🛢️', priceKey: 'WTI' },
    { key: 'BTC', label: 'BTC', name: 'Bitcoin (dUSD1)',   icon: '₿',  priceKey: 'BTC' },
    { key: 'XAG', label: 'XAG', name: 'Silver (dUSD1)',    icon: '⚪', priceKey: 'XAG' },
    { key: 'DXY', label: 'DXY', name: 'DXY Index (dUSD2)',  icon: '📊', priceKey: 'DXY' },
    { key: 'RWA', label: 'RWA', name: 'RWA (dUSD1)',       icon: '🏠', priceKey: 'RWA' },
  ];
  
  const ASSET_DECIMALS = { XAU: 6, WTI: 6, BTC: 6, XAG: 6, DXY: 6, RWA: 6 } as Record<string, number>;

  async function doAction() {
    if (!publicKey || !connected || !amount || Number(amount) <= 0) {
      setTxStatus('error');
      setTxMsg('Enter a valid amount and connect your wallet.');
      return;
    }
    if (!sendTransaction) {
      setTxStatus('error');
      setTxMsg('Wallet does not support transaction sending.');
      return;
    }
    setTxStatus('pending');
    setTxMsg(tab === 'deposit' ? 'Submitting SVS-1 deposit...' : tab === 'mint' ? 'Submitting VERUM mint...' : 'Submitting VERUM redeem...');

    try {
      let tx;
      if (tab === 'deposit') {
        tx = await buildSvsDepositTx(connection, publicKey, selectedAsset, Number(amount), ASSET_DECIMALS[selectedAsset] ?? 6, 0);
      } else if (tab === 'mint') {
        if (!program) throw new Error('Protocol program not initialized.');
        tx = await buildMintBasketTx(connection, program, publicKey, Number(amount));
      } else {
        if (!program) throw new Error('Protocol program not initialized.');
        tx = await buildRedeemBasketTx(program, publicKey, Number(amount));
      }

      const signature = await sendTransaction(tx, connection, { skipPreflight: false });
      setTxMsg(`Transaction submitted: ${signature.slice(0, 8)}...`);
      await connection.confirmTransaction(signature, 'confirmed');
      setTxStatus('success');
      setTxMsg(`Confirmed: ${signature}`);
      setAmount('');
      await refresh();
    } catch (error: any) {
      setTxStatus('error');
      setTxMsg(error?.message || 'Transaction failed');
    }
  }

  const selectedPrice = prices[ASSETS.find(a => a.key === selectedAsset)?.priceKey || 'XAU'];
  const usdValue = parseFloat(amount || '0') * (selectedPrice?.price || 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500/30 relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[40%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-amber-500/5 blur-[120px] mix-blend-screen"></div>
        <div className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-600/5 blur-[120px] mix-blend-screen"></div>
      </div>

      <header className="relative z-10 border-b border-white/5 backdrop-blur-md bg-black/20">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-black">V</div>
            <span className="font-bold tracking-widest text-lg">VERUM</span>
            <span className="px-2 py-1 text-xs rounded-full bg-white/5 text-slate-400 border border-white/5 ml-2">Devnet</span>
          </div>
          <div className="flex items-center gap-6">
            {Object.entries(prices).filter(([k]) => k!=='RWA').map(([k,p], i) => (
              <div key={i} className="hidden md:flex flex-col text-xs">
                <span className="text-slate-500">{k}/USD</span>
                <span className="font-mono">${p.price.toFixed(k==='BTC'?0:2)}</span>
              </div>
            ))}
            <WalletMultiButton className="!bg-white/10 hover:!bg-white/20 !transition-colors !h-10 !rounded-lg !font-mono !text-sm border border-white/10" />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-24 grid lg:grid-cols-[1fr_400px] gap-12">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl lg:text-5xl font-light tracking-tight">
              The <span className="text-amber-400 font-semibold">World Reserve</span> Protocol.
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
              A fully on-chain neutral stablecoin pegged to global trade flows. Defended by adaptive collateralization and multi-asset yield.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
              <div className="text-slate-400 text-sm mb-1">Total Minted</div>
              <div className="text-3xl font-mono">{((state?.totalMinted || 0)/1e6).toLocaleString()} <span className="text-lg text-slate-500">VERUM</span></div>
            </div>
            
            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
              <div className="flex justify-between items-start mb-1">
                <div className="text-slate-400 text-sm">Global CR</div>
                <div className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${cls === 'crisis' ? 'bg-red-500/10 text-red-400 border-red-500/20' : cls === 'elevated' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                  {cls === 'crisis' ? <ShieldAlert size={12}/> : <Activity size={12} />}
                  <span className="uppercase tracking-wide">{regime}</span>
                </div>
              </div>
              <div className="text-3xl font-mono">
                {state ? cr.toFixed(1) : cr.toFixed(1)}% 
                <span className="text-lg text-slate-500"> / {cr}% min</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
            <h3 className="text-lg font-medium mb-6">Reserve Composition</h3>
            <div className="space-y-4">
              {[
                { name: 'Crude Oil (WTI)', pct: 25, color: 'bg-blue-500' },
                { name: 'Gold (XAU)', pct: 20, color: 'bg-amber-500' },
                { name: 'Wrapped Bitcoin', pct: 15, color: 'bg-orange-500' },
                { name: 'Silver (XAG)', pct: 15, color: 'bg-slate-400' },
                { name: 'USD / Treasuries', pct: 15, color: 'bg-emerald-500' },
                { name: 'Tokenized RWAs', pct: 10, color: 'bg-rose-500' },
              ].map((w,i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-300">{w.name}</span>
                    <span className="font-mono text-slate-400">{w.pct}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full ${w.color}`} style={{width: `${w.pct}%`}}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 shadow-2xl">
            <div className="flex gap-2 p-1 bg-black/40 rounded-xl mb-6">
              {['deposit', 'mint', 'redeem'].map((t) => (
                <button 
                  key={t}
                  onClick={() => setTab(t as any)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all ${tab === t ? 'bg-white/10 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'deposit' && (
              <div className="mb-6">
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Select Asset</label>
                <div className="grid grid-cols-2 gap-2">
                  {ASSETS.map(a => (
                    <button
                      key={a.key}
                      onClick={() => setSelectedAsset(a.key)}
                      className={`p-3 flex items-center gap-3 rounded-xl border transition-all ${selectedAsset === a.key ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}
                    >
                      <span className="text-xl">{a.icon}</span>
                      <div className="text-left">
                        <div className="text-sm font-medium">{a.label}</div>
                        <div className="text-xs text-slate-500 font-mono">${prices[a.priceKey]?.price?.toFixed(2) || '0.00'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Amount</label>
              <div className="relative">
                <input 
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-2xl font-mono focus:outline-none focus:border-amber-500/50 transition-colors placeholder:text-slate-700"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                  {tab === 'deposit' ? selectedAsset : 'VERUM'}
                </div>
              </div>
              <div className="mt-2 text-right text-xs text-slate-500 font-mono">
                ~ ${usdValue.toLocaleString()} USD
              </div>
            </div>

            <button 
              onClick={doAction}
              disabled={txStatus === 'pending' || !connected}
              className="w-full py-4 rounded-xl font-bold tracking-wide transition-all bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!connected ? 'Connect Wallet First' : txStatus === 'pending' ? 'Processing...' : tab === 'deposit' ? `Deposit ${selectedAsset}` : tab === 'mint' ? 'Generate VERUM' : 'Burn & Redeem'}
            </button>

            {txMsg && (
              <div className={`mt-4 p-3 rounded-lg text-sm flex gap-3 items-start ${txStatus === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-200' : txStatus === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' : 'bg-blue-500/10 border-blue-500/20 text-blue-200'} border`}>
                <div className="min-w-0 break-words font-mono text-xs leading-relaxed">{txMsg}</div>
              </div>
            )}
            
          </div>
          
          <div className="mt-6 p-4 rounded-xl border border-white/5 bg-white/5 flex gap-4 items-center">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
              <ShieldAlert size={20} />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-200 font-medium">Over-collateralized by design.</span> Protocol currently requires {cr}% backing due to {regime} market volatility conditions.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}

export default function App() {
  const AnyConnectionProvider = ConnectionProvider as any;
  const AnyWalletProvider = WalletProvider as any;
  const AnyWalletModalProvider = WalletModalProvider as any;
  return (
    <AnyConnectionProvider endpoint={RPC_URL}>
      <AnyWalletProvider wallets={[new PhantomWalletAdapter()]} autoConnect>
        <AnyWalletModalProvider>
          <InnerApp />
        </AnyWalletModalProvider>
      </AnyWalletProvider>
    </AnyConnectionProvider>
  );
}
