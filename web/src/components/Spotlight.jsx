import { useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * A panel whose border catches light under the cursor. Pure CSS variables
 * driven outside React state: no re-render per mousemove.
 */
export default function Spotlight({ children, className = "", as: Tag = "div", ...rest }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();

  const onMove = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    ref.current.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
    ref.current.style.setProperty("--spot-o", "1");
  };
  const onLeave = () => {
    ref.current?.style.setProperty("--spot-o", "0");
  };

  return (
    <Tag
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`spot ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
