import { Link } from "react-router-dom";
import { motion as m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowRight, ArrowUpRight, ShieldCheck } from "@phosphor-icons/react";
import RingScene from "../components/RingScene.jsx";
import AmberSilk from "../components/AmberSilk.jsx";
import LoanTicket from "../components/LoanTicket.jsx";
import ScrollDecrypt from "../components/ScrollDecrypt.jsx";
import Spotlight from "../components/Spotlight.jsx";
import TiltCard from "../components/TiltCard.jsx";
import Magnetic from "../components/Magnetic.jsx";
import VelocityMarquee from "../components/VelocityMarquee.jsx";
import NumberTicker from "../components/NumberTicker.jsx";
import ScrambleText from "../components/ScrambleText.jsx";
import Guilloche from "../components/Guilloche.jsx";
import { MARKETS } from "../lib/demo.js";

const EASE = [0.76, 0, 0.24, 1];
const SOFT = [0.22, 1, 0.36, 1];

/* ---------------------------------- hero --------------------------------- */

function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const ringY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);
  const ringOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.25]);

  const maskRise = (delay) =>
    reduce
      ? {}
      : {
          initial: { y: "110%" },
          animate: { y: "0%" },
          transition: { duration: 0.95, delay, ease: EASE },
        };

  return (
    <section ref={ref} className="relative min-h-[100dvh] overflow-hidden">
      <AmberSilk />
      {/* the ring */}
      <m.div
        style={{ y: ringY, opacity: ringOpacity }}
        className="absolute right-[-42%] top-[3%] h-[min(160vw,680px)] w-[min(160vw,680px)] md:right-[-9%] md:top-1/2 md:h-[min(150vw,1200px)] md:w-[min(150vw,1200px)] md:-translate-y-1/2"
      >
        <RingScene className="h-full w-full" />
      </m.div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1280px] flex-col justify-end px-5 pb-20 pt-28 md:px-10 md:pb-24">
        <m.p
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-mute"
        >
          Built on Solana Privacy Rings
        </m.p>

        {/* phones: LOANS / WITHOUT A / LIQUIDATION / PRICE. */}
        <h1 className="display mt-6 text-[clamp(40px,11vw,64px)] uppercase text-bone md:hidden">
          <span className="block overflow-hidden pb-[0.08em]">
            <m.span className="block" {...maskRise(0.15)}>
              Private loans
              <br /> {"without\u00A0a"}
            </m.span>
          </span>
          <span className="block overflow-hidden pb-[0.08em]">
            <m.span className="block" {...maskRise(0.26)}>
              <ScrambleText text="liquidation" delay={1050} duration={750} className="text-ember" />{" "}
              price.
            </m.span>
          </span>
        </h1>
        {/* desktop: LOANS WITHOUT / A LIQUIDATION / PRICE. */}
        <h1 className="display mt-6 hidden text-[clamp(48px,7.6vw,110px)] uppercase text-bone md:block">
          <span className="block overflow-hidden pb-[0.08em]">
            <m.span className="block" {...maskRise(0.15)}>
              Private loans
            </m.span>
          </span>
          <span className="block overflow-hidden pb-[0.08em]">
            <m.span className="block" {...maskRise(0.26)}>
              without a
            </m.span>
          </span>
          <span className="block overflow-hidden pb-[0.08em]">
            <m.span className="block" {...maskRise(0.37)}>
              <ScrambleText text="liquidation" delay={1050} duration={750} className="text-ember" /> price.
            </m.span>
          </span>
        </h1>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-8">
          <m.p
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease: SOFT }}
            className="max-w-[40ch] text-[16px] leading-relaxed text-mute"
          >
            Fixed-term, overcollateralized credit with every amount encrypted
            on-chain. There is nothing left to hunt.
          </m.p>
          <m.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65, ease: SOFT }}
            className="flex items-center gap-3"
          >
            <Magnetic>
              <Link
                to="/desk"
                className="group flex items-center gap-2.5 whitespace-nowrap rounded-full bg-ember px-7 py-3.5 text-[15px] font-semibold text-void transition-colors hover:bg-ember-hot"
              >
                Open the desk
                <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Magnetic>
            <Magnetic strength={0.2}>
              <Link
                to="/how-it-works"
                className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line-bright px-7 py-3.5 text-[15px] font-medium text-ink transition-colors hover:border-mute"
              >
                How it works
              </Link>
            </Magnetic>
          </m.div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- marquee -------------------------------- */

