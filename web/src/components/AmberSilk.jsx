/* The warm light swirl that keeps the black from ever being flat. */
export default function AmberSilk({ className = "", flip = false }) {
  return (
    <div className={`silk ${className}`} aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <div className="silk-a" />
      <div className="silk-b" />
      <div className="silk-c" />
    </div>
  );
}
