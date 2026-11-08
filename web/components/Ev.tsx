import type { ReactNode } from "react";

/** A small "evidence" link from a number on a page to its claim on the Evidence tab. */
export function Ev({ id }: { id: string }) {
  return (
    <a className="ev-link" href={`/checks#${id}`} title={`Evidence: claim ${id} (how to re-check this number)`}>
      {id}
    </a>
  );
}

/** Render the small markdown subset used in docs/claims.md: **bold**, *italic*, `code`. */
export function MiniMd({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) parts.push(<b key={k++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith("`")) parts.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else parts.push(<i key={k++}>{t.slice(1, -1)}</i>);
    last = m.index! + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
