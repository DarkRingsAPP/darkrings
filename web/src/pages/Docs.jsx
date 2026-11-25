import { NavLink, useParams, Navigate } from "react-router-dom";
import Block from "../components/Blocks.jsx";

/* ------------------------------ content model ----------------------------- */

const DOCS = [
  {
    slug: "overview",
    title: "Overview",
    blocks: [
      { t: "p", x: "DarkRings is a peer-to-peer lending market on Solana Privacy Rings. Loans are fixed-term and overcollateralized, and every amount involved, principal, collateral, repayment, lives on-chain only as ciphertext inside shielded UTXOs." },
      { t: "p", x: "The consequence is structural, not cosmetic: because a loan's only condition is a deadline, no liquidation price exists anywhere in the system. Not published, not encrypted, not computable. The attack surface that defines every other lending venue is simply absent." },
      { t: "h2", x: "What is encrypted" },
      { t: "ul", x: ["Principal, collateral, repayment amounts", "Collateral ratios, individually and in aggregate", "Market volumes and book depth", "Realized rates of any particular loan"] },
      { t: "h2", x: "What is public" },
      { t: "ul", x: ["That the loan program ran, and which instruction", "Participating Solana addresses (the default ring keeps addresses visible)", "Market parameters: terms, rate bands, minimum ratios", "Deadlines, at the moment repay or claim reveals them"] },
      { t: "callout", x: "Status: live on mainnet with one full lifecycle settled in real SOL, after 75 passing tests and three localnet end-to-end runs. It is pre-audit, with keys built on the Hermez Powers of Tau. Treat it as a working proof, not a vault." },
    ],
  },
  {
    slug: "mechanism",
    title: "Mechanism",
    blocks: [
      { t: "p", x: "A loan is two shielded UTXOs over its lifetime. The offer UTXO holds the lender's principal under program custody, with the terms committed into its state. The loan UTXO holds the borrower's collateral the same way. The program owns both through a per-lender PDA and spends them only when a zero-knowledge proof of the loan's rules verifies." },
      { t: "h2", x: "Terms" },
      { t: "code", x: "loan_terms = (\n    lender,              // receives repayment, claims on default\n    borrower,            // receives principal, reclaims collateral\n    principal  (asset, amount),\n    collateral (asset, amount),\n    repay_amount,        // principal + fixed interest\n    deadline,            // unix seconds\n)" },
      { t: "p", x: "Terms are set once, at the offer. Nothing about a loan can change after origination, by either side or by us." },
      { t: "h2", x: "Atomic settlement" },
      { t: "p", x: "Origination and repayment are both two-sided settlements, and both execute as a single Solana transaction with two inputs and two outputs. At origination the collateral enters escrow and the principal reaches the borrower together; at repayment the repayment reaches the lender and the collateral returns together. A half-funded loan is not a state the system can represent." },
      { t: "h2", x: "Markets" },
      { t: "p", x: "Markets are isolated pairs: one collateral asset, one principal asset, one term. Offers in a market are independent bilateral contracts; there is no shared pool, no utilization curve, and no socialized risk. A default touches one lender and one borrower." },
      { t: "h2", x: "Discovery" },
      { t: "p", x: "An offer carries a marker message tagged to its designated borrower and encrypted to their viewing key. The borrower's wallet finds it by scanning its own tags; nobody else can tell which offers exist for whom. Lenders rediscover their own offers and loans the same way, through their viewing keys." },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy model",
    blocks: [
      { t: "p", x: "DarkRings inherits its confidentiality from the Solana Privacy Program's default ring: amounts and assets are encrypted, addresses stay visible. The loan program adds no telemetry of its own and stores no state outside the shielded UTXOs." },
      { t: "h2", x: "Public" },
      { t: "ul", x: ["Which instruction ran, and when", "The Solana signers of each transaction", "UTXO commitments and ciphertexts", "The deadline, revealed at repay or claim so the program can check it against the clock"] },
      { t: "h2", x: "Private" },
      { t: "ul", x: ["Every amount: principal, collateral, repayment", "The collateral ratio at every point in the loan's life", "Which earlier balance funded a given deposit (spends are unlinkable inside the ring)"] },
      { t: "h2", x: "View keys" },
      { t: "p", x: "A view key decrypts what concerns you and nothing else. Borrowers see their loans; lenders see their offers, their loans and their repayments. Handing someone your view key shows them your history; it never lets them spend." },
      { t: "h2", x: "Honest edges" },
      { t: "p", x: "Privacy has boundaries you should know. Deposits into the ring from a public account reveal that deposit's amount and source. Withdrawals to a public account reveal that withdrawal. Addresses are visible in the default ring, so the fact that you interacted with the loan program is public even while every figure is not. Anonymous rings with relayed submission are on the rails' roadmap, not shipped." },
    ],
  },
  {
    slug: "instructions",
    title: "Instructions",
    blocks: [
      { t: "p", x: "Five instructions cover the whole lifecycle. Each verifies a Groth16 proof of its own rules, checks the clock where a window applies, and hands the confidential transfer to the Solana Privacy Program with the loan authority PDA as co-signer." },
      { t: "h3", x: "offer" },
      { t: "table", head: ["signer", "window", "shape"], rows: [["lender", "none", "1 in, 2 out: source to change + offer UTXO"]] },
      { t: "p", x: "Locks the principal and commits the terms. The offer output is encrypted to the designated borrower's viewing key and announced by a marker message only they can find." },
      { t: "h3", x: "originate" },
      { t: "table", head: ["signer", "window", "shape"], rows: [["borrower", "now before offer expiry", "2 in, 2 out: offer + collateral to principal + loan UTXO"]] },
      { t: "p", x: "The atomic exchange. The proof pins the collateral to the committed asset and amount, enforces the designated borrower, and binds the new loan UTXO to the lender's PDA." },
      { t: "h3", x: "repay" },
      { t: "table", head: ["signer", "window", "shape"], rows: [["borrower", "now at or before deadline", "2 in, 2 out: loan + repayment to collateral + payout"]] },
      { t: "p", x: "The happy ending. Exactly the committed repayment reaches the lender; the whole collateral returns to the borrower." },
      { t: "h3", x: "claim" },
      { t: "table", head: ["signer", "window", "shape"], rows: [["lender", "now after deadline", "1 in, 1 out: loan to collateral payout"]] },
      { t: "p", x: "The default path. Only the committed lender can claim, only after the deadline, and only the whole collateral to themselves." },
      { t: "h3", x: "cancel" },
      { t: "table", head: ["signer", "window", "shape"], rows: [["lender", "now after offer expiry", "1 in, 1 out: offer to principal refund"]] },
      { t: "p", x: "Reclaims an offer nobody took. The principal returns to the lender who locked it." },
    ],
  },
  {
    slug: "verify",
    title: "Verification",
    blocks: [
      { t: "p", x: "Do not take this page's word for anything. The program, circuits and tests are reproducible from source." },
      { t: "h2", x: "Program" },
      { t: "code", x: "4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE" },
      { t: "p", x: "A stateless Pinocchio program of five instructions. It owns no accounts; loans live as leaves in the Privacy Program's trees, moved by CPI under a per-lender PDA signature." },
      { t: "h2", x: "Circuits" },
      { t: "p", x: "Five Groth16 circuits written in Rust and compiled through Xark, between roughly 3,000 and 8,000 constraints each, 128-byte proofs, verified on-chain by generated verifiers pinned to key checksums." },
      { t: "h2", x: "Reproduce" },
      { t: "code", x: "zolana zk compile --test --manifest-path program/Cargo.toml\nscripts/check-keys.sh\ncargo build-sbf --manifest-path program/Cargo.toml \\\n  --tools-version v1.54 --arch v0 -- --features bpf-entrypoint\ncargo test --release --workspace" },
      { t: "p", x: "The suite is 75 tests: circuit tests that prove and verify every instruction, adversarial tests that tamper with every public input, and three localnet end-to-end runs covering the full lifecycle, cancellation and a real-clock default claim." },
      { t: "h2", x: "Rails" },
      { t: "p", x: "Settlement happens inside the Solana Privacy Program, audited by OtterSec, Certora and ZK Security, with formal verification in progress by the Helius team." },
      { t: "callout", x: "The DarkRings program itself is pre-audit. Its proving keys are a phase-2 setup over the public Hermez Powers of Tau transcript, single-party and with the randomness discarded; a multi-party phase-2 ceremony precedes any deployment that custodies meaningful value." },
    ],
  },
  {
    slug: "faq",
    title: "FAQ",
    blocks: [
      { t: "h3", x: "Is my address hidden?" },
      { t: "p", x: "No. The default ring encrypts amounts and assets, not addresses. The fact that you used DarkRings is public; every figure involved is not. Anonymous rings with relayed submission are on the rails' roadmap." },
      { t: "h3", x: "Can anyone compute my collateral ratio?" },
      { t: "p", x: "No. Both legs of the ratio are ciphertext, and the ratio is never materialized on-chain, encrypted or otherwise. The desk shows it to you locally, from your own view key." },
      { t: "h3", x: "What happens if nobody takes my offer?" },
      { t: "p", x: "Offers carry their own expiry. Once it passes, cancel returns the principal to you. Until it passes, the offer is a standing commitment the designated borrower can accept." },
      { t: "h3", x: "What exactly happens on default?" },
      { t: "p", x: "Nothing, automatically. After the deadline the borrower's repay window closes and the lender's claim window opens. The lender submits the claim and takes the whole collateral. No oracle participates; the only authority consulted is the clock." },
      { t: "h3", x: "Why fixed rates and fixed terms?" },
      { t: "p", x: "Floating rates need a public utilization number to float against, and that number is exactly the kind of signal this system refuses to emit. Fixed terms make the deadline the only condition, which is what removes the liquidation price entirely." },
      { t: "h3", x: "Who holds the collateral?" },
      { t: "p", x: "A program-derived account that only the loan program can sign for, and the program signs only for the five moves whose proofs verify. We never hold funds and cannot move them." },
    ],
  },
  {
    slug: "risks",
    title: "Risks",
    blocks: [
      { t: "p", x: "Plainly, the things that can go wrong." },
      { t: "h3", x: "Default risk" },
      { t: "p", x: "If your borrower does not repay, you receive the collateral instead of the repayment. Overcollateralization cushions this; it does not eliminate it. The collateral's price can fall during the term, and no one will liquidate early on your behalf, by design." },
      { t: "h3", x: "Contract risk" },
      { t: "p", x: "The loan program is new and unaudited. Its keys build on the Hermez Powers of Tau with a single-party phase-2, so it should hold no meaningful value until a multi-party ceremony and an audit say otherwise." },
      { t: "h3", x: "Rails risk" },
      { t: "p", x: "Solana Privacy Rings shipped to mainnet in November 2026 and its endpoints are labeled beta. DarkRings inherits any fault in the rails it builds on." },
      { t: "h3", x: "Rollover risk" },
      { t: "p", x: "Fixed terms end. If you need the loan longer, you repay and re-originate at whatever the market offers then. There is no automatic extension." },
      { t: "callout", x: "Collateral is at risk on default. Nothing on this site is financial advice." },
    ],
  },
];

/* ---------------------------------- layout -------------------------------- */

export default function Docs() {
  const { slug } = useParams();
  const doc = DOCS.find((d) => d.slug === (slug ?? "overview"));
  if (!doc) return <Navigate to="/docs" replace />;

  return (
    <div className="mx-auto grid max-w-[1200px] gap-10 px-5 pb-28 pt-24 md:grid-cols-[200px_1fr] md:px-8">
      {/* sidebar */}
      <aside className="md:sticky md:top-24 md:self-start">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
          Documentation
        </p>
        <nav className="mt-4 flex flex-row flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-y-0.5">
          {DOCS.map((d) => (
            <NavLink
              key={d.slug}
              to={d.slug === "overview" ? "/docs" : `/docs/${d.slug}`}
              end
              className={({ isActive }) =>
                `rounded-md py-1.5 text-[13.5px] transition-colors md:px-2.5 ${
                  isActive
                    ? "text-bone md:bg-raised"
                    : "text-mute hover:text-ink"
                }`
              }
            >
              {d.title}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* content */}
      <article className="prose-dr min-w-0">
        <h1 className="display text-[clamp(34px,4vw,48px)] uppercase text-bone">
          {doc.title}
        </h1>
        {doc.blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
      </article>
    </div>
  );
}
