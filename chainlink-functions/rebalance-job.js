// chainlink-functions/rebalance-job.js
// Deployed to Chainlink Functions — runs every 90 days.
// Fetches EIA + FAO + WTO data, computes new basket weights.
// Returns packed uint16[6] submitted to rebalance_weights instruction.
//
// Deploy at: https://functions.chain.link
// Secrets required: eiaApiKey, wtoApiKey

const currentWeights = [2000, 2500, 1500, 1500, 1500, 1000];
// Index:             [XAU,  WTI,  BTC,  XAG,  DXY,  RWA]

// ── Fetch macro data ──────────────────────────────────────────────────────────

const [eiaResp, faoResp, wtoResp] = await Promise.all([
  Functions.makeHttpRequest({
    url: `https://api.eia.gov/v2/petroleum/sum/sndw/a/?api_key=${secrets.eiaApiKey}&data[]=value&facets[duoarea][]=R1X&length=2`,
    timeout: 9000,
  }),
  Functions.makeHttpRequest({
    url: "https://www.fao.org/worldfoodsituation/foodpricesindex/en/",
    timeout: 9000,
  }),
  Functions.makeHttpRequest({
    url: `https://api.wto.org/timeseries/v1/data?i=MTVMMC000&r=all&p=all&ps=2025`,
    headers: { "x-api-key": secrets.wtoApiKey },
    timeout: 9000,
  }),
]);

if (eiaResp.error || faoResp.error || wtoResp.error) {
  throw new Error("Data fetch failed — aborting. Current weights preserved.");
}

// ── Parse values ──────────────────────────────────────────────────────────────

const oilSupply  = eiaResp.data?.response?.data?.[0]?.value ?? 1.0;
const oilDemand  = eiaResp.data?.response?.data?.[1]?.value ?? 1.0;
const oilBalance = oilDemand > 0 ? oilSupply / oilDemand : 1.0;

const faoIndex    = parseFloat(faoResp.data?.cereals_index ?? "120");
const faoBaseline = 120;

const tradeGrowth = parseFloat(wtoResp.data?.Dataset?.[0]?.Value ?? "2.5");

// ── Compute weight shifts ─────────────────────────────────────────────────────

// Oil: deficit (balance<1) → increase weight. Max ±200 bps.
const oilShift  = Math.round(Math.max(-200, Math.min(200, (1 - oilBalance) * 1000)));

// Farm: high FAO index → food scarcity → increase weight. Max ±150 bps.
const farmShift = Math.round(Math.max(-150, Math.min(150, (faoIndex - faoBaseline) * 2)));

// BTC: high global trade growth → risk-on → slight increase.
const btcShift  = tradeGrowth > 4 ? 50 : tradeGrowth < 1 ? -50 : 0;

// Gold: inversely correlated with oil (flight to safety).
const goldShift = -Math.round(oilShift * 0.5);

// ── Apply and normalize ───────────────────────────────────────────────────────

const proposed = [...currentWeights];
proposed[0] += goldShift;
proposed[1] += oilShift;
proposed[2] += btcShift;
proposed[3] += farmShift;
// DXY [4] and RWA [5] unchanged this quarter

// Clamp each to [500, 3500]
const clamped = proposed.map(w => Math.max(500, Math.min(3500, w)));

// Normalize to sum = 10_000
const total  = clamped.reduce((a, b) => a + b, 0);
const factor = 10000 / total;
const norm   = clamped.map(w => Math.round(w * factor));

// Fix rounding in last element
const finalSum = norm.reduce((a, b) => a + b, 0);
norm[5] += (10000 - finalSum);

console.log("New weights:", norm, "Sum:", norm.reduce((a,b)=>a+b,0));

// ── Encode as packed uint16[6] ────────────────────────────────────────────────
const hex = norm.map(w => w.toString(16).padStart(4, "0")).join("");
return Functions.encodeUint256(BigInt("0x" + hex.padStart(64, "0")));
