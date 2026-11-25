import { useEffect, useRef } from "react";
import {
  animate,
  motion as m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";

/** A number that counts up once when it scrolls into view. */
export default function NumberTicker({ value, suffix = "", className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString("en-US"));

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [inView, value, reduce, mv]);

  return (
    <span ref={ref} className={`num ${className}`}>
      <m.span>{rounded}</m.span>
      {suffix}
    </span>
  );
}
