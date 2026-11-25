import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion as m, useReducedMotion } from "motion/react";
import AmberSilk from "../components/AmberSilk.jsx";
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Clock,
  Eye,
  EyeSlash,
  User,
} from "@phosphor-icons/react";

const EASE = [0.16, 1, 0.3, 1];

const CHIPS = {
  principal: { label: "3,200 USDC", sub: "principal", tone: "border-ember/50 text-ember" },
  collateral: { label: "24.80 SOL", sub: "collateral", tone: "border-line-bright text-bone" },
  repayment: { label: "3,296 USDC", sub: "repayment", tone: "border-moss/50 text-moss" },
};

const STEPS = [
  {
    id: "start",
    name: "two strangers",
    ix: null,
    place: { principal: "lender", collateral: "borrower", repayment: null },
    text: "A lender holds stablecoins and wants fixed yield. A borrower holds SOL and wants liquidity without selling. Neither wants the market watching.",
    sees: ["two funded private balances"],
    hidden: ["every balance and its size"],
    clock: null,
  },
  {
    id: "offer",
    name: "offer",
    ix: "offer",
    place: { principal: "escrow", collateral: "borrower", repayment: null },
    text: "The lender locks the principal under program custody and commits the terms: collateral asset and amount, repayment, deadline. The offer is encrypted to the borrower it names.",
    sees: ["an offer UTXO appeared", "the lender's address"],
    hidden: ["principal size", "every term of the deal"],
    clock: null,
  },
  {
    id: "originate",
    name: "originate",
    ix: "originate",
    place: { principal: "borrower", collateral: "escrow", repayment: null },
    text: "The borrower posts the collateral and takes the principal in the same transaction. There is no moment where one side has performed and the other has not.",
    sees: ["one transaction, two commitments", "both signers"],
    hidden: ["both amounts", "the ratio", "the deadline"],
    clock: "accepted only before the offer expires",
    atomic: true,
  },
  {
    id: "repay",
    name: "repay",
    ix: "repay",
    place: { principal: "borrower", collateral: "borrower", repayment: "lender" },
    text: "Before the deadline the borrower repays. The repayment reaches the lender and the collateral returns, again in one transaction. The loan is over.",
    sees: ["one transaction, two commitments"],
    hidden: ["the repayment size", "the collateral returning"],
    clock: "accepted only while now is before the deadline",
    atomic: true,
  },
  {
    id: "claim",
    name: "claim",
    ix: "claim",
    place: { principal: "borrower", collateral: "lender", repayment: null },
    text: "The other ending. The deadline passes unpaid and the lender claims the collateral. Default is a date on a clock, not a price on a feed, so nobody could push it.",
    sees: ["the claim, after the deadline"],
    hidden: ["what the collateral was worth"],
    clock: "accepted only after the deadline has passed",
  },
];

const COLUMNS = [
  { id: "lender", label: "Lender", icon: User },
  { id: "escrow", label: "Program escrow", icon: Bank },
  { id: "borrower", label: "Borrower", icon: User },
];

function Chip({ id }) {
  const chip = CHIPS[id];
  return (
    <m.div
      layoutId={`chip-${id}`}
      transition={{ duration: 0.65, ease: EASE }}
      className={`w-full rounded-lg border bg-raised px-3.5 py-2.5 ${chip.tone}`}
    >
      <p className="num text-[13px] font-medium">{chip.label}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider opacity-60">
        {chip.sub}
      </p>
    </m.div>
  );
}

export default function HowItWorks() {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();
  const s = STEPS[step];

  return (
    <div className="relative overflow-hidden">
      <AmberSilk className="opacity-45" />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-28 pt-28 md:px-8">
      <h1 className="display max-w-[20ch] text-[clamp(40px,6vw,76px)] uppercase leading-[0.98] text-bone">
        A loan, step by step.
      </h1>
      <p className="mt-5 max-w-[52ch] text-[15.5px] leading-relaxed text-mute">
        Walk the whole lifecycle. Watch what moves, what the chain learns, and
        what it never does. The last two steps are the two possible endings.
      </p>

      {/* step picker */}
      <div className="mt-12 flex flex-wrap gap-2">
        {STEPS.map((st, i) => (
          <button
            key={st.id}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-full border px-4 py-2 font-mono text-[12px] transition-colors ${
              i === step
                ? "border-ember bg-ember/10 text-ember"
                : "border-line-bright text-mute hover:border-mute hover:text-ink"
            }`}
          >
            {st.name}
          </button>
        ))}
      </div>

      {/* the board */}
      <div className="mt-8 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="grid grid-cols-3 divide-x divide-line">
          {COLUMNS.map(({ id, label, icon: Icon }) => (
            <div key={id} className="min-h-[220px] p-4 md:p-6">
              <div className="flex items-center gap-2">
                <Icon size={14} weight="bold" className="text-faint" />
                <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                  {label}
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-2.5">
                {Object.entries(s.place)
                  .filter(([, col]) => col === id)
                  .map(([chipId]) => (
                    <Chip key={chipId} id={chipId} />
                  ))}
              </div>
            </div>
          ))}
        </div>
        {s.atomic && (
          <div className="border-t border-ember/30 bg-ember/5 px-5 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ember">
            both legs settle in one transaction
          </div>
        )}
      </div>

      {/* step narration */}
      <AnimatePresence mode="wait">
        <m.div
          key={s.id}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mt-8 grid gap-8 md:grid-cols-[1.2fr_1fr]"
        >
          <div>
            <div className="flex items-center gap-3">
              {s.ix ? (
                <span className="font-mono text-[16px] font-medium text-bone">
                  {s.ix}
                </span>
              ) : (
                <span className="text-[16px] font-medium text-bone">
                  Before anything happens
                </span>
              )}
              {s.ix && (
                <span className="rounded-full border border-line-bright px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mute">
                  instruction
                </span>
              )}
            </div>
            <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-mute">
              {s.text}
            </p>
            {s.clock && (
              <p className="mt-4 flex items-center gap-2 font-mono text-[12px] text-mute">
                <Clock size={14} weight="bold" className="text-ember" />
                {s.clock}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 self-start">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">
                <EyeSlash size={12} weight="bold" /> chain sees
              </p>
              <ul className="mt-3 space-y-1.5 text-[12.5px] leading-snug text-mute">
                {s.sees.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-moss">
                <Eye size={12} weight="bold" /> stays private
              </p>
              <ul className="mt-3 space-y-1.5 text-[12.5px] leading-snug text-mute">
                {s.hidden.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </m.div>
      </AnimatePresence>

      {/* prev / next */}
      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((x) => Math.max(0, x - 1))}
          className="flex items-center gap-2 rounded-full border border-line-bright px-5 py-2.5 text-[13.5px] font-medium text-ink transition-colors enabled:hover:border-mute disabled:opacity-35"
        >
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((x) => Math.min(STEPS.length - 1, x + 1))}
            className="flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-[13.5px] font-semibold text-void transition-all hover:bg-[#ff7b52] active:scale-[0.98]"
          >
            Next step
            <ArrowRight size={14} weight="bold" />
          </button>
        ) : (
          <Link
            to="/desk"
            className="flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-[13.5px] font-semibold text-void transition-all hover:bg-[#ff7b52] active:scale-[0.98]"
          >
            Try it on the desk
            <ArrowRight size={14} weight="bold" />
          </Link>
        )}
      </div>
      </div>
    </div>
  );
}
