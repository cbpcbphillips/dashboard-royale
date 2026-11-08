import { MiniMd } from "@/components/Ev";
import { CLAIMS } from "@/lib/claims";

export const metadata = { title: "Evidence · The Gilded Ace" };

export default function Page() {
  return (
    <>
      <div className="eyebrow">Evidence</div>
      <h1 className="title">Every number, and how to check it</h1>
      <p className="sub">
        Each claim below backs a number in the dashboard. It names the query that produces it, what we ruled out, and what it can&apos;t tell you.
        Anyone can re-run a claim on the same data: <code>uv run python -m royale.claims C18</code> (add <code>--engine databricks</code> to run it on
        Databricks).
      </p>
      <div className="notice">The model checks (learned Jan–Apr, checked on May–Jun against simple guesses) are summarised in C14–C16; a fuller page is the next build step.</div>

      <section aria-labelledby="ev-title">
        <h2 className="section" id="ev-title">Evidence ({CLAIMS.length} claims)</h2>
        <ol className="claims">
          {CLAIMS.map((c) => (
            <li key={c.id} id={c.id} className="card claim">
              <div className="claim-head">
                <span className="claim-id">{c.id}</span>
                <span className="claim-used">Used in: {c.used_in}</span>
              </div>
              <p className="claim-text"><MiniMd text={c.claim} /></p>
              <dl className="claim-dl">
                <div><dt>Check it</dt><dd><MiniMd text={c.query} /></dd></div>
                <div><dt>Result</dt><dd><MiniMd text={c.result} /></dd></div>
                <div><dt>Ruled out</dt><dd><MiniMd text={c.alternative} /></dd></div>
                <div><dt>Limits</dt><dd><MiniMd text={c.limitation} /></dd></div>
              </dl>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
