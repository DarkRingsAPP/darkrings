import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import AmberSilk from "../components/AmberSilk.jsx";
import Spotlight from "../components/Spotlight.jsx";
import { MARKETS } from "../lib/demo.js";

const ROWS = [
  ["Collateral", (mk) => mk.collateral],
  ["Principal", (mk) => mk.principal],
  ["Term", (mk) => mk.term],
  ["Fixed rate band", (mk) => mk.rateBand],
  ["Minimum ratio", (mk) => mk.minRatio],
  ["Open offers", (mk) => String(mk.openOffers)],
  ["Book size", () => "▮▮▮,▮▮▮"],
];

export default function Markets() {
  return (
    <div className="relative overflow-hidden">
      <AmberSilk className="opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-28 pt-28 md:px-8">
        <h1 className="display text-[clamp(38px,5.5vw,72px)] uppercase leading-[0.98] text-bone">
          Markets.
        </h1>
        <p className="mt-5 max-w-[58ch] text-[15.5px] leading-relaxed text-mute">
          Every market is isolated: one collateral, one principal, one term.
          The parameters below are protocol constants, public by design.
          Everything that moves through them is not.
        </p>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {MARKETS.map((mk) => (
            <Spotlight
              key={mk.id}
              className="rounded-xl border border-line bg-surface/80 p-6 backdrop-blur-sm"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-mono text-[17px] font-medium text-bone">
                  {mk.collateral}/{mk.principal}
                </h2>
                <span className="rounded-md border border-line-bright px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mute">
                  isolated
                </span>
              </div>
              <dl className="mt-5">
                {ROWS.map(([label, get]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between border-b border-line/50 py-2 last:border-b-0"
                  >
                    <dt className="text-[12.5px] text-mute">{label}</dt>
                    <dd
                      className={`num text-[12.5px] ${
                        label === "Book size" ? "text-faint" : "text-ink"
                      }`}
                    >
                      {get(mk)}
                    </dd>
                  </div>
                ))}
              </dl>
              <Link
                to="/desk"
                className="group mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink"
              >
                <span className="underline decoration-line-bright underline-offset-4 transition-colors group-hover:decoration-ember">
                  Open this book on the desk
                </span>
                <ArrowRight size={13} weight="bold" className="text-ember transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Spotlight>
          ))}
        </div>

        <p className="mt-10 max-w-[64ch] text-[13px] leading-relaxed text-faint">
          A defaulting loan touches exactly one lender and one borrower. There
          is no shared pool to socialize a loss into, and no utilization
          number for rates to chase. New markets ship as fixed parameter
          sets, never as governance surprises.
        </p>
      </div>
    </div>
  );
}
