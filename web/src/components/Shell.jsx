import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion as mo, useReducedMotion } from "motion/react";
import Preloader from "./Preloader.jsx";
import { List, X } from "@phosphor-icons/react";

const LINKS = [
  { to: "/desk", label: "Desk" },
  { to: "/markets", label: "Markets" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/docs", label: "Docs" },
];

function Nav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  const link = ({ isActive }) =>
    `transition-colors ${isActive ? "text-bone" : "text-mute hover:text-ink"}`;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-void/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/ring.svg" alt="" className="h-5 w-5" />
          <span className="display text-[16px] uppercase tracking-[0.02em] text-bone">
            DarkRings
          </span>
        </Link>

        <div className="hidden items-center gap-7 text-[13.5px] md:flex">
          {LINKS.map(({ to, label }) => (
            <NavLink key={to} to={to} className={link}>
              {label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/desk"
            className="hidden rounded-full bg-ember px-4 py-1.5 text-[13px] font-semibold text-void transition-colors hover:bg-[#ff7b52] md:block"
          >
            Open the desk
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line-bright text-ink md:hidden"
          >
            {open ? <X size={16} weight="bold" /> : <List size={16} weight="bold" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-line bg-void px-5 py-4 md:hidden">
          <div className="flex flex-col gap-4 text-[15px]">
            {LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className={link}>
                {label}
              </NavLink>
            ))}
            <Link
              to="/desk"
              className="mt-1 w-fit rounded-full bg-ember px-5 py-2 text-[14px] font-semibold text-void"
            >
              Open the desk
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const col = "flex flex-col gap-2.5 text-mute";
  const link = "w-fit transition-colors hover:text-ink";
  return (
    <footer className="keyline">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] md:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/ring.svg" alt="" className="h-4 w-4" />
            <span className="display text-[14px] uppercase text-bone">DarkRings</span>
          </div>
          <p className="mt-3 font-mono text-[12px] text-mute">
            Non-custodial. Your keys, your view key.
          </p>
          <p className="mt-5 max-w-[40ch] text-[12.5px] leading-relaxed text-faint">
            Fixed-term, overcollateralized lending with encrypted amounts on
            Solana Privacy Rings. Collateral is at risk on default. Nothing
            here is financial advice.
          </p>
        </div>
        <div className="text-[13.5px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            Product
          </p>
          <div className={`mt-3 ${col}`}>
            <Link to="/desk" className={link}>Desk</Link>
            <Link to="/markets" className={link}>Markets</Link>
            <Link to="/stats" className={link}>Stats</Link>
            <Link to="/how-it-works" className={link}>How it works</Link>
          </div>
        </div>
        <div className="text-[13.5px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            Protocol
          </p>
          <div className={`mt-3 ${col}`}>
            <Link to="/docs" className={link}>Docs</Link>
            <Link to="/docs/instructions" className={link}>Instructions</Link>
            <Link to="/docs/privacy" className={link}>Privacy model</Link>
            <Link to="/docs/verify" className={link}>Verification</Link>
            <Link to="/security" className={link}>Security</Link>
          </div>
        </div>
        <div className="text-[13.5px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            Resources
          </p>
          <div className={`mt-3 ${col}`}>
            <Link to="/research" className={link}>Research</Link>
            <Link to="/changelog" className={link}>Changelog</Link>
            <Link to="/docs/faq" className={link}>FAQ</Link>
            <Link to="/docs/risks" className={link}>Risks</Link>
          </div>
        </div>
        <div className="text-[13.5px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
            Company
          </p>
          <div className={`mt-3 ${col}`}>
            <Link to="/about" className={link}>About</Link>
            <Link to="/terms" className={link}>Terms of use</Link>
            <Link to="/privacy" className={link}>Privacy policy</Link>
          </div>
        </div>
      </div>
      <div className="keyline">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-5 py-4 md:px-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Built on the Solana Privacy Program, audited by OtterSec, Certora
            and ZK Security
          </span>
          <span className="num text-[10.5px] text-faint">
            {"loan program 4j3M\u2026ZHfE"}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function Shell() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div className="grain">
      <Preloader />
      <Nav />
      <AnimatePresence mode="wait">
        <mo.main
          key={pathname}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-[100dvh]"
        >
          <Outlet />
        </mo.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
