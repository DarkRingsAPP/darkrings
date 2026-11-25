import { ContentPage } from "../components/Blocks.jsx";

const BLOCKS = [
  { t: "p", x: "Short, because honesty is short. The long version will arrive with the audited release." },
  { t: "h3", x: "What this site is" },
  { t: "p", x: "A demonstration of the DarkRings protocol. The desk operates on sample data and simulates settlement locally in your browser. No transaction you perform here touches a blockchain, moves funds, or creates an obligation for anyone." },
  { t: "h3", x: "No offer, no advice" },
  { t: "p", x: "Nothing on this site is an offer to lend or borrow, a solicitation, or financial advice. Fixed-term overcollateralized lending carries real risk, including the loss of collateral on default and the loss of principal on a counterparty's default." },
  { t: "h3", x: "Software, as is" },
  { t: "p", x: "The protocol is pre-audit software provided as is, without warranties of any kind. Until the trusted setup ceremony and an audit complete, it must not be used with funds of value, and we say so on every page that could invite it." },
  { t: "h3", x: "Your keys" },
  { t: "p", x: "The protocol is non-custodial. When a live release exists, you alone hold your spending keys and your view keys; losing them is not something anyone, including us, can undo." },
];

export default function Terms() {
  return <ContentPage title="Terms of use" blocks={BLOCKS} />;
}
