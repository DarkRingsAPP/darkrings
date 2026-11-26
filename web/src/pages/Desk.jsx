import { lazy, Suspense } from "react";
import AmberSilk from "../components/AmberSilk.jsx";

const LiveDesk = lazy(() => import("../live/LiveDesk.jsx"));

/* The desk is the live product: session wallets in this browser, every action
   a real transaction through the deployed program on mainnet. */
export default function Desk() {
  return (
    <>
      <div className="pt-16" />
      <div className="relative overflow-hidden">
        <AmberSilk className="opacity-25" />
        <div className="relative mx-auto max-w-[1480px] px-4 pb-8 pt-7 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-[clamp(22px,2.4vw,28px)] uppercase text-bone">
              The desk
            </h1>
            <span className="rounded border border-ember/40 bg-ember/10 px-1.5 py-0.5 font-ui text-[9px] font-medium uppercase tracking-wider text-ember">
              live on mainnet
            </span>
          </div>

          <div className="mt-4">
            <Suspense
              fallback={
                <div className="rounded-lg border border-line bg-surface px-6 py-14 text-center text-[14px] text-mute">
                  Loading the live engine…
                </div>
              }
            >
              <LiveDesk />
            </Suspense>
          </div>
        </div>

        {/* status bar */}
        <div className="keyline relative">
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 md:px-6">
            <span className="font-ui text-[9.5px] font-medium uppercase tracking-[0.12em] text-faint">
              Live desk. Every action settles through the deployed program on mainnet.
            </span>
            <span className="num text-[10px] text-faint">{"program 4j3M…ZHfE"}</span>
          </div>
        </div>
      </div>
    </>
  );
}
