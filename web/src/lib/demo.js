/* Demo desk data. Everything here is sample data for the demo desk; the
   figures are what a view key would decrypt, never what the chain shows. */

export const MARKETS = [
  {
    id: "sol-usdc-30",
    collateral: "SOL",
    principal: "USDC",
    term: "30 days",
    termShort: "30d",
    rateBand: "2.4 to 3.6%",
    openOffers: 14,
    minRatio: "150%",
  },
  {
    id: "msol-usdc-14",
    collateral: "mSOL",
    principal: "USDC",
    term: "14 days",
    termShort: "14d",
    rateBand: "1.1 to 1.9%",
    openOffers: 9,
    minRatio: "140%",
  },
  {
    id: "sol-usdt-7",
    collateral: "SOL",
    principal: "USDT",
    term: "7 days",
    termShort: "7d",
    rateBand: "0.6 to 1.1%",
    openOffers: 6,
    minRatio: "150%",
  },
  {
    id: "jlp-usdc-30",
    collateral: "JLP",
    principal: "USDC",
    term: "30 days",
    termShort: "30d",
    rateBand: "2.9 to 4.2%",
    openOffers: 4,
    minRatio: "165%",
  },
];

export const OFFERS = {
  "sol-usdc-30": [
    { id: "of-01", principal: "3,200.00 USDC", collateral: "24.80 SOL", repay: "3,296.00 USDC", rate: "3.0%", ratio: "187%", lender: "GkTe…vR2p", open: true },
    { id: "of-02", principal: "12,500.00 USDC", collateral: "98.40 SOL", repay: "12,850.00 USDC", rate: "2.8%", ratio: "190%", lender: "9mWx…hT4c", open: true },
    { id: "of-03", principal: "1,750.00 USDC", collateral: "13.10 SOL", repay: "1,806.00 USDC", rate: "3.2%", ratio: "181%", lender: "C4qn…pL8d", open: false },
    { id: "of-04", principal: "6,000.00 USDC", collateral: "48.20 SOL", repay: "6,174.00 USDC", rate: "2.9%", ratio: "194%", lender: "Fh2s…kW9m", open: true },
  ],
  "msol-usdc-14": [
    { id: "of-05", principal: "4,400.00 USDC", collateral: "36.90 mSOL", repay: "4,470.00 USDC", rate: "1.6%", ratio: "176%", lender: "Bv7k…nQ3f", open: true },
    { id: "of-06", principal: "900.00 USDC", collateral: "7.60 mSOL", repay: "911.70 USDC", rate: "1.3%", ratio: "178%", lender: "GkTe…vR2p", open: true },
  ],
  "sol-usdt-7": [
    { id: "of-07", principal: "2,100.00 USDT", collateral: "16.40 SOL", repay: "2,118.90 USDT", rate: "0.9%", ratio: "183%", lender: "Jp5r…mD6w", open: true },
    { id: "of-08", principal: "15,000.00 USDT", collateral: "118.00 SOL", repay: "15,120.00 USDT", rate: "0.8%", ratio: "185%", lender: "9mWx…hT4c", open: true },
  ],
  "jlp-usdc-30": [
    { id: "of-09", principal: "5,500.00 USDC", collateral: "1,410.00 JLP", repay: "5,689.75 USDC", rate: "3.4%", ratio: "171%", lender: "C4qn…pL8d", open: true },
  ],
};

/* Spot prices the demo desk uses for live ratio previews. */
export const PRICES = { SOL: 132.4, mSOL: 158.1, JLP: 4.12, USDC: 1, USDT: 1 };

/* Positions the demo wallet already holds when the desk opens. */
export const SEED_POSITIONS = [
  {
    id: "ln-ex-0",
    role: "lender",
    marketId: "jlp-usdc-30",
    state: "active",
    principal: "5,100.00 USDC",
    collateral: "1,320.00 JLP",
    repay: "5,274.00 USDC",
    rate: "3.4%",
    dueInSec: 86400 * 9 + 3600 * 4,
  },
  {
    id: "ln-ex-1",
    role: "lender",
    marketId: "msol-usdc-14",
    state: "defaulted",
    principal: "2,000.00 USDC",
    collateral: "16.70 mSOL",
    repay: "2,031.00 USDC",
    rate: "1.5%",
    dueInSec: -86400 * 2,
  },
  {
    id: "ln-ex-2",
    role: "borrower",
    marketId: "sol-usdt-7",
    state: "repaid",
    principal: "1,200.00 USDT",
    collateral: "9.40 SOL",
    repay: "1,210.80 USDT",
    rate: "0.9%",
    dueInSec: -86400 * 5,
  },
];

export function marketById(id) {
  return MARKETS.find((mk) => mk.id === id);
}

export function fmtCountdown(sec) {
  if (sec <= 0) return "past due";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
