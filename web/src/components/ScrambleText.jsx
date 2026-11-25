import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

const CIPHER = "0123456789abcdef";

/** Display text that resolves out of cipher noise, once, when seen. */
export default function ScrambleText({ text, delay = 0, duration = 900, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [out, setOut] = useState(() => (reduce ? text : text.replace(/\S/g, "▮")));

  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) setOut(text);
      return;
    }
    let raf;
    const t0 = performance.now() + delay;
    const tick = (now) => {
      if (now < t0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = Math.min(1, (now - t0) / duration);
      const settled = Math.floor(p * (text.length + 1));
      setOut(
        [...text]
          .map((ch, i) => {
            if (ch === " ") return " ";
            if (i < settled) return ch;
            return CIPHER[(Math.random() * CIPHER.length) | 0];
          })
          .join("")
      );
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, text, delay, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {out}
    </span>
  );
}
