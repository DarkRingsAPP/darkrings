/* Engraved concentric ring linework, the kind banknotes use. Two groups
   rotate against each other, slowly enough to read as stillness. Pure SVG,
   one paint per frame on the compositor, gated by prefers-reduced-motion. */
export default function Guilloche({ className = "" }) {
  const rings = [
    { r: 88, dash: "2 5", o: 0.5 },
    { r: 118, dash: null, o: 0.32 },
    { r: 150, dash: "1 7", o: 0.45 },
    { r: 186, dash: "11 5", o: 0.3 },
    { r: 222, dash: null, o: 0.22 },
    { r: 258, dash: "3 9", o: 0.34 },
    { r: 298, dash: "1 4", o: 0.26 },
    { r: 340, dash: null, o: 0.16 },
    { r: 384, dash: "17 7", o: 0.2 },
    { r: 428, dash: "2 11", o: 0.14 },
  ];
  return (
    <svg
      viewBox="0 0 900 900"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <g className="ring-spin" style={{ transformOrigin: "450px 450px" }}>
        {rings
          .filter((_, i) => i % 2 === 0)
          .map(({ r, dash, o }) => (
            <circle
              key={r}
              cx="450"
              cy="450"
              r={r}
              stroke="currentColor"
              strokeOpacity={o}
              strokeWidth="1"
              strokeDasharray={dash ?? undefined}
            />
          ))}
      </g>
      <g className="ring-spin-reverse" style={{ transformOrigin: "450px 450px" }}>
        {rings
          .filter((_, i) => i % 2 === 1)
          .map(({ r, dash, o }) => (
            <circle
              key={r}
              cx="450"
              cy="450"
              r={r}
              stroke="currentColor"
              strokeOpacity={o}
              strokeWidth="1"
              strokeDasharray={dash ?? undefined}
            />
          ))}
      </g>
    </svg>
  );
}
