import AmberSilk from "../components/AmberSilk.jsx";
import { ContentPage } from "../components/Blocks.jsx";

const BLOCKS = [
  { t: "h2", x: "The problem we refuse to inherit" },
  { t: "p", x: "Every lending venue on every chain publishes the one number that gets its users hurt: the liquidation level. Bots index it, markets get pushed toward it, and cascades do the rest. The industry treats this as weather. We treat it as a design defect." },
  { t: "h2", x: "The position" },
  { t: "p", x: "A loan is a private agreement between two parties, and a chain's job is to enforce it, not to broadcast it. DarkRings loans are fixed-term and overcollateralized, every figure lives on-chain as ciphertext, and default is a date on a clock rather than a price on a feed. The liquidation level is not hidden. It does not exist." },
  { t: "h2", x: "What DarkRings is" },
  { t: "ul", x: [
    "A peer-to-peer lending market on Solana Privacy Rings",
    "Isolated markets: one collateral, one principal, one term, no shared pool",
    "Atomic settlement: origination and repayment each happen in one transaction",
    "Non-custodial throughout: a program-derived address holds escrow, nobody holds your keys",
  ] },
  { t: "h2", x: "Where it came from" },
  { t: "p", x: "DarkRings is built for the Solana Privacy Rings ecosystem, on the rails Helius shipped to mainnet in November 2026. The loan program, its five zero-knowledge circuits and its full test suite were built and verified first; this site and the demo desk sit on top of that work, not in place of it." },
  { t: "h2", x: "Where it is going" },
  { t: "ul", x: [
    "Trusted setup ceremony for the five circuits",
    "Audit of the loan program",
    "Devnet deployment, then mainnet with conservative caps",
    "Open-sourcing the full repository with the hackathon submission",
  ] },
  { t: "callout", x: "Until the ceremony and the audit, the desk runs demo data. We would rather ship you proof than promises." },
];

export default function About() {
  return (
    <div className="relative overflow-hidden">
      <AmberSilk flip className="opacity-35" />
      <ContentPage
        title="About"
        intro="Why this market exists, what it refuses to publish, and the order in which the serious things happen."
        blocks={BLOCKS}
      />
    </div>
  );
}
