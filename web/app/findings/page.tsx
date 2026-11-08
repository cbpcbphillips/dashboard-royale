import { Ev, MiniMd } from "@/components/Ev";
import { CLAIMS } from "@/lib/claims";

export const metadata = { title: "More findings · The Gilded Ace" };

const IDS = ["C26", "C27", "C28", "C29", "C30"];

/** Findings beyond the six questions, from a systematic scan of the data (royale/findings_scan.py). Each is a claim on Evidence. */
export default function FindingsPage() {
  const items = IDS.map((id) => CLAIMS.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  return (
    <>
      <div className="eyebrow">More findings</div>
      <h1 className="title">What else the data says</h1>
      <p className="sub">
        Beyond the six questions, a systematic scan of the hourly, session, food-and-drink and loyalty data turned up five findings. Each one tested an alternative
        explanation, and each can be re-run.
      </p>
      <div className="findings">
        {items.map((c, i) => {
          const [headline, ...rest] = c.claim.split("**").filter(Boolean);
          return (
            <article key={c.id} className="card finding">
              <div className="finding-n" aria-hidden="true">{i + 1}</div>
              <h2 className="finding-title">{headline.trim()} <Ev id={c.id} /></h2>
              <p className="finding-body"><MiniMd text={rest.join("**").trim()} /></p>
              <dl className="claim-dl">
                <div><dt>For July</dt><dd><MiniMd text={c.result.replace(/^July: /, "")} /></dd></div>
                <div><dt>Ruled out</dt><dd><MiniMd text={c.alternative} /></dd></div>
                <div><dt>Limits</dt><dd><MiniMd text={c.limitation} /></dd></div>
                <div><dt>Check it</dt><dd><MiniMd text={c.query} /></dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
