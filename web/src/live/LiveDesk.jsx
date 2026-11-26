/* The live desk: the same five instructions the mainnet probes landed, driven
   from the browser. Two session wallets (lender and borrower) live in this
   browser; every action below is a real mainnet transaction. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion as m } from "motion/react";
import { ArrowSquareOut, Copy, Key, ShieldCheck } from "@phosphor-icons/react";

const LABEL = "font-ui text-[9.5px] font-medium uppercase tracking-[0.12em] text-faint";
const FIELD =
  "w-full rounded-md border border-line-bright bg-raised px-2.5 py-1.5 num text-[13px] text-ink outline-none transition-colors focus:border-ember/60";
const BTN =
  "rounded-md bg-ember px-3 py-1.5 text-[12.5px] font-semibold text-void transition-all hover:bg-ember-hot active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40";
const BTN_GHOST =
  "rounded-md border border-line-bright px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-mute disabled:cursor-not-allowed disabled:opacity-40";

const LAMPORTS = 1_000_000_000n;

function parseSol(s) {
  const t = String(s ?? "").trim();
  if (!/^\d+(\.\d{0,9})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w) * LAMPORTS + BigInt((f + "000000000").slice(0, 9));
}

function fmtSol(lamports, dp = 4) {
  const v = Number(lamports) / 1e9;
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function short(s, head = 4, tail = 4) {
  const t = String(s);
  return t.length <= head + tail + 1 ? t : `${t.slice(0, head)}…${t.slice(-tail)}`;
}

function countdown(toSec, nowMs) {
  const left = Number(toSec) * 1000 - nowMs;
  if (left <= 0) return "passed";
  const s = Math.floor(left / 1000);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.floor(s / 60)}m`;
  if (s < 172800) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ------------------------------ wallet card -------------------------------- */

