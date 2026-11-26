import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion as m, useReducedMotion } from "motion/react";
import {
  CheckCircle,
  CaretRight,
  Key,
  LockSimple,
  Plus,
  Wallet,
  X,
} from "@phosphor-icons/react";
import Decrypt from "../components/Decrypt.jsx";
import Ticker from "../components/Ticker.jsx";
import AmberSilk from "../components/AmberSilk.jsx";
import {
  MARKETS,
  OFFERS,
  PRICES,
  SEED_POSITIONS,
  fmtCountdown,
  marketById,
} from "../lib/demo.js";

const EASE = [0.16, 1, 0.3, 1];
const ViewKeyCtx = createContext(true);
const DEMO_WALLET = "7dKj…9mAw";
const LiveDesk = lazy(() => import("../live/LiveDesk.jsx"));

/* --------------------------------- helpers -------------------------------- */

function termSeconds(marketId) {
  const days = { "sol-usdc-30": 30, "msol-usdc-14": 14, "sol-usdt-7": 7, "jlp-usdc-30": 30 }[marketId];
  return days * 86400;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function stamp(d = new Date()) {
  return d.toTimeString().slice(0, 8);
}

function fmtAmt(n, mint) {
  return `${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${mint}`;
}

const SEED_MY_OFFERS = [
  {
    id: "my-1",
    marketId: "msol-usdc-14",
    principal: "2,500.00 USDC",
    collateral: "20.90 mSOL",
    repay: "2,540.00 USDC",
    rate: "1.6%",
    designated: null,
    expiresAt: Date.now() + 95_000,
  },
  {
    id: "my-2",
    marketId: "sol-usdc-30",
    principal: "8,000.00 USDC",
    collateral: "63.00 SOL",
    repay: "8,232.00 USDC",
    rate: "2.9%",
    designated: "Bq4w\u2026nP2e",
    expiresAt: Date.now() + 3_600_000,
  },
];

/* app-surface primitives: square-ish, hairline-tiled, dense */
const CELL = "bg-surface";
const LABEL = "font-ui text-[9.5px] font-medium uppercase tracking-[0.12em] text-faint";

/* ---------------------------------- toasts -------------------------------- */

function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[min(92vw,360px)] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="flex items-start gap-2.5 rounded-lg border border-line-bright bg-raised px-4 py-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.8)]"
          >
            <CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0 text-moss" />
            <p className="text-[13px] leading-snug text-ink">{t.text}</p>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ account strip ----------------------------- */

function AccountStrip({ positions, now }) {
  const viewKey = useContext(ViewKeyCtx);
  const active = positions.filter((p) => p.state === "active");
  const nextDue = active
    .map((p) => (p.dueAt ?? now + p.dueInSec * 1000) - now)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)[0];
  const cells = [
    {
      label: "Session wallet",
      value: (
        <span className="flex items-center gap-1.5">
          <Wallet size={12} weight="bold" className="text-faint" />
          <span className="num text-[12.5px] text-ink">{DEMO_WALLET}</span>
        </span>
      ),
    },
    {
      label: "Private balance, SOL",
      value: (
        <span className="num text-[12.5px] text-ink">
          <Decrypt value="412.60 SOL" revealed={viewKey} />
        </span>
      ),
    },
    {
      label: "Private balance, USDC",
      value: (
        <span className="num text-[12.5px] text-ink">
          <Decrypt value="18,240.00 USDC" revealed={viewKey} />
        </span>
      ),
    },
    {
      label: "Active loans",
      value: <span className="num text-[12.5px] text-ink">{active.length}</span>,
    },
    {
      label: "Next deadline",
      value: (
        <span className="num text-[12.5px] text-ink">
          {nextDue ? fmtCountdown(Math.floor(nextDue / 1000)) : "none"}
        </span>
      ),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
      {cells.map(({ label, value }) => (
        <div key={label} className={`${CELL} px-4 py-3`}>
          <p className={LABEL}>{label}</p>
          <div className="mt-1.5">{value}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ markets rail ------------------------------ */

function MarketsRail({ selected, onSelect }) {
  return (
    <div className={`${CELL} flex flex-col`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className={LABEL}>Markets</span>
        <span className="num text-[10.5px] text-faint">{MARKETS.length}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line px-4 py-1.5">
        <span className={LABEL}>Pair</span>
        <span className={`${LABEL} text-right`}>Term</span>
        <span className={`${LABEL} text-right`}>Offers</span>
      </div>
      {MARKETS.map((mk) => {
        const active = mk.id === selected;
        return (
          <button
            key={mk.id}
            type="button"
            onClick={() => onSelect(mk.id)}
            className={`relative grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line/50 px-4 py-2.5 text-left transition-colors ${
              active ? "bg-raised" : "hover:bg-raised/50"
            }`}
          >
            {active && (
              <m.span
                layoutId="market-indicator"
                className="absolute inset-y-0 left-0 w-0.5 bg-ember"
                transition={{ duration: 0.3, ease: EASE }}
              />
            )}
            <span>
              <span className="block font-ui text-[12.5px] font-semibold text-bone">
                {mk.collateral}/{mk.principal}
              </span>
              <span className="num text-[10px] text-faint">{mk.rateBand} fixed</span>
            </span>
            <span className="num text-right text-[11.5px] text-mute">{mk.termShort}</span>
            <span className="num text-right text-[11.5px] text-ink">{mk.openOffers}</span>
          </button>
        );
      })}
      <div className="panel-amber mt-auto flex items-center justify-between px-4 py-2.5">
        <span className="font-ui text-[9.5px] font-medium uppercase tracking-[0.12em] text-bone/70">
          Book size, all
        </span>
        <span className="num text-[11.5px] text-bone/80">{"▮▮,▮▮▮,▮▮▮"}</span>
      </div>
    </div>
  );
}

/* -------------------------------- offer book ------------------------------ */

const BOOK_COLS = "grid-cols-[64px_1fr_1fr_1fr_64px_88px]";

function OfferBook({ market, list, selectedId, onPick, onCompose }) {
  const viewKey = useContext(ViewKeyCtx);
  return (
    <div className={`${CELL} flex min-w-0 flex-col`}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="font-ui text-[13.5px] font-semibold text-bone">
            {market.collateral}/{market.principal}
          </span>
          <span className="num text-[10.5px] text-faint">{market.term}</span>
          <span className="num text-[10.5px] text-faint">min ratio {market.minRatio}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-[10.5px] text-faint">{list.length} offers</span>
          <button
            type="button"
            onClick={onCompose}
            className="flex items-center gap-1.5 rounded-md border border-line-bright px-2.5 py-1 text-[11.5px] font-semibold text-ink transition-colors hover:border-ember hover:text-ember"
          >
            <Plus size={11} weight="bold" />
            New offer
          </button>
        </div>
      </div>
      {/* column heads */}
      <div className={`grid ${BOOK_COLS} gap-x-3 border-b border-line px-4 py-1.5`}>
        <span className={LABEL}>Rate</span>
        <span className={`${LABEL} text-right`}>Principal</span>
        <span className={`${LABEL} text-right`}>Collateral</span>
        <span className={`${LABEL} text-right`}>Repays</span>
        <span className={`${LABEL} text-right`}>Ratio</span>
        <span className={`${LABEL} text-right`}>Lender</span>
      </div>
      {/* rows */}
      {list.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-[13px] text-mute">The book is empty.</p>
          <p className="mt-1 text-[11.5px] text-faint">
            Every offer here has been originated or cancelled.
          </p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {list.map((offer) => {
            const sel = offer.id === selectedId;
            return (
              <m.button
                key={offer.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                type="button"
                disabled={!offer.open}
                onClick={() => onPick(offer)}
                className={`grid w-full ${BOOK_COLS} items-center gap-x-3 border-b border-line/50 px-4 py-2.5 text-left transition-colors last:border-b-0 ${
                  sel
                    ? "bg-ember/10"
                    : offer.open
                      ? "hover:bg-raised/60"
                      : "opacity-45"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="num text-[12.5px] font-medium text-bone">{offer.rate}</span>
                  {!offer.open && <LockSimple size={10} weight="bold" className="text-faint" />}
                </span>
                <span className="num text-right text-[12px] text-ink">
                  <Decrypt value={offer.principal} revealed={viewKey} />
                </span>
                <span className="num text-right text-[12px] text-ink">
                  <Decrypt value={offer.collateral} revealed={viewKey} />
                </span>
                <span className="num text-right text-[12px] text-ink">
                  <Decrypt value={offer.repay} revealed={viewKey} />
                </span>
                <span className="num text-right text-[12px] text-mute">
                  <Decrypt value={offer.ratio} revealed={viewKey} />
                </span>
                <span className="num text-right text-[10.5px] text-faint">{offer.lender}</span>
              </m.button>
            );
          })}
        </AnimatePresence>
      )}
      <div className="mt-auto border-t border-line px-4 py-2">
        <p className="text-[10.5px] leading-relaxed text-faint">
          Figures are what your view key resolves. On-chain, each row is a
          commitment and a ciphertext.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- order ticket ----------------------------- */

function OrderTicket({ offer, market, composing, onCompose, onConfirm, onClear, activity }) {
  return (
    <div className={`${CELL} flex flex-col`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className={LABEL}>{composing ? "New offer" : "Order ticket"}</span>
        {(offer || composing) && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear"
            className="text-faint transition-colors hover:text-ink"
          >
            <X size={12} weight="bold" />
          </button>
        )}
      </div>

      {composing ? (
        <ComposeOffer market={market} onSubmit={onCompose} onCancel={onClear} />
      ) : offer ? (
        <div className="flex flex-1 flex-col px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="font-ui text-[13px] font-semibold text-bone">
              {market.collateral}/{market.principal}
            </span>
            <span className="num text-[11px] text-faint">{offer.lender}</span>
          </div>
          <dl className="mt-3 space-y-2 border-t border-line/60 pt-3">
            {[
              ["You receive", offer.principal],
              ["You lock", offer.collateral],
              ["You repay", offer.repay],
              ["Rate, fixed", offer.rate],
              ["Within", market.term],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between">
                <dt className="text-[11.5px] text-mute">{k}</dt>
                <dd className="num text-[12px] text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-md border border-line bg-raised px-3 py-2.5 text-[10.5px] leading-relaxed text-mute">
            Both legs settle in one transaction. Every figure stays ciphertext
            on-chain; the proof checks the terms without reading them.
          </p>
          <button
            type="button"
            onClick={onConfirm}
            className="mt-4 w-full rounded-md bg-ember py-2.5 text-[13px] font-semibold text-void transition-all hover:bg-ember-hot active:scale-[0.99]"
          >
            Originate in demo
          </button>
        </div>
      ) : (
        <div className="border-b border-line px-4 py-6 text-center">
          <CaretRight size={14} weight="bold" className="mx-auto rotate-180 text-faint" />
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            Select an open offer from the book to build a ticket.
          </p>
        </div>
      )}

      {/* activity */}
      <div className={offer || composing ? "border-t border-line" : ""}>
        <div className="border-b border-line px-4 py-2">
          <span className={LABEL}>Activity</span>
        </div>
        <div className="max-h-[220px] overflow-y-auto">
          {activity.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 border-b border-line/40 px-4 py-2 last:border-b-0"
            >
              <span className="num shrink-0 text-[10px] text-faint">{a.t}</span>
              <span className="text-[11px] leading-snug text-mute">{a.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------- compose offer ---------------------------- */

const FIELD =
  "w-full rounded-md border border-line bg-raised px-3 py-2 num text-[12.5px] text-ink outline-none transition-colors focus:border-ember/60 placeholder:text-faint";

function ComposeOffer({ market, onSubmit, onCancel }) {
  const [principal, setPrincipal] = useState("");
  const [ratePct, setRatePct] = useState("3.0");
  const [collateral, setCollateral] = useState("");
  const [expiryMin, setExpiryMin] = useState(60);
  const [borrower, setBorrower] = useState("");

  const pNum = parseFloat(principal) || 0;
  const cNum = parseFloat(collateral) || 0;
  const rNum = parseFloat(ratePct) || 0;
  const repay = pNum * (1 + rNum / 100);
  const ratio =
    pNum > 0 && cNum > 0
      ? ((cNum * PRICES[market.collateral]) / (pNum * PRICES[market.principal])) * 100
      : 0;
  const minRatio = parseInt(market.minRatio, 10);
  const belowMin = ratio > 0 && ratio < minRatio;
  const valid = pNum > 0 && cNum > 0 && rNum > 0 && !belowMin;

  return (
    <div className="flex flex-1 flex-col px-4 py-3.5">
      <p className="font-ui text-[13px] font-semibold text-bone">
        New offer, {market.collateral}/{market.principal}
      </p>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className={LABEL}>Principal, {market.principal}</span>
          <input
            inputMode="decimal"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="5,000.00"
            className={`mt-1 ${FIELD}`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={LABEL}>Rate, %</span>
            <input
              inputMode="decimal"
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Offer expires</span>
            <select
              value={expiryMin}
              onChange={(e) => setExpiryMin(Number(e.target.value))}
              className={`mt-1 ${FIELD}`}
            >
              <option value={2}>2 minutes</option>
              <option value={60}>1 hour</option>
              <option value={1440}>1 day</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className={LABEL}>Collateral required, {market.collateral}</span>
          <input
            inputMode="decimal"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="48.00"
            className={`mt-1 ${FIELD}`}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Designated borrower, optional</span>
          <input
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
            placeholder="leave empty for an open offer"
            className={`mt-1 ${FIELD}`}
          />
        </label>
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-line/60 pt-3">
        <div className="flex items-baseline justify-between">
          <dt className="text-[11.5px] text-mute">Repays you</dt>
          <dd className="num text-[12px] text-ink">
            {pNum > 0 ? fmtAmt(repay, market.principal) : "\u2014".replace("\u2014", "...")}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-[11.5px] text-mute">Ratio at open</dt>
          <dd className={`num text-[12px] ${belowMin ? "text-ember" : "text-ink"}`}>
            {ratio > 0 ? `${ratio.toFixed(0)}%` : "..."}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-[11.5px] text-mute">Market minimum</dt>
          <dd className="num text-[12px] text-mute">{market.minRatio}</dd>
        </div>
      </dl>
      {belowMin && (
        <p className="mt-2 text-[10.5px] leading-snug text-ember">
          Collateral is below this market's minimum ratio; the proof would
          refuse the origination.
        </p>
      )}
      <p className="mt-3 rounded-md border border-line bg-raised px-3 py-2.5 text-[10.5px] leading-relaxed text-mute">
        The principal locks under program custody until someone originates or
        the offer expires and you cancel. Terms stay sealed to the borrower.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line-bright py-2.5 text-[12.5px] font-medium text-ink transition-colors hover:border-mute"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSubmit({
              principal: fmtAmt(pNum, market.principal),
              collateral: fmtAmt(cNum, market.collateral),
              repay: fmtAmt(repay, market.principal),
              rate: `${rNum.toFixed(1)}%`,
              designated: borrower.trim() || null,
              expiresAt: Date.now() + expiryMin * 60_000,
            })
          }
          className="rounded-md bg-ember py-2.5 text-[12.5px] font-semibold text-void transition-all enabled:hover:bg-ember-hot enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Post offer
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- my offers ------------------------------- */

const MY_COLS = "md:grid-cols-[110px_64px_1fr_1fr_1fr_130px_112px]";

function MyOffersTable({ myOffers, now, onCancelOffer }) {
  const viewKey = useContext(ViewKeyCtx);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className={`hidden gap-3 border-b border-line px-4 py-1.5 md:grid ${MY_COLS}`}>
        <span className={LABEL}>Market</span>
        <span className={LABEL}>Rate</span>
        <span className={`${LABEL} text-right`}>Principal</span>
        <span className={`${LABEL} text-right`}>Collateral</span>
        <span className={`${LABEL} text-right`}>Repays</span>
        <span className={LABEL}>Expires</span>
        <span />
      </div>
      {myOffers.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-[13px] text-mute">No open offers.</p>
          <p className="mt-1 text-[11.5px] text-faint">
            Post one from the book toolbar and it will sit here until taken,
            cancelled or expired.
          </p>
        </div>
      ) : (
        myOffers.map((o) => {
          const market = marketById(o.marketId);
          const msLeft = o.expiresAt - now;
          const expired = msLeft <= 0;
          return (
            <div
              key={o.id}
              className={`grid grid-cols-2 gap-x-3 gap-y-2 border-b border-line/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-raised/50 md:items-center ${MY_COLS}`}
            >
              <span className="font-ui text-[12.5px] font-semibold text-bone">
                {market.collateral}/{market.principal}
              </span>
              <span className="num text-[12px] text-ink">{o.rate}</span>
              <span className="num text-[12px] text-ink md:text-right">
                <Decrypt value={o.principal} revealed={viewKey} />
              </span>
              <span className="num text-[12px] text-ink md:text-right">
                <Decrypt value={o.collateral} revealed={viewKey} />
              </span>
              <span className="num text-[12px] text-ink md:text-right">
                <Decrypt value={o.repay} revealed={viewKey} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span
                  className={`w-fit rounded border px-1.5 py-0.5 font-ui text-[9px] font-medium uppercase tracking-wider ${
                    expired
                      ? "border-line-bright text-mute"
                      : o.designated
                        ? "border-line-bright text-mute"
                        : "border-moss/50 text-moss"
                  }`}
                >
                  {expired ? "expired" : o.designated ? "designated" : "open"}
                </span>
                {!expired && (
                  <span className="num text-[10px] text-faint">
                    {fmtCountdown(Math.floor(msLeft / 1000))}
                  </span>
                )}
              </span>
              <span className="col-span-2 md:col-span-1">
                <button
                  type="button"
                  disabled={!expired}
                  onClick={() => onCancelOffer(o)}
                  title={expired ? "Reclaim the principal" : "Cancel unlocks after the offer expires"}
                  className="w-full rounded-md border border-line-bright px-4 py-1.5 text-[11.5px] font-semibold text-ink transition-all enabled:hover:border-ember enabled:hover:bg-ember enabled:hover:text-void enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 md:w-[104px]"
                >
                  Cancel
                </button>
              </span>
            </div>
          );
        })
      )}
      <div className="border-t border-line px-4 py-2">
        <p className="text-[10.5px] leading-relaxed text-faint">
          Cancel unlocks once an offer's expiry passes; the program enforces
          the same window on-chain.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- positions ------------------------------ */

const POS_COLS = "md:grid-cols-[110px_84px_1fr_1fr_1fr_120px_112px]";

function PositionsTable({ positions, now, onRepay, onClaim }) {
  const viewKey = useContext(ViewKeyCtx);
  const META = {
    active: "border-ember/50 text-ember",
    repaid: "border-moss/50 text-moss",
    claimed: "border-moss/50 text-moss",
    defaulted: "border-line-bright text-mute",
  };
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div
        className={`hidden gap-3 border-b border-line px-4 py-1.5 md:grid ${POS_COLS}`}
      >
        <span className={LABEL}>Market</span>
        <span className={LABEL}>Side</span>
        <span className={`${LABEL} text-right`}>Principal</span>
        <span className={`${LABEL} text-right`}>Collateral</span>
        <span className={`${LABEL} text-right`}>Repays</span>
        <span className={LABEL}>Status</span>
        <span />
      </div>
      {positions.map((pos) => {
        const market = marketById(pos.marketId);
        const dueMs = pos.dueAt ?? now + pos.dueInSec * 1000;
        const secLeft = Math.floor((dueMs - now) / 1000);
        return (
          <div
            key={pos.id}
            className={`grid grid-cols-2 gap-x-3 gap-y-2 border-b border-line/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-raised/50 md:items-center ${POS_COLS}`}
          >
            <span className="font-ui text-[12.5px] font-semibold text-bone">
              {market.collateral}/{market.principal}
            </span>
            <span className="text-[11.5px] capitalize text-mute">{pos.role}</span>
            <span className="num text-[12px] text-ink md:text-right">
              <Decrypt value={pos.principal} revealed={viewKey} />
            </span>
            <span className="num text-[12px] text-ink md:text-right">
              <Decrypt value={pos.collateral} revealed={viewKey} />
            </span>
            <span className="num text-[12px] text-ink md:text-right">
              <Decrypt value={pos.repay} revealed={viewKey} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span
                className={`w-fit rounded border px-1.5 py-0.5 font-ui text-[9px] font-medium uppercase tracking-wider ${META[pos.state]}`}
              >
                {pos.state}
              </span>
              {pos.state === "active" && (
                <span className="num text-[10px] text-faint">due {fmtCountdown(secLeft)}</span>
              )}
            </span>
            <span className="col-span-2 md:col-span-1">
              {pos.state === "active" && pos.role === "lender" ? (
                <span className="block text-right font-ui text-[9.5px] font-medium uppercase tracking-wider text-faint">
                  awaiting repay
                </span>
              ) : pos.state === "active" && pos.role === "borrower" ? (
                <button
                  type="button"
                  onClick={() => onRepay(pos)}
                  className="w-full rounded-md bg-ember px-4 py-1.5 text-[11.5px] font-semibold text-void transition-all hover:bg-ember-hot active:scale-[0.98] md:w-[104px]"
                >
                  Repay
                </button>
              ) : pos.state === "defaulted" && pos.role === "lender" ? (
                <button
                  type="button"
                  onClick={() => onClaim(pos)}
                  className="w-full rounded-md bg-bone px-4 py-1.5 text-[11.5px] font-semibold text-void transition-all hover:bg-white active:scale-[0.98] md:w-[104px]"
                >
                  Claim
                </button>
              ) : (
                <span className="block text-right font-ui text-[9.5px] font-medium uppercase tracking-wider text-faint">
                  settled
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------- page --------------------------------- */

export default function Desk() {
  const now = useNow();
  const [mode, setMode] = useState("demo");
  const [tab, setTab] = useState("markets");
  const [marketId, setMarketId] = useState(MARKETS[0].id);
  const [offers, setOffers] = useState(OFFERS);
  const [positions, setPositions] = useState(SEED_POSITIONS);
  const [viewKey, setViewKey] = useState(true);
  const [picked, setPicked] = useState(null);
  const [composing, setComposing] = useState(false);
  const [myOffers, setMyOffers] = useState(SEED_MY_OFFERS);
  const [repaying, setRepaying] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [activity, setActivity] = useState(() => [
    { t: stamp(new Date(Date.now() - 42000)), text: "repay settled on SOL/USDT 7d, both legs in one transaction" },
    { t: stamp(new Date(Date.now() - 164000)), text: "offer landed on mSOL/USDC 14d, terms sealed to its borrower" },
    { t: stamp(new Date(Date.now() - 371000)), text: "claim executed on mSOL/USDC 14d after the deadline passed" },
  ]);

  const log = (text) =>
    setActivity((a) => [{ t: stamp(), text }, ...a].slice(0, 20));

  const toast = (text) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  const postOffer = (draft) => {
    const id = `my-${Math.random().toString(36).slice(2, 7)}`;
    setMyOffers((o) => [{ id, marketId, ...draft }, ...o]);
    setComposing(false);
    const mk = marketById(marketId);
    log(`offer posted on ${mk.collateral}/${mk.principal}, principal locked under program custody`);
    toast(draft.designated
      ? "Offer posted and sealed to its borrower. The principal is locked until they take it or you cancel after expiry."
      : "Offer posted. The principal is locked until someone takes it or you cancel after expiry.");
  };

  const cancelOffer = (offer) => {
    setMyOffers((o) => o.filter((x) => x.id !== offer.id));
    const mk = marketById(offer.marketId);
    log(`offer cancelled on ${mk.collateral}/${mk.principal}, principal reclaimed`);
    toast("Offer cancelled. The principal is back in your private balance.");
  };

  const confirmOriginate = () => {
    const offer = picked;
    if (!offer) return;
    setOffers((o) => ({
      ...o,
      [marketId]: o[marketId].filter((x) => x.id !== offer.id),
    }));
    setPositions((p) => [
      {
        id: `ln-${offer.id}`,
        role: "borrower",
        marketId,
        state: "active",
        principal: offer.principal,
        collateral: offer.collateral,
        repay: offer.repay,
        rate: offer.rate,
        dueAt: Date.now() + termSeconds(marketId) * 1000,
      },
      ...p,
    ]);
    setPicked(null);
    setTab("positions");
    log(`loan originated on ${marketById(marketId).collateral}/${marketById(marketId).principal}, amounts encrypted`);
    toast("Loan originated. Principal and collateral settled in one transaction.");
  };

  const confirmRepay = () => {
    const pos = repaying;
    setPositions((p) =>
      p.map((x) => (x.id === pos.id ? { ...x, state: "repaid" } : x))
    );
    setRepaying(null);
    log(`repay settled on ${marketById(pos.marketId).collateral}/${marketById(pos.marketId).principal}, collateral returned`);
    toast("Repaid. Collateral is back in your private balance.");
  };

  const claim = (pos) => {
    setPositions((p) =>
      p.map((x) => (x.id === pos.id ? { ...x, state: "claimed" } : x))
    );
    log(`collateral claimed on ${marketById(pos.marketId).collateral}/${marketById(pos.marketId).principal} after default`);
    toast("Collateral claimed. The default needed no oracle, only the clock.");
  };

  const activeCount = useMemo(
    () => positions.filter((p) => p.state === "active").length,
    [positions]
  );
  const market = marketById(marketId);
  const list = offers[marketId] ?? [];

  return (
    <ViewKeyCtx.Provider value={viewKey}>
      <div className="pt-16">
        <Ticker />
      </div>
      <div className="relative overflow-hidden">
        <AmberSilk className="opacity-25" />
        <div className="relative mx-auto max-w-[1480px] px-4 pb-8 pt-7 md:px-6">
          {/* desk header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="display text-[clamp(22px,2.4vw,28px)] uppercase text-bone">
                The desk
              </h1>
              <div className="flex overflow-hidden rounded border border-line-bright">
                {[
                  ["demo", "Demo"],
                  ["live", "Live"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`px-2 py-0.5 font-ui text-[9px] font-medium uppercase tracking-wider transition-colors ${
                      mode === id
                        ? id === "live"
                          ? "bg-ember text-void"
                          : "bg-line-bright text-bone"
                        : "text-mute hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={`ml-2 hidden gap-5 border-l border-line pl-5 sm:flex ${mode === "live" ? "invisible" : ""}`}>
                {[
                  ["markets", "Markets"],
                  ["offers", `My offers${myOffers.length ? ` (${myOffers.length})` : ""}`],
                  ["positions", `Positions${activeCount ? ` (${activeCount})` : ""}`],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`relative py-1 text-[13px] transition-colors ${
                      tab === id ? "text-bone" : "text-mute hover:text-ink"
                    }`}
                  >
                    {label}
                    {tab === id && (
                      <m.span
                        layoutId="desk-tab"
                        className="absolute inset-x-0 -bottom-0.5 h-px bg-ember"
                        transition={{ duration: 0.3, ease: EASE }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewKey((v) => !v)}
              aria-pressed={viewKey}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                viewKey
                  ? "border-moss/40 bg-moss/5 text-moss"
                  : "border-line-bright bg-surface text-ink hover:border-mute"
              }`}
            >
              {viewKey ? <Key size={12} weight="bold" /> : <LockSimple size={12} weight="bold" />}
              {viewKey ? "Your view" : "Chain view"}
              <span
                className={`relative inline-block h-3.5 w-6 shrink-0 overflow-hidden rounded-full transition-colors ${
                  viewKey ? "bg-moss" : "bg-line-bright"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-void transition-transform ${
                    viewKey ? "translate-x-2.5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          </div>

          {mode === "live" ? (
            <div className="mt-4">
              <Suspense
                fallback={
                  <div className="rounded-lg border border-line bg-surface px-6 py-14 text-center text-[14px] text-mute">
                    Loading the live engine…
                  </div>
                }
              >
                <LiveDesk />
              </Suspense>
            </div>
          ) : (
          <>
          {/* mobile tabs */}
          <div className="mt-4 flex gap-5 border-b border-line sm:hidden">
            {[
              ["markets", "Markets"],
              ["offers", `My offers${myOffers.length ? ` (${myOffers.length})` : ""}`],
              ["positions", `Positions${activeCount ? ` (${activeCount})` : ""}`],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`relative pb-2 text-[13px] ${tab === id ? "text-bone" : "text-mute"}`}
              >
                {label}
                {tab === id && <span className="absolute inset-x-0 -bottom-px h-px bg-ember" />}
              </button>
            ))}
          </div>

          {/* account strip */}
          <div className="mt-4">
            <AccountStrip positions={positions} now={now} />
          </div>

          {/* main panes */}
          <div className="mt-4">
            {tab === "markets" ? (
              <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-[250px_minmax(0,1fr)_292px] lg:min-h-[480px]">
                <MarketsRail selected={marketId} onSelect={(id) => { setMarketId(id); setPicked(null); setComposing(false); }} />
                <OfferBook
                  market={market}
                  list={list}
                  selectedId={picked?.id}
                  onPick={(o) => { setPicked(o); setComposing(false); }}
                  onCompose={() => { setComposing(true); setPicked(null); }}
                />
                <OrderTicket
                  offer={picked}
                  market={market}
                  composing={composing}
                  activity={activity}
                  onCompose={postOffer}
                  onConfirm={confirmOriginate}
                  onClear={() => { setPicked(null); setComposing(false); }}
                />
              </div>
            ) : tab === "offers" ? (
              <MyOffersTable myOffers={myOffers} now={now} onCancelOffer={cancelOffer} />
            ) : positions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-bright px-6 py-16 text-center">
                <Wallet size={22} weight="bold" className="mx-auto text-faint" />
                <p className="mt-3 text-[14px] text-mute">No positions yet.</p>
                <p className="mt-1 text-[12.5px] text-faint">
                  Originate against an offer in Markets and it will appear here.
                </p>
              </div>
            ) : (
              <PositionsTable
                positions={positions}
                now={now}
                onRepay={setRepaying}
                onClaim={claim}
              />
            )}
          </div>
          </>
          )}
        </div>

        {/* status bar */}
        <div className="keyline relative">
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 md:px-6">
            <span className="font-ui text-[9.5px] font-medium uppercase tracking-[0.12em] text-faint">
              {mode === "live"
                ? "Live desk. Every action settles through the deployed program on mainnet."
                : "Demo desk, sample data. Settlement logic mirrors the on-chain program."}
            </span>
            <span className="num text-[10px] text-faint">{"program 4j3M…ZHfE"}</span>
          </div>
        </div>
      </div>

      {/* repay modal */}
      <AnimatePresence>
        {repaying && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-end justify-center bg-void/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setRepaying(null)}
          >
            <m.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="w-full max-w-md rounded-xl border border-line-bright bg-surface"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <p className="text-[15px] font-semibold text-bone">Repay</p>
                <button
                  type="button"
                  onClick={() => setRepaying(null)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:text-ink"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>
              <div className="px-5 py-4">
                <dl className="space-y-2.5">
                  {[
                    ["You pay", repaying.repay],
                    ["You get back", repaying.collateral],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between">
                      <dt className="text-[13px] text-mute">{k}</dt>
                      <dd className="num text-[13.5px] text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 rounded-lg border border-line bg-raised px-3.5 py-3 text-[12px] leading-relaxed text-mute">
                  Repayment to the lender and collateral back to you, one
                  transaction, both legs encrypted.
                </p>
                <button
                  type="button"
                  onClick={confirmRepay}
                  className="mt-5 w-full rounded-md bg-ember py-2.5 text-[13.5px] font-semibold text-void transition-all hover:bg-ember-hot active:scale-[0.99]"
                >
                  Repay in demo
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <Toasts toasts={toasts} />
    </ViewKeyCtx.Provider>
  );
}