function Strip() {
  return (
    <VelocityMarquee>
      <span className="display mx-6 text-[clamp(28px,4.5vw,56px)] uppercase text-bone">
        Nothing to hunt
      </span>
      <span className="mx-6 h-2.5 w-2.5 rounded-full border border-ember" />
      <span className="display display-ghost mx-6 text-[clamp(28px,4.5vw,56px)] uppercase">
        {"▮▮▮.▮▮ encrypted"}
      </span>
      <span className="mx-6 h-2.5 w-2.5 rounded-full border border-ember" />
    </VelocityMarquee>
  );
}

/* ----------------------------- ticket showcase ---------------------------- */

function TicketShowcase() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden">
      <AmberSilk flip className="opacity-55" />
      <div className="relative mx-auto grid max-w-[1280px] items-center gap-16 px-5 py-28 md:grid-cols-[0.9fr_1.1fr] md:px-10 md:py-40">
        <m.div
          initial={reduce ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8, ease: SOFT }}
          className="relative flex justify-center"
        >
          <Guilloche className="pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 text-bone" />
          <TiltCard max={7}>
            <LoanTicket />
          </TiltCard>
        </m.div>
        <div className="md:pl-6">
          <h2 className="display text-[clamp(36px,5vw,64px)] uppercase leading-[1.0] text-bone">
            Your key,
            <br />
            <span className="display-ghost">your figures.</span>
          </h2>
          <p className="mt-7 max-w-[46ch] text-[15.5px] leading-relaxed text-mute">
            Every ticket on DarkRings is ciphertext to the chain and cleartext
            to its owners. Turn the view key and the figures resolve; turn it
            off and you are reading what the rest of the world reads.
          </p>
          <Link
            to="/desk"
            className="group mt-8 inline-flex items-center gap-2 text-[14px] font-medium text-ink"
          >
            <span className="underline decoration-line-bright underline-offset-8 transition-colors group-hover:decoration-ember">
              Try it on the desk
            </span>
            <ArrowUpRight size={15} weight="bold" className="text-ember transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- facts band ------------------------------- */

const FACTS = [
  { n: 5, suffix: "", label: "loan instructions" },
  { n: 5, suffix: "", label: "Groth16 circuits" },
  { n: 128, suffix: " B", label: "per proof" },
  { n: 75, suffix: "", label: "tests passing" },
];

