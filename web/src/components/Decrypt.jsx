import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const CIPHER = "0123456789abcdef";
const BLOCK = "▮"; // ▮

/* Characters that stay visible while the value is encrypted: the shape of
   the number leaks nothing the ciphertext length does not already leak. */
const KEEP = new Set([".", ",", " ", "%", "/", ":"]);

function redact(value) {
  return [...value].map((ch) => (KEEP.has(ch) ? ch : BLOCK)).join("");
}

/**
 * A value that renders as redaction blocks while encrypted and resolves
 * character by character, through cipher noise, when the view key is on.
 */
export default function Decrypt({ value, revealed, className = "" }) {
  const reduce = useReducedMotion();
  const [text, setText] = useState(revealed ? value : redact(value));
  const frame = useRef(null);

  useEffect(() => {
    if (reduce) {
      setText(revealed ? value : redact(value));
      return;
    }
    const chars = [...value];
    const start = performance.now();
    const perChar = 34; // ms until the next character locks in
    const tick = (now) => {
      const settled = Math.floor((now - start) / perChar);
      let done = true;
      const out = chars
        .map((ch, i) => {
          if (KEEP.has(ch)) return ch;
          if (revealed) {
            if (i < settled) return ch;
            done = false;
            return CIPHER[(Math.random() * CIPHER.length) | 0];
          }
          if (i < settled) return BLOCK;
          done = false;
          return CIPHER[(Math.random() * CIPHER.length) | 0];
        })
        .join("");
      setText(out);
      if (!done) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [revealed, value, reduce]);

  return (
    <span className={`num ${className}`} aria-label={revealed ? value : "encrypted"}>
      {text}
    </span>
  );
}
