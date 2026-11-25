import AmberSilk from "../components/AmberSilk.jsx";

const ENTRIES = [
  {
    date: "2026-11-25",
    title: "The desk covers the whole protocol",
    items: [
      "Lenders post offers from the ticket pane, with live repay and ratio preview against each market's minimum",
      "My offers view with expiry countdowns; cancel unlocks when the window opens, as on-chain",
      "Account strip, order ticket pane, activity log, three-pane terminal layout",
      "Security, About, Terms, Privacy, Markets, Stats, Research and this page",
    ],
  },
  {
    date: "2026-11-25",
    title: "Site v3",
    items: [
      "Clash Display type system, OKLCH palette, amber silk backgrounds",
      "Three.js ring with a ciphertext orbit in the hero, engraved fallback",
      "Scroll-driven decrypt sequence and the paper proof block",
    ],
  },
  {
    date: "2026-11-25",
    title: "Loan program complete and verified",
    items: [
      "Five instructions: offer, originate, repay, claim, cancel",
      "Five Groth16 circuits compiled through Xark, verifiers pinned to key checksums",
      "75 tests green, including adversarial suites and three full-lifecycle localnet runs",
      "Real-clock default claim verified: early claim refused, post-deadline claim settles",
    ],
  },
  {
    date: "2026-11-25",
    title: "Rings foundation proven on mainnet",
    items: [
      "Register, deposit, private transfer, encrypted balance reads and withdraw, end to end on mainnet with dust amounts",
      "Unified Helius endpoint wiring, priority fees and resend logic worked out",
    ],
  },
  {
    date: "2026-11-10",
    title: "The rails go live",
    items: [
      "Helius ships Solana Privacy Rings to mainnet. DarkRings becomes buildable",
    ],
  },
];

export default function Changelog() {
  return (
    <div className="relative overflow-hidden">
      <AmberSilk className="opacity-35" />
      <div className="relative mx-auto max-w-[860px] px-5 pb-28 pt-28 md:px-8">
        <h1 className="display text-[clamp(38px,5vw,64px)] uppercase text-bone">
          Changelog.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[15.5px] leading-relaxed text-mute">
          What shipped and when. Working software first, site second, promises
          never.
        </p>
        <ol className="mt-14">
          {ENTRIES.map((e, i) => (
            <li
              key={i}
              className="relative border-l border-line pb-12 pl-8 last:pb-0"
            >
              <span className="absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full border border-ember bg-void" />
              <p className="num text-[11.5px] text-faint">{e.date}</p>
              <h2 className="mt-1.5 text-[17px] font-semibold text-bone">
                {e.title}
              </h2>
              <ul className="mt-3 space-y-1.5">
                {e.items.map((it) => (
                  <li key={it} className="flex gap-3 text-[13.5px] leading-relaxed text-mute">
                    <span className="mt-[9px] h-px w-3 shrink-0 bg-ember/70" />
                    {it}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
