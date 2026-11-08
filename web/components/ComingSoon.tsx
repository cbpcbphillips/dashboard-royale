export function ComingSoon({ title, what, claims }: { title: string; what: string; claims: string[] }) {
  return (
    <>
      <div className="eyebrow">In the next build step</div>
      <h1 className="title">{title}</h1>
      <p className="sub">{what}</p>
      <div className="notice">
        The analysis behind this page is done and verified; this page is built after Q1. Evidence:{" "}
        {claims.map((c, i) => (
          <span key={c}>
            {i > 0 && " · "}
            <a href={`/checks#${c}`}>{c}</a>
          </span>
        ))}
      </div>
    </>
  );
}
