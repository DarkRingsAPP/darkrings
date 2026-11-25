import { Info } from "@phosphor-icons/react";

/** The content-block renderer shared by docs and the trust pages. */
export default function Block({ b }) {
  switch (b.t) {
    case "h2":
      return <h2>{b.x}</h2>;
    case "h3":
      return <h3>{b.x}</h3>;
    case "p":
      return <p>{b.x}</p>;
    case "ul":
      return (
        <ul className="mt-4 max-w-[68ch] space-y-2">
          {b.x.map((li) => (
            <li key={li} className="flex gap-3 text-[14.5px] leading-relaxed text-mute">
              <span className="mt-[9px] h-px w-3 shrink-0 bg-ember/70" />
              {li}
            </li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface px-5 py-4 font-mono text-[12.5px] leading-relaxed text-ink">
          {b.x}
        </pre>
      );
    case "callout":
      return (
        <div className="mt-6 flex max-w-[72ch] gap-3 rounded-xl border border-ember/30 bg-ember/5 px-4 py-3.5">
          <Info size={16} weight="bold" className="mt-0.5 shrink-0 text-ember" />
          <p className="!mt-0 text-[13.5px] leading-relaxed text-mute">{b.x}</p>
        </div>
      );
    case "table":
      return (
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line bg-raised/60">
                {b.head.map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="num px-4 py-2.5 text-[12.5px] text-mute">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

/** Standalone trust-page layout: display title, prose body, quiet width. */
export function ContentPage({ title, intro, blocks }) {
  return (
    <div className="relative overflow-hidden">
      <div className="relative mx-auto max-w-[840px] px-5 pb-28 pt-28 md:px-8">
        <h1 className="display text-[clamp(38px,5vw,64px)] uppercase text-bone">
          {title}
        </h1>
        {intro && (
          <p className="mt-5 max-w-[60ch] text-[15.5px] leading-relaxed text-mute">
            {intro}
          </p>
        )}
        <article className="prose-dr mt-4">
          {blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </article>
      </div>
    </div>
  );
}