function WalletCard({ role, actor, balance, notes, busy, onDeposit, onWithdraw, onRefresh }) {
  const [amt, setAmt] = useState("");
  const [copied, setCopied] = useState(false);
  const address = actor?.signer?.address ?? "";
  const shielded = (notes ?? []).reduce((n, u) => n + u.utxo.amount, 0n);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className={LABEL}>{role} session wallet</span>
        <button type="button" onClick={onRefresh} disabled={busy} className="font-ui text-[10px] uppercase tracking-wider text-mute transition-colors hover:text-ink disabled:opacity-40">
          Refresh
        </button>
      </div>
      <button
        type="button"
        onClick={copy}
        title={address}
        className="mt-2 flex items-center gap-1.5 num text-[12.5px] text-ink transition-colors hover:text-bone"
      >
        {short(address, 6, 6)}
        <Copy size={11} weight="bold" className="text-faint" />
        {copied && <span className="font-ui text-[9px] uppercase tracking-wider text-moss">copied</span>}
      </button>
      <div className="mt-3 grid grid-cols-2 gap-px">
        <div>
          <div className={LABEL}>Funding (public)</div>
          <div className="num mt-0.5 text-[14px] text-bone">{balance === null ? "—" : `${fmtSol(balance)} SOL`}</div>
        </div>
        <div>
          <div className={LABEL}>Shielded</div>
          <div className="num mt-0.5 text-[14px] text-bone">{notes === null ? "—" : `${fmtSol(shielded)} SOL`}</div>
        </div>
      </div>
      {notes?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {notes.map((u, i) => (
            <span key={i} className="num rounded border border-line px-1 py-0.5 text-[10px] text-mute">
              {fmtSol(u.utxo.amount)}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-1.5">
        <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.002" className={FIELD} inputMode="decimal" />
        <button
          type="button"
          disabled={busy || parseSol(amt) === null || parseSol(amt) === 0n}
          onClick={() => onDeposit(parseSol(amt)).then(() => setAmt(""))}
          className={BTN_GHOST + " shrink-0"}
        >
          Shield
        </button>
        <button
          type="button"
          disabled={busy || parseSol(amt) === null || parseSol(amt) === 0n}
          onClick={() => onWithdraw(parseSol(amt)).then(() => setAmt(""))}
          className={BTN_GHOST + " shrink-0"}
        >
          Unshield
        </button>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
        Send SOL to the address above to fund it, then shield the exact amounts a flow needs: notes are spent whole. Unshield returns funds to the public address.
      </p>
    </div>
  );
}

/* --------------------------------- main ------------------------------------ */

export default function LiveDesk() {
  const now = useNow();
  const engineRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // { action, stage }
  const [actors, setActors] = useState(null); // { lender, borrower }
  const [balances, setBalances] = useState({ lender: null, borrower: null });
  const [notes, setNotes] = useState({ lender: null, borrower: null });
  const [state, setState] = useState({ offers: [], loans: [] });
  const [log, setLog] = useState([]);
  const [form, setForm] = useState({ principal: "0.002", collateral: "0.0025", repay: "0.0021", expiryMin: "60", termMin: "30" });

  const pushLog = useCallback((text, sig) => {
    setLog((l) => [{ t: new Date().toTimeString().slice(0, 8), text, sig }, ...l].slice(0, 30));
  }, []);

  const refresh = useCallback(async (which = ["lender", "borrower"]) => {
    const eng = engineRef.current;
    if (!eng) return;
    for (const role of which) {
      const actor = eng.actors[role];
      try {
        const [bal, ns] = await Promise.all([eng.loan.solBalance(actor), eng.loan.syncNotes(actor)]);
        setBalances((b) => ({ ...b, [role]: bal }));
        setNotes((n) => ({ ...n, [role]: ns }));
      } catch (e) {
        pushLog(`${role} refresh failed: ${e.message ?? e}`);
      }
    }
  }, [pushLog]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [loan, session] = await Promise.all([import("./loan.js"), import("./session.js")]);
        const lender = await loan.withAuthority(await session.makeActor("lender"));
        const borrower = await loan.withAuthority(await session.makeActor("borrower"));
        if (dead) return;
        engineRef.current = { loan, session, actors: { lender, borrower } };
        setActors({ lender, borrower });
        setState(loan.loadState());
        setReady(true);
        refresh();
      } catch (e) {
        console.error(e);
        if (!dead) setError(e.message ?? String(e));
      }
    })();
    return () => {
      dead = true;
    };
  }, [refresh]);

  const run = useCallback(
    async (action, fn, after = []) => {
      const eng = engineRef.current;
      if (!eng || busy) return;
      setBusy({ action, stage: "building and proving in this tab (it may stall for a moment)" });
      try {
        const out = await fn(eng);
        setState(eng.loan.loadState());
        if (out?.sig) pushLog(`${action} settled on mainnet`, out.sig);
        else pushLog(`${action} done`);
        refresh(after);
      } catch (e) {
        console.error(e);
        pushLog(`${action} failed: ${e.message ?? e}`);
      } finally {
        setBusy(null);
      }
    },
    [busy, pushLog, refresh],
  );

  const terms = useMemo(() => {
    const principal = parseSol(form.principal);
    const collateral = parseSol(form.collateral);
    const repay = parseSol(form.repay);
    const expiryMin = Number(form.expiryMin);
    const termMin = Number(form.termMin);
    if ([principal, collateral, repay].some((v) => v === null || v === 0n)) return null;
    if (!Number.isFinite(expiryMin) || !Number.isFinite(termMin) || expiryMin <= 0 || termMin <= 0) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      principal,
      collateral,
      repay,
      expiry: BigInt(nowSec + Math.round(expiryMin * 60)),
      deadline: BigInt(nowSec + Math.round(termMin * 60)),
    };
  }, [form]);

  if (error) {
    return (
      <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center">
        <p className="text-[14px] text-mute">The live engine failed to start.</p>
        <p className="num mt-2 text-[12px] text-faint">{error}</p>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="rounded-lg border border-line bg-surface px-6 py-14 text-center">
        <ShieldCheck size={22} weight="bold" className="mx-auto text-faint" />
        <p className="mt-3 text-[14px] text-mute">Starting the live engine: wasm prover, session keys, pool sync.</p>
      </div>
    );
  }

  const open = state.offers.filter((o) => o.status === "open");
  const loans = state.loans;

  return (
    <div className="space-y-px overflow-hidden rounded-lg border border-line bg-line">
      {/* banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface px-4 py-2.5">
        <span className="font-ui text-[10px] font-medium uppercase tracking-[0.12em] text-ember">
          Real SOL, real proofs. Session keys are created here and never leave this browser.
        </span>
        <span className="num text-[10px] text-faint">both roles run locally so one person can walk the whole lifecycle</span>
      </div>

      {/* wallets */}
      <div className="grid gap-px md:grid-cols-2">
        {["lender", "borrower"].map((role) => (
          <WalletCard
            key={role}
            role={role}
            actor={actors?.[role]}
            balance={balances[role]}
            notes={notes[role]}
            busy={Boolean(busy)}
            onRefresh={() => refresh([role])}
            onDeposit={(lamports) =>
              run(`shield ${fmtSol(lamports)} SOL (${role})`, (eng) => eng.loan.deposit(eng.actors[role], lamports), [role])
            }
            onWithdraw={(lamports) =>
              run(`unshield ${fmtSol(lamports)} SOL (${role})`, (eng) => eng.loan.withdraw(eng.actors[role], lamports), [role])
            }
          />
        ))}
      </div>

      {/* post offer */}
      <div className="bg-surface p-4">
        <div className={LABEL}>Post an offer (lender funds, sealed to the borrower)</div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["principal", "Principal, SOL"],
            ["collateral", "Collateral, SOL"],
            ["repay", "Repay, SOL"],
            ["expiryMin", "Offer open, min"],
            ["termMin", "Term, min"],
          ].map(([k, label]) => (
            <label key={k} className="block">
              <span className={LABEL}>{label}</span>
              <input
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                className={FIELD + " mt-1"}
                inputMode="decimal"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className={BTN}
            disabled={Boolean(busy) || !terms}
            onClick={() =>
              run("offer", (eng) => eng.loan.postOffer(eng.actors.lender, eng.actors.borrower, terms), ["lender"])
            }
          >
            Post offer on mainnet
          </button>
          <span className="text-[11px] text-faint">
            Needs a lender note of at least the principal. The borrower will need one note of exactly the collateral.
          </span>
        </div>
      </div>

      {/* offers */}
      <div className="bg-surface p-4">
        <div className={LABEL}>Offers</div>
        {state.offers.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-faint">Nothing yet. Shield some SOL and post the first offer.</p>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {state.offers.map((o) => {
              const expired = Number(o.expiry) * 1000 < now;
              return (
                <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <span className="num w-[86px] text-[11px] text-faint">{o.id}</span>
                  <span className="num text-[12.5px] text-ink">{fmtSol(BigInt(o.principal))} {"→"} {fmtSol(BigInt(o.repay))}</span>
                  <span className="num text-[11px] text-mute">coll {fmtSol(BigInt(o.collateral))}</span>
                  <span className="num text-[11px] text-mute">
                    {o.status === "open" ? (expired ? "expired" : `open ${countdown(o.expiry, now)}`) : o.status}
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    {o.status === "open" && !expired && (
                      <button
                        type="button"
                        className={BTN_GHOST}
                        disabled={Boolean(busy)}
                        onClick={() =>
                          run("originate", (eng) => eng.loan.originate(eng.actors.borrower, eng.actors.lender, o), ["borrower"])
                        }
                      >
                        Originate as borrower
                      </button>
                    )}
                    {o.status === "open" && expired && (
                      <button
                        type="button"
                        className={BTN_GHOST}
                        disabled={Boolean(busy)}
                        onClick={() => run("cancel", (eng) => eng.loan.cancelOffer(eng.actors.lender, o), ["lender"])}
                      >
                        Cancel, reclaim principal
                      </button>
                    )}
                    {Object.entries(o.txs ?? {}).map(([k, sig]) => (
                      <a
                        key={k}
                        href={`https://explorer.solana.com/tx/${sig}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-ui text-[10px] uppercase tracking-wider text-mute transition-colors hover:text-ember"
                      >
                        {k} <ArrowSquareOut size={10} weight="bold" />
                      </a>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* loans */}
      <div className="bg-surface p-4">
        <div className={LABEL}>Loans</div>
        {loans.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-faint">Originate against an open offer and the loan appears here.</p>
        ) : (
          <div className="mt-2 divide-y divide-line">
            {loans.map((l) => {
              const past = Number(l.deadline) * 1000 < now;
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <span className="num w-[86px] text-[11px] text-faint">{l.id}</span>
                  <span className="num text-[12.5px] text-ink">repay {fmtSol(BigInt(l.repay))}</span>
                  <span className="num text-[11px] text-mute">coll {fmtSol(BigInt(l.collateral))}</span>
                  <span className="num text-[11px] text-mute">
                    {l.status === "active" ? (past ? "past deadline" : `due ${countdown(l.deadline, now)}`) : l.status}
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    {l.status === "active" && !past && (
                      <button
                        type="button"
                        className={BTN_GHOST}
                        disabled={Boolean(busy)}
                        onClick={() => run("repay", (eng) => eng.loan.repay(eng.actors.borrower, eng.actors.lender, l), ["borrower", "lender"])}
                      >
                        Repay as borrower
                      </button>
                    )}
                    {l.status === "active" && past && (
                      <button
                        type="button"
                        className={BTN_GHOST}
                        disabled={Boolean(busy)}
                        onClick={() => run("claim", (eng) => eng.loan.claim(eng.actors.lender, l), ["lender"])}
                      >
                        Claim collateral
                      </button>
                    )}
                    {Object.entries(l.txs ?? {}).map(([k, sig]) => (
                      <a
                        key={k}
                        href={`https://explorer.solana.com/tx/${sig}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-ui text-[10px] uppercase tracking-wider text-mute transition-colors hover:text-ember"
                      >
                        {k} <ArrowSquareOut size={10} weight="bold" />
                      </a>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* busy + log */}
      <div className="bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className={LABEL}>Activity</div>
          {busy && (
            <m.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 font-ui text-[10px] uppercase tracking-wider text-ember"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
              {busy.action}: {busy.stage}
            </m.span>
          )}
        </div>
        {log.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-faint">Every proof and settlement lands here with its explorer link.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {log.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[12px]">
                <span className="num text-[10px] text-faint">{e.t}</span>
                <span className="text-mute">{e.text}</span>
                {e.sig && (
                  <a
                    href={`https://explorer.solana.com/tx/${e.sig}`}
                    target="_blank"
                    rel="noreferrer"
                    className="num text-[10px] text-ember hover:underline"
                  >
                    {short(e.sig, 6, 6)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* seed note */}
      <div className="flex flex-wrap items-center gap-2 bg-surface px-4 py-2.5">
        <Key size={11} weight="bold" className="text-faint" />
        <span className="text-[10.5px] text-faint">
          Session keys live in this browser's localStorage. Clearing site data forgets them and any funds they hold, so keep the amounts small.
        </span>
      </div>
    </div>
  );
}
