import { useEffect, useState } from "react";
import { AnimatePresence, motion as m, useReducedMotion } from "motion/react";

const CIPHER = "0123456789abcdef▮▮";
const WORD = "DARKRINGS";

/** Once per session: the name decrypts, then the curtain parts. */
export default function Preloader() {
  const reduce = useReducedMotion();
  const [done, setDone] = useState(
    () => reduce || sessionStorage.getItem("dr-loaded") === "1"
  );
  const [text, setText] = useState(WORD.replace(/./g, "▮"));

  useEffect(() => {
    if (done) return;
    document.documentElement.style.overflow = "hidden";
    const start = performance.now();
    const DURATION = 1050;
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / DURATION);
      const settled = Math.floor(p * (WORD.length + 1));
      setText(
        [...WORD]
          .map((ch, i) =>
            i < settled ? ch : CIPHER[(Math.random() * CIPHER.length) | 0]
          )
          .join("")
      );
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        sessionStorage.setItem("dr-loaded", "1");
        setTimeout(() => setDone(true), 260);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.style.overflow = "";
    };
  }, [done]);

  useEffect(() => {
    if (done) document.documentElement.style.overflow = "";
  }, [done]);

  return (
    <AnimatePresence>
      {!done && (
        <m.div className="fixed inset-0 z-[90]" exit={{ pointerEvents: "none" }}>
          {/* curtain halves */}
          <m.div
            className="absolute inset-x-0 top-0 h-1/2 bg-abyss"
            exit={{ y: "-100%" }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          />
          <m.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-abyss"
            exit={{ y: "100%" }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          />
          <m.div
            className="absolute inset-0 flex items-center justify-center"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span className="display num text-[clamp(28px,5vw,54px)] tracking-[0.14em] text-bone">
              {text}
            </span>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
