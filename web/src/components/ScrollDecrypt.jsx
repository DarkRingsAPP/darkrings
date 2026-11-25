import { useRef, useState } from "react";
import {
  motion as m,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import Decrypt from "./Decrypt.jsx";

/* The originate transaction, field by field. The first entries are what an
   explorer already knows; scrolling turns the view key and the rest resolve. */
const FIELDS = [
  { label: "Program", value: "loan 4j3M…ZHfE", public: true },
  { label: "Instruction", value: "originate", public: true },
  { label: "Signers", value: "borrower, loan PDA", public: true },
  { label: "Principal", value: "3,200.00 USDC", public: false },
  { label: "Collateral", value: "24.80 SOL", public: false },
  { label: "Repays", value: "3,296.00 USDC", public: false },
  { label: "Due", value: "Dec 25, 14:00 UTC", public: false },
  { label: "Ratio at open", value: "187%", public: false },
];

const PRIVATE_COUNT = FIELDS.filter((f) => !f.public).length;

const CAPTIONS = [
  {
    at: 0,
    title: "An explorer sees the shape.",
    body: "Which program ran, which instruction, who signed. That much is public, and that much is all.",
  },
  {
    at: 0.34,
    title: "Your view key turns.",
    body: "The same ciphertext, read with the key only you hold. Field by field, the loan becomes legible.",
  },
  {
    at: 0.78,
    title: "Legible to you. Noise to everyone else.",
    body: "The figures never touch the chain in cleartext. There is no amount to index, no ratio to track, no level to hunt.",
  },
];

export default function ScrollDecrypt() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  const [revealedCount, setRevealedCount] = useState(reduce ? PRIVATE_COUNT : 0);
  const [caption, setCaption] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (reduce) return;
    const n = Math.min(PRIVATE_COUNT, Math.floor(p * (PRIVATE_COUNT + 1.4)));
    setRevealedCount(n);
    const idx = CAPTIONS.reduce((acc, c, i) => (p >= c.at ? i : acc), 0);
    setCaption(idx);
  });

  const ringProgress = useTransform(scrollYProgress, [0, 1], [226, 0]);
  const bgShift = useTransform(
    scrollYProgress,
    [0, 1],
    ["oklch(0.145 0.006 40)", "oklch(0.175 0.022 40)"]
  );

  let privateSeen = 0;

  return (
    <section ref={ref} className="keyline relative" style={{ height: "280vh" }}>
      <m.div
        style={{ backgroundColor: reduce ? undefined : bgShift }}
        className="sticky top-0 flex min-h-[100dvh] items-center overflow-hidden"
      >
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-5 md:grid-cols-[1fr_1.05fr] md:px-8">
          {/* narrative */}
          <div>
            <div className="flex items-center gap-4">
              <svg width="56" height="56" viewBox="0 0 80 80" aria-hidden="true">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="var(--color-line)"
                  strokeWidth="2"
                />
                <m.circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="var(--color-ember)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="226"
                  style={{ strokeDashoffset: reduce ? 0 : ringProgress }}
                  transform="rotate(-90 40 40)"
                />
                <circle cx="40" cy="40" r="4" fill="var(--color-ember)" opacity="0.9" />
              </svg>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
                View key
              </p>
            </div>
            <m.div
              key={caption}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="display mt-7 max-w-[16ch] text-[clamp(34px,4.2vw,58px)] uppercase leading-[1.0] text-bone">
                {CAPTIONS[caption].title}
              </h2>
              <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-mute">
                {CAPTIONS[caption].body}
              </p>
            </m.div>
          </div>

          {/* the transaction */}
          <div className="rounded-xl border border-line bg-surface">
            <div className="panel-amber flex items-center justify-between rounded-t-xl px-5 py-3.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">
                {"Transaction 3fed…voeL"}
              </span>
              <span className="num text-[11px] text-faint">
                {revealedCount}/{PRIVATE_COUNT} fields decrypted
              </span>
            </div>
            <dl className="px-5 py-1.5">
              {FIELDS.map((f) => {
                const revealed = f.public || privateSeen++ < revealedCount;
                return (
                  <div
                    key={f.label}
                    className="flex items-baseline justify-between gap-6 border-b border-line/60 py-3 last:border-b-0"
                  >
                    <dt className="text-[13px] text-mute">{f.label}</dt>
                    <dd
                      className={`num text-right text-[13.5px] ${
                        f.public ? "text-mute" : revealed ? "text-ink" : "text-faint"
                      }`}
                    >
                      {f.public ? (
                        f.value
                      ) : (
                        <Decrypt value={f.value} revealed={revealed} />
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </m.div>
    </section>
  );
}
