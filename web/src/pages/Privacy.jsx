import { ContentPage } from "../components/Blocks.jsx";

const BLOCKS = [
  { t: "p", x: "A privacy protocol should not need a long privacy policy. Ours is four paragraphs." },
  { t: "h3", x: "What this site collects" },
  { t: "p", x: "Nothing. No analytics, no cookies, no trackers, no wallet prompts. The desk creates its session keys and keeps its records in your browser's local storage; they never leave your machine, and clearing site data deletes them. API calls go through our proxy to the Solana RPC, indexer and prover with no identifiers attached beyond what those requests inherently carry." },
  { t: "h3", x: "What the protocol will see" },
  { t: "p", x: "When live, the protocol sees what the chain sees: addresses, commitments and ciphertexts. Your amounts decrypt only under your view key. We run no server that learns your balances, and the design leaves no place to put one." },
  { t: "h3", x: "View keys are yours to share" },
  { t: "p", x: "Showing your history to an accountant, a counterparty or a court is a choice you make by handing over a view key, never a default we make for you." },
  { t: "h3", x: "Questions" },
  { t: "p", x: "Ask them publicly on the repository once it opens with the hackathon submission; privacy claims deserve public answers." },
];

export default function Privacy() {
  return <ContentPage title="Privacy policy" blocks={BLOCKS} />;
}
