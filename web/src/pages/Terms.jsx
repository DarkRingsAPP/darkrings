import { ContentPage } from "../components/Blocks.jsx";

const BLOCKS = [
  { t: "p", x: "Short, because honesty is short. The long version will arrive with the audited release." },
  { t: "h3", x: "What this site is" },
  { t: "p", x: "The live interface to the DarkRings protocol. The desk creates session keys in your browser and every action on it submits a real transaction to the deployed program on Solana mainnet, spending real SOL you chose to send to those session addresses. Nothing happens until you fund them and click." },
  { t: "h3", x: "No offer, no advice" },
  { t: "p", x: "Nothing on this site is an offer to lend or borrow, a solicitation, or financial advice. Fixed-term overcollateralized lending carries real risk, including the loss of collateral on default and the loss of principal on a counterparty's default." },
  { t: "h3", x: "Software, as is" },
  { t: "p", x: "The protocol is pre-audit software provided as is, without warranties of any kind. Until the trusted setup ceremony and an audit complete, keep the amounts you put through it small, dust you can afford to lose entirely, and we say so on every page that could invite more." },
  { t: "h3", x: "Your keys" },
  { t: "p", x: "The protocol is non-custodial. Your session keys live in your browser's local storage and never reach us or anyone else; clearing site data deletes them together with access to any funds they hold. Losing them is not something anyone, including us, can undo. Back up what matters before it matters." },
];

export default function Terms() {
  return <ContentPage title="Terms of use" blocks={BLOCKS} />;
}
