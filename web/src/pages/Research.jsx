import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import AmberSilk from "../components/AmberSilk.jsx";
import Block from "../components/Blocks.jsx";

const POSTS = [
  {
    slug: "default-is-a-date",
    date: "2026-11-25",
    title: "Default is a date, not a price",
    teaser:
      "Liquidation levels are standing orders against your own position. Fixed terms remove the order, not just the visibility.",
    blocks: [
      { t: "p", x: "Every margin system publishes a map of its own weak points. Collateral, debt and the liquidation threshold sit in public accounts, so the exact price at which any position can be forced is computable by anyone, continuously. An entire category of trading exists to push markets toward those prices, harvest the forced flow, and leave." },
      { t: "p", x: "The usual response is to hide the map. Encrypt the balances and the threshold is no longer public; this is real progress, and it is what encrypted margin designs pursue. But the threshold still exists. The protocol itself must evaluate price against position, so somewhere a feed meets a ratio, and the attack surface moves rather than disappears: oracle manipulation still forces the same outcome without ever reading the hidden number." },
      { t: "h2", x: "Removing the number" },
      { t: "p", x: "A fixed-term loan has a different shape. The borrower owes a known amount by a known time. Before the deadline, no market move changes anything; after it, the collateral belongs to the lender. The only input the protocol consults is the clock, and the clock cannot be pushed with size." },
      { t: "ul", x: ["No price feed participates in settlement, so there is nothing to manipulate", "No threshold exists, encrypted or otherwise, so there is nothing to compute toward", "A default resolves one loan between two parties, so there is nothing to cascade"] },
      { t: "p", x: "The cost is honesty about what this is: credit with a maturity, like most credit in the world, rather than a perpetual position. Borrowers who need duration repay and re-originate at the market's current terms. We think that trade is underpriced, because the thing it buys, the non-existence of the liquidation price, is the property every private margin system is still chasing asymptotically." },
      { t: "callout", x: "DarkRings implements this as five instructions whose only window conditions are offer expiry and the loan deadline. The clock is the entire oracle." },
    ],
  },
  {
    slug: "what-the-chain-sees",
    date: "2026-11-25",
    title: "What the chain sees when you borrow",
    teaser:
      "A walkthrough of one origination, read twice: once as the explorer, once as the borrower's view key.",
    blocks: [
      { t: "p", x: "Suppose you take a 30-day loan: stablecoins out, SOL locked. One transaction executes it. Here is everything a block explorer can learn from that transaction, exhaustively: the loan program ran its originate instruction; two shielded inputs were spent and two commitments were created; your address and a program-derived address signed; a 128-byte proof verified. That is the complete list." },
      { t: "h2", x: "What it cannot learn" },
      { t: "ul", x: ["How much you borrowed, in any asset", "How much collateral you posted, or its ratio to the loan", "The repayment amount or the interest it implies", "The deadline, until the day repay or claim reveals it to check the clock", "Which earlier deposit funded your collateral (spends are unlinkable inside the ring)"] },
      { t: "p", x: "The figures exist in exactly two other places: inside the zero-knowledge proof, which attests the terms are internally consistent without containing them legibly, and inside ciphertexts your view key decrypts. The desk shows you cleartext because it is your client, holding your key, decrypting locally." },
      { t: "h2", x: "The honest boundary" },
      { t: "p", x: "Addresses stay visible in the default ring, so the fact that you used DarkRings is public even while every figure is not. Deposits into the ring from a public account reveal that deposit; withdrawals reveal that withdrawal. Privacy here is the figures of your credit, not the fact of your participation. Anonymous rings with relayed submission are on the rails' roadmap and will tighten that boundary when they ship." },
      { t: "callout", x: "Try both readings yourself: the desk's Chain view toggle renders your own book the way the explorer sees it." },
    ],
  },
];

function Index() {
  return (
    <div className="relative overflow-hidden">
      <AmberSilk flip className="opacity-35" />
      <div className="relative mx-auto max-w-[860px] px-5 pb-28 pt-28 md:px-8">
        <h1 className="display text-[clamp(38px,5vw,64px)] uppercase text-bone">
          Research.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[15.5px] leading-relaxed text-mute">
          Design notes from building credit without a liquidation price.
        </p>
        <div className="mt-12 overflow-hidden rounded-xl border border-line">
          {POSTS.map((p) => (
            <Link
              key={p.slug}
              to={`/research/${p.slug}`}
              className="group block border-b border-line/60 bg-surface/80 px-6 py-6 backdrop-blur-sm transition-colors last:border-b-0 hover:bg-raised/70"
            >
              <p className="num text-[11px] text-faint">{p.date}</p>
              <h2 className="mt-1.5 flex items-center gap-2 text-[18px] font-semibold text-bone">
                {p.title}
                <ArrowRight
                  size={15}
                  weight="bold"
                  className="text-ember opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                />
              </h2>
              <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-mute">
                {p.teaser}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Research() {
  const { slug } = useParams();
  if (!slug) return <Index />;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return <Navigate to="/research" replace />;
  return (
    <div className="relative overflow-hidden">
      <div className="relative mx-auto max-w-[840px] px-5 pb-28 pt-28 md:px-8">
        <Link
          to="/research"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint transition-colors hover:text-ink"
        >
          Research
        </Link>
        <p className="num mt-6 text-[11.5px] text-faint">{post.date}</p>
        <h1 className="mt-2 max-w-[24ch] text-[clamp(28px,4vw,44px)] font-semibold leading-[1.1] tracking-tight text-bone">
          {post.title}
        </h1>
        <article className="prose-dr mt-2">
          {post.blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </article>
      </div>
    </div>
  );
}
