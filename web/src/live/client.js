/* The live SPR client. Same wiring the mainnet spike proved, but through the
   same-origin /api proxy so the Helius key stays on the server. */
import { initializePoseidon } from "@heliuslabs/spr";
import { SprClient, SignedTeePolicy } from "@heliuslabs/spr/client";

let clientPromise = null;

export function getClient() {
  clientPromise ??= (async () => {
    await initializePoseidon();
    const origin = window.location.origin;
    return new SprClient({
      solanaRpcUrl: `${origin}/api/rpc`,
      indexerUrl: `${origin}/api/spr`,
      proverUrl: `${origin}/api/spr`,
      proverTee: SignedTeePolicy.forNetwork("mainnet"),
      priorityFeeLamports: 60_000n,
    });
  })();
  return clientPromise;
}
