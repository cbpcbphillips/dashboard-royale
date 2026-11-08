// Unit tests for the statistics, sign-in redirect guard and URL filter checks. Run: npm test (Node's built-in runner).
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkScope, parseFilters } from "../lib/period.ts";
import { isLocalPath } from "../lib/session.ts";
import { holm, normCdf, normInv, poissonSf, ratioTest, tCdf } from "../lib/stats.ts";

const close = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test("normal distribution matches known values", () => {
  close(normCdf(0), 0.5);
  close(normCdf(-1.96), 0.025, 1e-3);
  close(normInv(0.975), 1.959964, 1e-4);
});

test("t distribution matches tables and approaches the normal", () => {
  close(tCdf(2.776, 4), 0.975, 1e-3); // t(0.975, df 4) = 2.776
  close(tCdf(-12.706, 1), 0.025, 1e-3); // t(0.975, df 1) = 12.706
  close(tCdf(1.96, 10000), normCdf(1.96), 1e-3);
  assert.ok(Number.isNaN(tCdf(Number.NaN, 5)));
});

test("Holm adjustment is monotone, capped at 1, and passes NaN through", () => {
  const out = holm([0.01, 0.04, 0.03, Number.NaN]);
  close(out[0], 0.03); // 3 tests × 0.01
  close(out[2], 0.06); // 2 × 0.03
  close(out[1], 0.06); // max(1 × 0.04, previous 0.06)
  assert.ok(Number.isNaN(out[3]));
  assert.ok(holm([0.9, 0.8]).every((p) => p <= 1));
});

test("Poisson upper tail", () => {
  close(poissonSf(0, 3), 1);
  close(poissonSf(1, 3), 1 - Math.exp(-3));
});

test("ratio test: ratio of sums, needs 2+ weeks, z sign follows the gap", () => {
  const r = ratioTest([90, 95, 92], [100, 100, 100]);
  close(r.R, 277 / 300);
  assert.ok(r.z < 0 && r.p < 0.5);
  assert.ok(Number.isNaN(ratioTest([90], [100]).z));
});

test("sign-in redirect only allows paths on this site", () => {
  for (const ok of ["/", "/plan", "/machines?from=2025-03-01&to=2025-03-31"]) assert.equal(isLocalPath(ok), true, ok);
  for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "evil", "/x\ty", ""]) assert.equal(isLocalPath(bad), false, bad);
});

test("URL filters: impossible dates fall back, reversed dates swap, unknown zone/bank is dropped with a note", () => {
  assert.equal(parseFilters({ from: "2025-02-30" }).from, "2025-01-01");
  const f = parseFilters({ from: "2025-06-30", to: "2025-06-01" });
  assert.deepEqual([f.from, f.to], ["2025-06-01", "2025-06-30"]);
  const s = checkScope(parseFilters({ zone: "Z-B40", bank: "B-01" }), [{ id: "Z-B40" }, { id: "Z-ENT" }], [{ id: "B-01", zoneId: "Z-ENT" }, { id: "B-31", zoneId: "Z-B40" }]);
  assert.equal(s.zone, "Z-B40");
  assert.equal(s.bank, undefined);
  assert.equal(s.notes.length, 1);
});