function Facts() {
  return (
    <section className="keyline">
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-y-12 px-5 py-16 md:grid-cols-4 md:px-10 md:py-20">
        {FACTS.map(({ n, suffix, label }) => (
          <div key={label}>
            <NumberTicker
              value={n}
              suffix={suffix}
              className="display text-[clamp(40px,5vw,64px)] text-bone"
            />
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
              {label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}


/* ---------------------------- proof (paper block) -------------------------- */

const PROOFS = [
  {
    n: 5,
    suffix: "",
    label: "loan instructions",
    body: "Offer, originate, repay, claim, cancel. The whole lifecycle, nothing else.",
  },
  {
    n: 5,
    suffix: "",
    label: "Groth16 circuits",
    body: "Every rule of a loan proven in zero knowledge before a coin moves.",
  },
  {
    n: 128,
    suffix: "",
    label: "bytes per proof",
    body: "Verified on-chain, inside the instruction that carries it.",
  },
  {
    n: 75,
    suffix: "",
    label: "tests passing",
    body: "Adversarial suites, three localnet lifecycles, then the real one on mainnet.",
  },
];

const MAINNET_TXS = [
  ["Offer", "3ssx9gJT5RYHCBDgqSWvQM3QKuEHHYXcbyvoQQRG8rZoJdjSgmqNgRrfKBEM6oWfZEAyGMayFKcUCUeXYAA2W6sG"],
  ["Originate", "4FY9asu1pZfppLKHtp7sr6Z3pG9VskzcrKcePSHBGfLKC4ofhRJkUufEGdMf57gfndXsJr4jbEbY2CP9KnBzMBwm"],
  ["Repay", "yrCDVMU1TkUQ4i6ECzzfGPjQSxGsLE1TMAJKgW36wfqPaq395aWgKCQcPdwFsiSRtHN2P2dNPiiAUSrTD9jFkvj"],
];

function Proof() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden bg-bone text-void">
      <Guilloche className="pointer-events-none absolute right-[-18%] top-1/2 h-[1100px] w-[1100px] -translate-y-1/2 text-void opacity-50" />
      <div className="relative mx-auto max-w-[1280px] px-5 py-24 md:px-10 md:py-32">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <h2 className="display text-[clamp(38px,5.5vw,72px)] uppercase leading-[0.98] text-void">
            Proof,
            <br />
            not promises.
          </h2>
          <p className="max-w-[40ch] text-[14.5px] leading-relaxed text-void/65">
            Settlement runs inside the Solana Privacy Program, audited by
            OtterSec, Certora and ZK Security. DarkRings adds five moves on
            top and proves each one.
          </p>
        </div>

        <m.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: SOFT }}
          className="mt-16 grid overflow-hidden rounded-2xl border border-void/15 bg-bone/60 backdrop-blur-sm sm:grid-cols-2 lg:grid-cols-4"
        >
          {PROOFS.map(({ n, suffix, label, body }, i) => (
            <div
              key={label}
              className={`border-void/10 p-7 ${i > 0 ? "border-t sm:border-t-0" : ""} ${
                i % 2 === 1 ? "sm:border-l" : ""
              } ${i > 1 ? "sm:border-t lg:border-t-0" : ""} ${i > 0 ? "lg:border-l" : ""}`}
            >
              <div className="flex items-baseline gap-1">
                <NumberTicker
                  value={n}
                  suffix={suffix}
                  className="display text-[clamp(44px,4.5vw,64px)] text-void"
                />
                <span className="display text-[clamp(44px,4.5vw,64px)] text-ember">.</span>
              </div>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-void/55">
                {label}
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-void/70">{body}</p>
            </div>
          ))}
        </m.div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-void/15 bg-bone/60 px-6 py-5 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-void/55">
                Loan program
              </p>
              <Link
                to="/docs/verify"
                className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-void"
              >
                <span className="underline decoration-void/25 underline-offset-4 transition-colors group-hover:decoration-ember">
                  Verification guide
                </span>
                <ArrowUpRight size={13} weight="bold" className="text-ember" />
              </Link>
            </div>
            <p className="num mt-3 break-all text-[13.5px] font-medium text-void">
              4j3MfrBtrhrLV4Lu7JpP5TqbAHbZY6AkLmMUaR3TZHfE
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-void/10 pt-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-void/55">
                Live on mainnet, one full loan:
              </span>
              {MAINNET_TXS.map(([label, sig]) => (
                <a
                  key={label}
                  href={`https://explorer.solana.com/tx/${sig}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1 text-[12.5px] font-semibold text-void"
                >
                  <span className="underline decoration-void/25 underline-offset-4 transition-colors group-hover:decoration-ember">
                    {label}
                  </span>
                  <ArrowUpRight size={12} weight="bold" className="text-ember" />
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-ember/35 bg-ember/10 px-6 py-5">
            <ShieldCheck size={18} weight="bold" className="mt-0.5 shrink-0 text-ember" />
            <p className="text-[12.5px] leading-relaxed text-void/75">
              New and pre-audit. The proving keys build on the Hermez Powers
              of Tau; a multi-party ceremony and audits come before size.
              Treat it as a working proof, not a vault.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- markets -------------------------------- */

function Markets() {
  const reduce = useReducedMotion();
  return (
    <section className="keyline relative overflow-hidden">
      <AmberSilk flip className="opacity-45" />
      <div className="relative mx-auto max-w-[1280px] px-5 py-28 md:px-10 md:py-36">
        <div className="md:ml-[18%]">
          <h2 className="display text-[clamp(36px,5.5vw,72px)] uppercase leading-[0.98] text-bone">
            Markets with
            <br />
            <span className="display-ghost">sealed books.</span>
          </h2>
          <p className="mt-6 max-w-[50ch] text-[15.5px] leading-relaxed text-mute">
            Terms and rates are protocol parameters, public by design. Sizes
            and volumes are nobody's business.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETS.map((mk, i) => (
            <m.div
              key={mk.id}
              initial={reduce ? false : { opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.07, ease: SOFT }}
              className={i % 2 === 1 ? "lg:mt-10" : ""}
            >
              <TiltCard max={6}>
                <Spotlight className="rounded-xl border border-line bg-surface p-5">
                  <div className="flex items-baseline justify-between">
                    <p className="font-mono text-[14px] font-medium text-bone">
                      {mk.collateral}/{mk.principal}
                    </p>
                    <span className="font-mono text-[11px] text-mute">{mk.term}</span>
                  </div>
                  <p className="num mt-8 text-[30px] font-medium tracking-tight text-bone">
                    {mk.rateBand.split(" ")[0]}
                    <span className="text-[15px] text-mute"> to {mk.rateBand.split(" to ")[1]}</span>
                  </p>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                    fixed, whole term
                  </p>
                  <div className="mt-7 space-y-2 border-t border-line/70 pt-4">
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="text-mute">Open offers</span>
                      <span className="num text-ink">{mk.openOffers}</span>
                    </div>
                    <div className="flex items-baseline justify-between text-[12.5px]">
                      <span className="text-mute">Book size</span>
                      <span className="num text-faint">{"▮▮▮,▮▮▮"}</span>
                    </div>
                  </div>
                </Spotlight>
              </TiltCard>
            </m.div>
          ))}
        </div>

        <div className="mt-12 flex justify-end">
          <Magnetic strength={0.22}>
            <Link
              to="/desk"
              className="group flex items-center gap-2 rounded-full border border-line-bright px-6 py-3 text-[14px] font-medium text-ink transition-colors hover:border-ember/70"
            >
              Open the desk
              <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- statement ------------------------------- */

/* The wrapper is what the viewport observes: the line itself starts
   translated inside an overflow-hidden mask, so observing the line would
   never intersect. Variants propagate the trigger down. */
const lineRise = {
  hidden: { y: "110%" },
  show: (i) => ({
    y: "0%",
    transition: { duration: 0.9, delay: i * 0.08, ease: EASE },
  }),
};

function StatementLine({ children, ghost = false, index = 0 }) {
  return (
    <span className="block overflow-hidden pb-[0.06em]">
      <m.span
        custom={index}
        variants={lineRise}
        className={`display block text-[clamp(44px,8vw,120px)] uppercase ${ghost ? "display-ghost" : "text-bone"}`}
      >
        {children}
      </m.span>
    </span>
  );
}

function Statement() {
  const reduce = useReducedMotion();
  return (
    <section className="keyline relative overflow-hidden">
      <AmberSilk className="opacity-40" />
      <div className="relative mx-auto max-w-[1280px] px-5 py-32 md:px-10 md:py-44">
        <m.h2
          initial={reduce ? false : "hidden"}
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
        >
          <StatementLine index={0}>Nothing to</StatementLine>
          <StatementLine index={1}>liquidate.</StatementLine>
          <StatementLine ghost index={2}>
            Nothing to hunt.
          </StatementLine>
        </m.h2>
        <div className="mt-14 grid gap-10 md:grid-cols-[1fr_1fr] md:gap-20">
          <p className="text-[15.5px] leading-relaxed text-mute md:ml-[18%]">
            A DarkRings loan has one condition: a date. Repay before it and
            your collateral returns. Miss it and the lender claims. No price
            feed, no margin call, no cascade.
          </p>
          <p className="text-[15.5px] leading-relaxed text-mute">
            On every other venue your liquidation level is a public order
            waiting to be pushed. Here it does not exist, not even encrypted.
            <Link
              to="/how-it-works"
              className="ml-2 inline-flex items-center gap-1 text-ink underline decoration-line-bright underline-offset-4 transition-colors hover:decoration-ember"
            >
              Walk through a loan
              <ArrowUpRight size={13} weight="bold" />
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- cta ---------------------------------- */

function EndCta() {
  return (
    <section className="keyline relative overflow-hidden">
      <AmberSilk />
      <Guilloche className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 text-bone" />
      <div className="relative mx-auto flex max-w-[1280px] flex-col items-center px-5 py-32 text-center md:py-44">
        <h2 className="display text-[clamp(44px,7vw,100px)] uppercase leading-[0.98] text-bone">
          The desk
          <br />
          <span className="display-ghost">is open.</span>
        </h2>
        <p className="mt-7 max-w-[44ch] text-[15px] leading-relaxed text-mute">
          Browse sealed books, originate against sample offers, repay and
          claim. Demo data, real mechanism.
        </p>
        <Magnetic className="mt-10">
          <Link
            to="/desk"
            className="group flex items-center gap-2.5 rounded-full bg-ember px-8 py-4 text-[15.5px] font-semibold text-void transition-colors hover:bg-ember-hot"
          >
            Open the desk
            <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Magnetic>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <>
      <Hero />
      <Strip />
      <TicketShowcase />
      <ScrollDecrypt />
      <Proof />
      <Markets />
      <Statement />
      <EndCta />
    </>
  );
}
