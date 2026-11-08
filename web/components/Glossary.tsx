/** Plain-English meanings of the few terms the dashboard can't avoid. Shown on Evidence (#glossary) and linked from the footer. */
export const TERMS: { term: string; means: string }[] = [
  { term: "Coin-in", means: "Everything wagered, including winnings bet again." },
  { term: "House win", means: "What the casino actually kept: coin-in minus what the machines paid out. Swings with luck." },
  { term: "Expected earnings (theo)", means: "What the casino keeps on average from that much play, given each game's built-in edge. Luck removed." },
  { term: "Per open hour", means: "Divided by the hours a machine was switched on and working, so new, retired or broken machines compare fairly." },
  { term: "Time in use", means: "Share of a machine's open time someone was playing it." },
  { term: "Prediction", means: "What a machine should earn, worked out from the other machines running the same game in the same kind of spot on the same days." },
  { term: "Luck score", means: "How far actual house win sits from expected earnings, in units of normal luck for that machine's bets and game. Beyond about ±3.6 is too big to be chance across 310 machines." },
  { term: "Proven", means: "Too big to be chance, even after allowing for testing every machine at once (a 5% test corrected for many tests)." },
  { term: "Not proven yet", means: "Looks low, but not by enough to rule out chance; more months of similar results would settle it." },
  { term: "Quiet spot", means: "Its bank is proven to be in use clearly less than the floor (at most 90% as much)." },
  { term: "Range", means: "Where the true number most likely is (95% of resampled versions of the data fall inside)." },
  { term: "Profit (July plan)", means: "Expected earnings gained, minus the vendor's share on revenue-share machines and the comps the extra play earns." },
];

export function Glossary() {
  return (
    <section className="card block" aria-labelledby="glossary">
      <h2 className="section" id="glossary">What the words mean</h2>
      <dl className="dq-list">
        {TERMS.map((t) => (
          <div key={t.term}>
            <dt>{t.term}</dt>
            <dd>{t.means}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
