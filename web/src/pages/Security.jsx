import AmberSilk from "../components/AmberSilk.jsx";
import { ContentPage } from "../components/Blocks.jsx";

const BLOCKS = [
  { t: "h2", x: "The rails" },
  { t: "p", x: "Every confidential transfer DarkRings makes settles inside the Solana Privacy Program, live on mainnet and audited by OtterSec, Certora and ZK Security, with formal verification of the permissionless programs in progress by the Helius team. DarkRings never re-implements the shielded pool; it only adds rules on top." },
  { t: "h2", x: "The loan program" },
  { t: "p", x: "A stateless program of five instructions. It owns no accounts and holds no upgradeable state a key could quietly change: loans live as leaves in the Privacy Program's trees, spendable only through proofs the program verifies on-chain." },
  { t: "code", x: "4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE" },
  { t: "table", head: ["surface", "status"], rows: [
    ["Shielded pool programs", "mainnet, audited"],
    ["DarkRings loan program", "live on mainnet, pre-audit"],
    ["Proving keys", "public test setup, to be replaced by a ceremony"],
    ["Test suite", "75 passing, adversarial cases included"],
  ] },
  { t: "h2", x: "Custody" },
  { t: "p", x: "Non-custodial from the first transaction. Collateral and locked principal sit under a program-derived address that only the loan program can sign for, and the program signs only for the five moves whose proofs verify. There is no admin key, no pause switch, and no path by which we can move user funds." },
  { t: "h2", x: "Keys and the ceremony" },
  { t: "p", x: "Each circuit's proving key is a phase-2 setup over the Hermez Powers of Tau transcript, a public multi-party phase-1 ceremony. The phase-2 contribution is single-party: the toolchain draws the randomness from the operating system and never writes it down, recording only its hash in the key metadata. That is sound unless the operator kept the randomness, so before the protocol custodies meaningful value, a multi-party phase-2 ceremony replaces these keys and the verifying keys pinned in the program rotate to match. The desk still runs demo data." },
  { t: "h2", x: "Reproduce everything" },
  { t: "code", x: "zolana zk compile --test --manifest-path program/Cargo.toml\nscripts/check-keys.sh\ncargo build-sbf --manifest-path program/Cargo.toml \\\n  --tools-version v1.54 --arch v0 -- --features bpf-entrypoint\ncargo test --release --workspace" },
  { t: "p", x: "Circuits, verifying keys and checksums are committed together; the build refuses artifacts that do not match their pins." },
  { t: "h2", x: "Reporting an issue" },
  { t: "p", x: "The repository ships with the hackathon submission and will accept reports through GitHub security advisories. Until it is public, issues reach us fastest through the contact on the submission itself." },
  { t: "callout", x: "Found something? We pay attention to every report, and we would rather be embarrassed in private than exploited in public." },
];

export default function Security() {
  return (
    <div className="relative overflow-hidden">
      <AmberSilk className="opacity-35" />
      <ContentPage
        title="Security"
        intro="What is audited, what is not yet, who can touch funds, and how to check all of it yourself."
        blocks={BLOCKS}
      />
    </div>
  );
}
