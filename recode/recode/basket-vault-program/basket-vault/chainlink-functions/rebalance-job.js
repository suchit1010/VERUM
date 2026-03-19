// chainlink-functions/rebalance-job.js
//
// Chainlink Functions job — runs off-chain every 90 days.
// Fetches EIA, FAO, WGC, WTO data and computes new basket weights.
// Returns ABI-encoded uint16[6] submitted to rebalance_weights instruction.
//
// Deploy via: https://functions.chain.link
// Secrets (encrypted): eiaApiKey, faoApiKey, wgcApiKey, wtoApiKey

const EIA_API_KEY = secrets.eiaApiKey;
const WTO_API_KEY = secrets.wtoApiKey;

// Current weights (bps) — fetched from on-chain in production
// For the job, pass as args or hardcode last known weights
const currentWeights = [2000, 2500, 1500, 1500, 1500, 1000];
// Index:              [gold,  oil,  btc, farm,  dxy,  rwa]

// ── Fetch raw data ────────────────────────────────────────────────────────────

const [eiaResp, faoResp, wtoResp] = await Promise.all([
  // EIA: US petroleum supply/demand balance
  Functions.makeHttpRequest({
    url: `https://api.eia.gov/v2/petroleum/sum/sndw/a/?api_key=${EIA_API_KEY}&data[]=value&facets[duoarea][]=R1X&length=2`,
    timeout: 9000,
  }),

  // FAO: Food Price Index (cereals sub-index)
  Functions.makeHttpRequest({
    url: "https://www.fao.org/worldfoodsituation/foodpricesindex/en/",
    timeout: 9000,
  }),

  // WTO: Merchandise trade volume index
  Functions.makeHttpRequest({
    url: `https://api.wto.org/timeseries/v1/data?i=MTVMMC000&r=all&p=all&ps=2025`,
    headers: { "x-api-key": WTO_API_KEY },
    timeout: 9000,
  }),
]);

if (eiaResp.error || faoResp.error || wtoResp.error) {
  throw new Error("Data fetch failed — aborting rebalance to preserve current weights");
}

// ── Parse raw values ──────────────────────────────────────────────────────────

// EIA: supply/demand ratio (>1 = surplus, <1 = deficit)
const oilSupply = eiaResp.data?.response?.data?.[0]?.value ?? 1.0;
const oilDemand = eiaResp.data?.response?.data?.[1]?.value ?? 1.0;
const oilBalance = oilDemand > 0 ? oilSupply / oilDemand : 1.0;

// FAO: food price index (baseline ~120 in 2024)
const faoIndex = parseFloat(faoResp.data?.cereals_index ?? "120");

// WTO: global trade volume growth (%)
const tradeGrowth = parseFloat(wtoResp.data?.Dataset?.[0]?.Value ?? "2.5");

// ── Compute weight shifts ──────────────────────────────────────────────────────

// Oil: deficit → increase weight (world needs more oil, it's more valuable in basket)
// Surplus → decrease weight. Max shift: ±200 bps.
const oilShift = Math.round(
  Math.max(-200, Math.min(200, (1 - oilBalance) * 1000))
);

// Farm commodities: high FAO index → increase weight (food scarcity)
const faoBaseline = 120;
const farmShift = Math.round(
  Math.max(-150, Math.min(150, (faoIndex - faoBaseline) * 2))
);

// BTC: increase slightly on high global trade growth (risk-on)
const btcShift = tradeGrowth > 4 ? 50 : tradeGrowth < 1 ? -50 : 0;

// Gold: inverse of oil (flight to safety when oil is volatile)
const goldShift = -Math.round(oilShift * 0.5);

// ── Apply and normalize ───────────────────────────────────────────────────────

const proposed = [...currentWeights];
proposed[0] += goldShift;  // gold
proposed[1] += oilShift;   // oil
proposed[2] += btcShift;   // btc
proposed[3] += farmShift;  // silver+farm
// dxy [4] and rwa [5] unchanged this quarter

// Clamp each weight to [500, 3500]
const clamped = proposed.map(w => Math.max(500, Math.min(3500, w)));

// Normalize to sum to exactly 10_000
const total  = clamped.reduce((a, b) => a + b, 0);
const factor = 10000 / total;
const normalized = clamped.map(w => Math.round(w * factor));

// Fix rounding drift in last element
const finalSum = normalized.reduce((a, b) => a + b, 0);
normalized[5] += (10000 - finalSum); // absorb in RWA weight

// ── Encode return value ───────────────────────────────────────────────────────
// Encode as packed uint16[6] — decoded on-chain
const hex = normalized.map(w => w.toString(16).padStart(4, "0")).join("");
return Functions.encodeUint256(BigInt("0x" + hex.padStart(64, "0")));
