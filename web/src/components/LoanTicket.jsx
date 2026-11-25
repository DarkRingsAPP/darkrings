import { useState } from "react";
import { Key, LockSimple } from "@phosphor-icons/react";
import Decrypt from "./Decrypt.jsx";

const ROWS = [
  { label: "Principal", value: "3,200.00 USDC" },
  { label: "Collateral", value: "24.80 SOL" },
  { label: "Repays", value: "3,296.00 USDC" },
  { label: "Due", value: "Dec 25, 14:00 UTC" },
];

/**
 * A live miniature of the lending desk: one loan ticket whose values are
 * ciphertext until the viewer turns their view key. This is the product's
 * whole argument in one component.
 */
export default function LoanTicket() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="w-full max-w-[400px]">
      <div className="rounded-xl border border-line bg-surface shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
        {/* market header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="font-mono text-[13px] font-medium text-bone">
              SOL / USDC
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-mute">
              fixed term, 30 days
            </p>
          </div>
          <span className="rounded-full border border-line-bright px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mute">
            offer
          </span>
        </div>

        {/* the encrypted figures */}
        <dl className="px-5 py-2">
          {ROWS.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-baseline justify-between border-b border-line/60 py-3 last:border-b-0"
            >
              <dt className="text-[13px] text-mute">{label}</dt>
              <dd className="text-[14px] text-ink">
                <Decrypt value={value} revealed={revealed} />
              </dd>
            </div>
          ))}
        </dl>

        {/* state + the view key */}
        <div className="flex items-center justify-between rounded-b-xl border-t border-line bg-raised px-5 py-3.5">
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-mute">
            {revealed ? (
              <>
                <Key size={13} weight="bold" className="text-moss" />
                <span className="text-moss">your view key</span>
              </>
            ) : (
              <>
                <LockSimple size={13} weight="bold" />
                encrypted on-chain
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
            className="group flex items-center gap-2 rounded-full border border-line-bright py-1.5 pl-3 pr-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ember/60 active:scale-[0.98]"
          >
            View key
            <span
              className={`relative inline-block h-4 w-7 shrink-0 overflow-hidden rounded-full transition-colors ${
                revealed ? "bg-ember" : "bg-line-bright"
              }`}
            >
              <span
                className={`absolute left-0.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-bone transition-transform ${
                  revealed ? "translate-x-3" : "translate-x-0"
                }`}
              />
            </span>
          </button>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-faint">
        Example offer. On-chain, every figure in this ticket is ciphertext.
      </p>
    </div>
  );
}
