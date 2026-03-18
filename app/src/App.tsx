// app/src/App.tsx
import React, { useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_URL } from "./utils/constants";
import { useProtocolState } from "./hooks/useProtocolState";
import {
  buildMintBasketTx,
  buildRedeemBasketTx,
  buildSvsDepositTx,
  getAdaptiveCR,
} from "./utils/basket-sdk";

// ── Inner app (needs wallet context) ─────────────────────────────────────────

function InnerApp() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { state, prices, btcConfBps, program, refresh } = useProtocolState();
  const [tab, setTab] = useState<"deposit" | "mint" | "redeem">("deposit");
  const [amount, setAmount] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("PAXG");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txMsg, setTxMsg] = useState("");

  const { cr, regime, cls } = getAdaptiveCR(btcConfBps);

  // ── Colour helpers ──────────────────────────────────────────────────────
  const crColor = cls === "crisis" ? "#e05555" : cls === "elevated" ? "#e8943a" : "#4caf7d";

  const ASSETS = [
    { key: "PAXG", label: "PAXG", name: "Tokenized Gold",  icon: "🥇", priceKey: "XAU" },
    { key: "WBTC", label: "WBTC", name: "Wrapped Bitcoin", icon: "₿",  priceKey: "BTC" },
    { key: "OIL",  label: "tOIL", name: "Tokenized WTI",   icon: "🛢", priceKey: "WTI" },
    { key: "USDC", label: "USDC", name: "USD Coin",        icon: "◎",  priceKey: "DXY" },
  ];

  const WEIGHTS = [
    { label: "Gold",   pct: 20, color: "#c8a84b" },
    { label: "Oil",    pct: 25, color: "#6a8fc8" },
    { label: "BTC",    pct: 15, color: "#e8943a" },
    { label: "Farm",   pct: 15, color: "#4caf7d" },
    { label: "DXY",    pct: 15, color: "#9b8ac8" },
    { label: "RWAs",   pct: 10, color: "#c86a6a" },
  ];

  const ASSET_DECIMALS: Record<string, number> = {
    PAXG: 8,
    WBTC: 8,
    OIL: 6,
    USDC: 6,
  };

  async function doAction() {
    if (!publicKey || !connected || !amount || Number(amount) <= 0) {
      setTxStatus("error");
      setTxMsg("Enter a valid amount and connect your wallet.");
      return;
    }

    if (!sendTransaction) {
      setTxStatus("error");
      setTxMsg("Wallet does not support transaction sending.");
      return;
    }

    setTxStatus("pending");
    setTxMsg(tab === "deposit" ? "Submitting SVS-1 deposit..."
           : tab === "mint"    ? "Submitting Basket mint..."
           :                     "Submitting Basket redeem...");

    try {
      let tx;

      if (tab === "deposit") {
        tx = await buildSvsDepositTx(
          connection,
          publicKey,
          selectedAsset,
          Number(amount),
          ASSET_DECIMALS[selectedAsset] ?? 6,
          0,
        );
      } else if (tab === "mint") {
        if (!program) {
          throw new Error("Protocol program not initialized. Verify IDL and program ID settings.");
        }
        tx = await buildMintBasketTx(connection, program, publicKey, Number(amount));
      } else {
        if (!program) {
          throw new Error("Protocol program not initialized. Verify IDL and program ID settings.");
        }
        tx = await buildRedeemBasketTx(program, publicKey, Number(amount));
      }

      const signature = await sendTransaction(tx, connection, { skipPreflight: false });
      setTxMsg(`Transaction submitted: ${signature.slice(0, 8)}... waiting for confirmation`);

      await connection.confirmTransaction(signature, "confirmed");

      setTxStatus("success");
      setTxMsg(`Confirmed: ${signature}`);
      setAmount("");
      await refresh();
    } catch (error: any) {
      setTxStatus("error");
      setTxMsg(error?.message || "Transaction failed");
    }
  }

  const selectedPrice = prices[ASSETS.find(a => a.key === selectedAsset)?.priceKey || "XAU"];
  const usdValue = parseFloat(amount || "0") * (selectedPrice?.price || 0);

  return (
    <div style={S.root}>
      {/* Grain */}
      <div style={S.grain} />

      {/* Header */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.logo}>
            <span style={S.logoMark}>BASKET</span>
            <span style={S.logoTag}>World Reserve Protocol · Devnet</span>
          </div>
          <div style={S.headerRight}>
            <div style={S.statusPill}>
              <div style={{ ...S.dot, background: "#4caf7d", boxShadow: "0 0 6px #4caf7d" }} />
              Live · Solana Devnet
            </div>
            <WalletMultiButton style={S.walletBtn} />
          </div>
        </div>
      </header>

      {/* Ticker */}
      <div style={S.tickerBar}>
        <div style={S.tickerScroll}>
          {[...Object.entries(prices), ...Object.entries(prices)].map(([k, p], i) => (
            <span key={i} style={S.tickerItem}>
              <span style={S.tickerName}>{k}/USD</span>
              <span style={S.tickerPrice}>${p.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              <span style={{ color: "#4caf7d", fontSize: 10 }}>↑</span>
            </span>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div style={S.grid}>

        {/* ── Left panel ── */}
        <div style={S.leftPanel}>

          {/* CR gauge */}
          <div style={S.sectionHead}>
            <span style={S.sectionTitle}>Collateral Ratio</span>
            <span style={S.sectionHint}>live</span>
          </div>

          <div style={S.crCard}>
            <div style={{ ...S.crTopBar, background: `linear-gradient(90deg, ${crColor}, transparent)` }} />
            <div style={S.crRow}>
              <div>
                <div style={S.crLabel}>Min Required CR</div>
                <div style={{ ...S.crValue, color: crColor }}>
                  {state ? cr : "—"}
                  <span style={S.crPct}>%</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={S.crLabel}>Mode</div>
                <div style={{ ...S.crBadge, color: crColor, borderColor: crColor + "50", background: crColor + "18" }}>
                  {regime} · {cr}% min
                </div>
              </div>
            </div>
            <div style={S.barTrack}>
              <div style={{ ...S.barFill, width: `${(cr / 300) * 100}%`, background: crColor }} />
            </div>
            <div style={S.barTicks}>
              {["100%", "Liq 120%", "Min 150%", "200%", "300%"].map(t => (
                <span key={t} style={{ fontSize: 9, color: "#5a5850" }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Weights */}
          <div style={{ ...S.sectionHead, marginTop: 20 }}>
            <span style={S.sectionTitle}>Basket Weights</span>
            <span style={S.sectionHint}>quarterly rebalance</span>
          </div>

          <div style={S.weightsGrid}>
            {WEIGHTS.map(w => (
              <div key={w.label} style={{ ...S.weightCard, borderBottom: `2px solid ${w.color}60` }}>
                <div style={S.weightLabel}>{w.label}</div>
                <div style={S.weightPct}>{w.pct}%</div>
                <div style={S.weightBarTrack}>
                  <div style={{ ...S.weightBarFill, width: `${w.pct * 2.86}%`, background: w.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Oracle status */}
          <div style={{ ...S.sectionHead, marginTop: 20 }}>
            <span style={S.sectionTitle}>Oracles</span>
          </div>
          <div style={S.oracleRow}>
            {[
              { name: "Pyth · Primary",      color: "#4caf7d", detail: "~0.4s" },
              { name: "Switchboard · Fallback", color: "#4caf7d", detail: "~15s" },
              { name: "Chainlink · Quarterly",  color: "#e8943a", detail: "scheduled" },
            ].map(o => (
              <div key={o.name} style={S.oracleChip}>
                <div style={{ ...S.dot, background: o.color, width: 6, height: 6 }} />
                <span>{o.name}</span>
                <span style={{ marginLeft: "auto", color: "#5a5850", fontSize: 10 }}>{o.detail}</span>
              </div>
            ))}
          </div>

          {/* Vol proxy */}
          <div style={S.volRow}>
            <div>
              <div style={S.crLabel}>BTC Vol Proxy (conf/price)</div>
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 22, color: "#e8e6de" }}>
                {btcConfBps.toFixed(2)}
                <span style={{ fontSize: 12, color: "#8a887e", marginLeft: 4 }}>bps</span>
              </div>
              <div style={{ fontSize: 10, color: "#5a5850", marginTop: 2 }}>
                Regime: {regime} → min CR {cr}%
              </div>
            </div>
            <VolGauge pct={Math.min(1, btcConfBps / 300)} color={crColor} />
          </div>

          {/* Stats */}
          <div style={S.statsRow}>
            {[
              { label: "TVL",        value: "—",         sub: "collateral"   },
              { label: "Circulating", value: state ? state.totalMinted.toFixed(2) : "0", sub: "BASKET"  },
              { label: "Ins. Fund",  value: state ? state.insuranceFund.toFixed(4) : "0", sub: "lamports buffer" },
            ].map(s => (
              <div key={s.label} style={S.statBox}>
                <div style={S.crLabel}>{s.label}</div>
                <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 18, color: "#e8e6de" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#5a5850", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={S.rightPanel}>

          {/* Tabs */}
          <div style={S.tabs}>
            {(["deposit", "mint", "redeem"] as const).map((t, i) => (
              <button key={t} onClick={() => setTab(t)} style={{
                ...S.tab,
                color:       tab === t ? "#c8a84b"  : "#5a5850",
                borderBottom: tab === t ? "2px solid #c8a84b" : "2px solid transparent",
              }}>
                <span style={{
                  ...S.tabNum,
                  background: tab === t ? "#c8a84b" : "#2a2a27",
                  color:      tab === t ? "#0a0a08" : "#5a5850",
                }}>{i + 1}</span>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Deposit tab */}
          {tab === "deposit" && (
            <div style={S.formPanel}>
              <div style={S.inputLabel}>Select collateral asset</div>
              <div style={S.assetGrid}>
                {ASSETS.map(a => (
                  <button key={a.key} onClick={() => setSelectedAsset(a.key)} style={{
                    ...S.assetBtn,
                    borderColor: selectedAsset === a.key ? "#c8a84b" : "#2a2a27",
                    background:  selectedAsset === a.key ? "rgba(200,168,75,0.10)" : "#111110",
                  }}>
                    <span style={{ fontSize: 18 }}>{a.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, color: "#e8e6de", fontWeight: 500 }}>{a.label}</div>
                      <div style={{ fontSize: 9, color: "#5a5850", marginTop: 1 }}>{a.name}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div style={S.inputLabel}>Amount</div>
              <div style={S.inputWrap}>
                <input
                  style={S.input}
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
                <span style={S.inputSuffix}>{selectedAsset === "OIL" ? "tOIL" : selectedAsset}</span>
              </div>

              <PreviewBox rows={[
                ["Asset price",   selectedPrice ? `$${selectedPrice.price.toLocaleString("en-US",{maximumFractionDigits:2})}` : "—"],
                ["USD value",     `$${usdValue.toLocaleString("en-US",{maximumFractionDigits:2})}`],
                ["Deposit target", "SVS-1 vault → BasketVault reads balance"],
              ]} />

              <TxStatus status={txStatus} msg={txMsg} />
              <ActionButton onClick={doAction} disabled={!publicKey || !amount}>
                Deposit to SVS-1 Vault
              </ActionButton>
            </div>
          )}

          {/* Mint tab */}
          {tab === "mint" && (
            <div style={S.formPanel}>
              <div style={{ ...S.crCard, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={S.crLabel}>Portfolio CR</div>
                  <div style={{ fontSize: 10, color: "#5a5850", marginTop: 2 }}>Min required: {cr}%</div>
                </div>
                <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 28, color: crColor }}>—</div>
              </div>

              <div style={S.inputLabel}>BASKET to mint</div>
              <div style={S.inputWrap}>
                <input style={S.input} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                <span style={S.inputSuffix}>BASKET</span>
              </div>

              <PreviewBox rows={[
                ["Collateral value", "$0.00"],
                ["CR after mint",    "—"],
                ["Fee (0.1%)",        `$${(parseFloat(amount||"0")*0.001).toFixed(4)}`],
                ["You receive",       `${(parseFloat(amount||"0")*0.999).toFixed(4)} BASKET`],
              ]} />

              <div style={{ background: "#111110", border: "1px solid #2a2a27", borderRadius: 3, padding: "12px 14px", marginBottom: 16, fontSize: 10, color: "#5a5850", lineHeight: 1.7 }}>
                <span style={{ color: "#c8a84b" }}>Adaptive CR</span> is <span style={{ color: "#e8e6de" }}>{regime.toUpperCase()}</span>
                {" · "}BTC conf/price = <span style={{ color: "#e8e6de" }}>{btcConfBps.toFixed(2)} bps</span>
                {" · "}Min CR = <span style={{ color: crColor }}>{cr}%</span>
              </div>

              <TxStatus status={txStatus} msg={txMsg} />
              <ActionButton onClick={doAction} disabled={!publicKey || !amount}>
                Mint BASKET
              </ActionButton>
            </div>
          )}

          {/* Redeem tab */}
          {tab === "redeem" && (
            <div style={S.formPanel}>
              <div style={{ background: "#111110", border: "1px solid #2a2a27", borderRadius: 3, padding: 14, marginBottom: 16, fontSize: 11, color: "#8a887e", lineHeight: 1.8 }}>
                Burn BASKET → receive pro-rata collateral from each SVS-1 vault.
                Withdrawals are <span style={{ color: "#4caf7d" }}>always open</span> — even in emergency mode.
              </div>

              <div style={S.inputLabel}>BASKET to burn</div>
              <div style={S.inputWrap}>
                <input style={S.input} type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                <span style={S.inputSuffix}>BASKET</span>
              </div>

              <PreviewBox rows={[
                ["BASKET balance",     "0 BASKET"],
                ["USD to receive",     `$${(parseFloat(amount||"0")*0.999).toFixed(2)}`],
                ["Fee (0.1%)",          `$${(parseFloat(amount||"0")*0.001).toFixed(4)}`],
                ["Collateral returned", "Pro-rata from 6 SVS-1 vaults"],
              ]} />

              <TxStatus status={txStatus} msg={txMsg} />
              <ActionButton onClick={doAction} disabled={!publicKey || !amount}>
                Burn &amp; Redeem
              </ActionButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PreviewBox({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ background: "#111110", border: "1px solid #2a2a27", borderRadius: 3, padding: 14, marginBottom: 14 }}>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "5px 0", borderBottom: i < rows.length - 1 ? "1px solid #1a1a18" : "none" }}>
          <span style={{ color: "#5a5850" }}>{k}</span>
          <span style={{ color: "#e8e6de", fontWeight: 500 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function TxStatus({ status, msg }: { status: string; msg: string }) {
  if (status === "idle") return null;
  const colors: Record<string, string> = { pending: "#c8a84b", success: "#4caf7d", error: "#e05555" };
  const color = colors[status] || "#c8a84b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 3, marginBottom: 12, border: `1px solid ${color}40`, background: `${color}12`, color, fontSize: 11 }}>
      {status === "pending" && <Spinner color={color} />}
      <span>{msg}</span>
    </div>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <div style={{ width: 12, height: 12, border: `2px solid ${color}40`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
  );
}

function ActionButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "14px 0", background: disabled ? "#2a2a27" : "#c8a84b",
      color: disabled ? "#5a5850" : "#0a0a08", border: "none", borderRadius: 2,
      fontFamily: "IBM Plex Mono, monospace", fontSize: 13, fontWeight: 500,
      cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "0.06em",
      transition: "background 0.15s",
    }}>{children}</button>
  );
}

function VolGauge({ pct, color }: { pct: number; color: string }) {
  const angle = -90 + pct * 180;
  const dashTotal = 106.8;
  const dashFill  = pct * dashTotal;
  return (
    <svg width="80" height="40" viewBox="0 0 80 40" style={{ overflow: "visible" }}>
      <path d="M8 36 A34 34 0 0 1 72 36" fill="none" stroke="#2a2a27" strokeWidth="6" strokeLinecap="round" />
      <path d="M8 36 A34 34 0 0 1 72 36" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${dashTotal}`} strokeDashoffset={`${dashTotal - dashFill}`} />
      <line x1="40" y1="36" x2="40" y2="8" stroke="#c8a84b" strokeWidth="2" strokeLinecap="round"
        transform={`rotate(${angle}, 40, 36)`} />
    </svg>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  root:       { background: "#0a0a08", minHeight: "100vh", color: "#e8e6de", fontFamily: "IBM Plex Mono, monospace", position: "relative" },
  grain:      { position: "fixed", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")", pointerEvents: "none", zIndex: 999, opacity: 0.4 },
  header:     { borderBottom: "1px solid #2a2a27", padding: "16px 24px" },
  headerInner:{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1140, margin: "0 auto" },
  logo:       { display: "flex", alignItems: "baseline", gap: 10 },
  logoMark:   { fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, color: "#c8a84b", letterSpacing: "0.08em" },
  logoTag:    { fontSize: 11, color: "#5a5850", letterSpacing: "0.1em" },
  headerRight:{ display: "flex", alignItems: "center", gap: 16 },
  statusPill: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8a887e" },
  dot:        { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  walletBtn:  { fontFamily: "IBM Plex Mono, monospace", fontSize: 12, background: "transparent", border: "1px solid #7a6530", color: "#c8a84b", borderRadius: 2 },

  tickerBar:  { borderBottom: "1px solid #2a2a27", padding: "9px 24px", overflow: "hidden" },
  tickerScroll:{ display: "flex", gap: 32, animation: "tickerScroll 25s linear infinite", whiteSpace: "nowrap" as const },
  tickerItem: { display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#8a887e" },
  tickerName: { color: "#5a5850", letterSpacing: "0.06em" },
  tickerPrice:{ color: "#e8e6de", fontWeight: 500 },

  grid:       { display: "grid", gridTemplateColumns: "1fr 380px", maxWidth: 1140, margin: "0 auto", minHeight: "calc(100vh - 130px)" },
  leftPanel:  { borderRight: "1px solid #2a2a27", padding: "28px 28px 28px 24px" },
  rightPanel: { padding: "28px 24px 28px 28px" },

  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle:{ fontFamily: "Syne, sans-serif", fontSize: 12, fontWeight: 600, color: "#8a887e", letterSpacing: "0.1em", textTransform: "uppercase" as const },
  sectionHint: { fontSize: 10, color: "#5a5850" },

  crCard:     { background: "#111110", border: "1px solid #2a2a27", borderRadius: 4, padding: 20, marginBottom: 4, position: "relative" as const, overflow: "hidden" as const },
  crTopBar:   { position: "absolute" as const, top: 0, left: 0, right: 0, height: 2 },
  crRow:      { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
  crLabel:    { fontSize: 10, color: "#5a5850", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 },
  crValue:    { fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 48, lineHeight: 1 },
  crPct:      { fontSize: 20, fontWeight: 400, marginLeft: 2, color: "#8a887e" },
  crBadge:    { fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" as const, padding: "4px 10px", borderRadius: 2, border: "1px solid" },
  barTrack:   { height: 4, background: "#1a1a18", borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  barFill:    { height: "100%", borderRadius: 2, transition: "width 0.6s" },
  barTicks:   { display: "flex", justifyContent: "space-between" },

  weightsGrid:{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  weightCard: { background: "#111110", border: "1px solid #2a2a27", borderRadius: 3, padding: "12px 12px 10px" },
  weightLabel:{ fontSize: 9, color: "#5a5850", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 },
  weightPct:  { fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 22, color: "#e8e6de", marginBottom: 6 },
  weightBarTrack: { height: 2, background: "#1a1a18", borderRadius: 1, overflow: "hidden" },
  weightBarFill:  { height: "100%", borderRadius: 1 },

  oracleRow:  { display: "flex", gap: 8, flexDirection: "column" as const, marginBottom: 16 },
  oracleChip: { display: "flex", alignItems: "center", gap: 6, background: "#111110", border: "1px solid #2a2a27", borderRadius: 2, padding: "7px 12px", fontSize: 10, letterSpacing: "0.05em", color: "#8a887e" },

  volRow:     { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111110", border: "1px solid #2a2a27", borderRadius: 3, padding: "14px 16px", marginBottom: 16 },
  statsRow:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  statBox:    { background: "#111110", border: "1px solid #2a2a27", borderRadius: 3, padding: 14 },

  tabs:       { display: "flex", borderBottom: "1px solid #2a2a27", marginBottom: 24 },
  tab:        { padding: "10px 0", marginRight: 22, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer", borderTop: "none", borderLeft: "none", borderRight: "none", background: "transparent", display: "flex", alignItems: "center", gap: 7, fontFamily: "IBM Plex Mono, monospace", marginBottom: -1 },
  tabNum:     { width: 18, height: 18, borderRadius: "50%", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" },
  formPanel:  {},

  inputLabel: { fontSize: 10, color: "#5a5850", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 },
  assetGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 },
  assetBtn:   { background: "#111110", border: "1px solid", borderRadius: 3, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontFamily: "IBM Plex Mono, monospace", transition: "all 0.15s" },

  inputWrap:  { position: "relative" as const, marginBottom: 14 },
  input:      { width: "100%", background: "#111110", border: "1px solid #2a2a27", borderRadius: 3, padding: "13px 65px 13px 14px", fontFamily: "IBM Plex Mono, monospace", fontSize: 18, color: "#e8e6de", outline: "none" },
  inputSuffix:{ position: "absolute" as const, right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#8a887e" },
};

// ── Root with providers ───────────────────────────────────────────────────────

export default function App() {
  const wallets = [new PhantomWalletAdapter()];
  const AnyConnectionProvider = ConnectionProvider as any;
  const AnyWalletProvider = WalletProvider as any;
  const AnyWalletModalProvider = WalletModalProvider as any;

  return (
    <AnyConnectionProvider endpoint={RPC_URL}>
      <AnyWalletProvider wallets={wallets} autoConnect>
        <AnyWalletModalProvider>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
            * { margin:0; padding:0; box-sizing:border-box; }
            body { background:#0a0a08; }
            @keyframes spin { to { transform: rotate(360deg) } }
            @keyframes tickerScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
            input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
            .wallet-adapter-button { font-family: 'IBM Plex Mono', monospace !important; }
          `}</style>
          <InnerApp />
        </AnyWalletModalProvider>
      </AnyWalletProvider>
    </AnyConnectionProvider>
  );
}
