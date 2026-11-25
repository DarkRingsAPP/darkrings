import { useRef } from "react";
import { motion as m, useMotionValue, useSpring, useTransform, useReducedMotion } from "motion/react";

/** Mouse-tilt 3D card. Motion values only; collapses to static under reduced motion. */
export default function TiltCard({ children, max = 8, className = "" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-120, 120], [max, -max]), {
    stiffness: 200,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(x, [-120, 120], [-max, max]), {
    stiffness: 200,
    damping: 20,
  });

  const onMove = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set(e.clientX - r.left - r.width / 2);
    y.set(e.clientY - r.top - r.height / 2);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <m.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={reduce ? {} : { rotateX, rotateY, transformPerspective: 900 }}
      className={`will-change-transform ${className}`}
    >
      {children}
    </m.div>
  );
}
