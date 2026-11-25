import { MARKETS } from "../lib/demo.js";

/* One strip, duplicated once for the loop. Terms and rates are public
   protocol parameters; volume is exactly what the chain refuses to say. */
function Row() {
  return (
    <div className="flex shrink-0 items-center">
      {MARKETS.map((mk) => (
        <span
          key={mk.id}
          className="flex items-center gap-2.5 whitespace-nowrap border-r border-line px-6 font-mono text-[11.5px] text-mute"
        >
          <span className="text-ink">
            {mk.collateral}/{mk.principal}
          </span>
          <span>{mk.termShort}</span>
          <span className="text-faint">fixed {mk.rateBand}</span>
          <span className="text-faint">
            vol <span className="text-mute">{"▮▮▮"}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

export default function Ticker() {
  return (
    <div
      className="marquee relative overflow-hidden border-b border-line/70 bg-surface/40 py-2.5"
      aria-hidden="true"
    >
      <div className="marquee-track flex w-max">
        <Row />
        <Row />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-void to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-void to-transparent" />
    </div>
  );
}
