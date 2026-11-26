import AmberSilk from "../components/AmberSilk.jsx";
import NumberTicker from "../components/NumberTicker.jsx";

const PUBLIC_STATS = [
  { n: 1, label: "asset on the desk", sub: "SOL today, any mint by design" },
  { n: 5, label: "instructions", sub: "the whole lifecycle" },
  { n: 5, label: "circuits", sub: "one proof per move" },
  { n: 75, label: "tests passing", sub: "adversarial cases included" },
  { n: 128, label: "bytes per proof", sub: "verified on-chain" },
  { n: 8, label: "mainnet settlements", sub: "the proof lifecycle, linked on the front page" },
];

const REDACTED = [
  ["Total value locked", "the number every venue leads with"],
  ["Volume, 24h and all time", "the number snipers sort by"],
  ["Largest position", "the number hunters shortlist"],
  ["Average collateral ratio", "the number that prices an attack"],
  ["Per-wallet exposure", "the number that doxes a balance sheet"],
];

export default function Stats() {
  return (
    <div className="relative overflow-hidden">
      <AmberSilk flip className="opacity-40" />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-28 pt-28 md:px-8">
        <h1 className="display text-[clamp(38px,5.5vw,72px)] uppercase leading-[0.98] text-bone">
          Protocol stats.
        </h1>
        <p className="mt-5 max-w-[58ch] text-[15.5px] leading-relaxed text-mute">
          The honest version of a stats page. What can be counted is below.
          What other venues publish about you is further down, shown the only
          way this protocol can show it.
        </p>

        <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
          {PUBLIC_STATS.map(({ n, label, sub }) => (
            <div key={label} className="bg-surface px-6 py-7">
              <NumberTicker
                value={n}
                className="display text-[clamp(34px,3.6vw,52px)] text-bone"
              />
              <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mute">
                {label}
              </p>
              <p className="mt-1 text-[12px] text-faint">{sub}</p>
            </div>
          ))}
        </div>

        <h2 className="display mt-20 text-[clamp(26px,3.2vw,40px)] uppercase text-bone">
          Numbers that <span className="display-ghost">do not exist here.</span>
        </h2>
        <p className="mt-4 max-w-[56ch] text-[14.5px] leading-relaxed text-mute">
          Not withheld. Not admin-only. Never materialized, on-chain or off,
          in cleartext or in cipher.
        </p>
        <div className="mt-8 overflow-hidden rounded-xl border border-line bg-surface/80 backdrop-blur-sm">
          {REDACTED.map(([label, why]) => (
            <div
              key={label}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 px-6 py-4 last:border-b-0"
            >
              <div>
                <p className="text-[14px] text-ink">{label}</p>
                <p className="mt-0.5 text-[12px] text-faint">{why}</p>
              </div>
              <span className="num text-[16px] tracking-widest text-faint">
                {"▮▮▮,▮▮▮,▮▮▮"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[64ch] text-[12.5px] leading-relaxed text-faint">
          Counts only, never sizes: that is the whole point. The protocol is
          live on mainnet and this page keeps exactly this shape as it grows.
        </p>
      </div>
    </div>
  );
}
