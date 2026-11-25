/* A strip of display type on a constant drift. The scroll-velocity
   coupling was glitchy on real hardware, so the loop is pure CSS now. */
export default function VelocityMarquee({ children }) {
  return (
    <div className="keyline marquee overflow-hidden whitespace-nowrap border-b border-line py-6 md:py-8">
      <div className="marquee-track flex w-max items-center">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="flex items-center">
            {children}
          </span>
        ))}
      </div>
    </div>
  );
}
