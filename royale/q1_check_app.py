"""Compare the app's Q1 numbers (GET /api/q1) with the Python reference for several periods.
Run with the dev server up: uv run python -m royale.q1_check_app"""
import json
import os
import urllib.request

import duckdb
import numpy as np

from royale import q1_reference as Q, targets

PERIODS = [("2025-01-01", "2025-06-30"), ("2025-03-01", "2025-03-31"), ("2025-05-01", "2025-06-30"), ("2025-02-10", "2025-04-20")]


def main():
    con = duckdb.connect(str(targets.LOCAL_DB), read_only=True)
    df = Q.load(con)
    tau2 = json.loads((targets.ROOT / "web" / "data" / "q1.json").read_text())["meta"]["tau2"]
    ok_all = True
    for frm, to in PERIODS:
        ref = Q.compute(df, frm, to, tau2).set_index("machine_id")
        req = urllib.request.Request(f"http://localhost:3000/api/q1?from={frm}&to={to}")
        if os.environ.get("GILDED_SESSION"):  # the app is staff-only (D-084): pass a session cookie (e.g. from Judge / demo access)
            req.add_header("Cookie", f"gilded_session={os.environ['GILDED_SESSION']}")
        app = json.loads(urllib.request.urlopen(req, timeout=120).read())
        a = {m["machine_id"]: m for m in app["machines"]}
        diffs = {k: 0.0 for k in ("score", "play_short", "play_z", "luck_z", "bank_ratio")}
        lab_mismatch = 0
        for mid, r in ref.iterrows():
            m = a[mid]
            for k in diffs:
                x, y = r[k], m[k]
                if x is None or y is None or (isinstance(x, float) and np.isnan(x)):
                    continue
                diffs[k] = max(diffs[k], abs(float(x) - float(y)))
            ref_l = {k for k, col in (("quiet", "L_quiet"), ("down", "L_down"), ("paying", "L_paying"), ("unpopular", "L_unpopular")) if r[col]}
            if ref_l != {l for l in m["labels"] if l in ("quiet", "down", "paying", "unpopular")}:
                lab_mismatch += 1
        top_ref = list(ref.sort_values("rank").index[:10]); top_app = [m["machine_id"] for m in app["machines"][:10]]
        ok = lab_mismatch == 0 and top_ref == top_app and diffs["score"] < 0.5
        ok_all &= ok
        print(f"{frm}..{to}: machines {len(ref)}/{len(a)} | max diffs {{{', '.join(f'{k}: {v:.2g}' for k, v in diffs.items())}}} | "
              f"label mismatches {lab_mismatch} | top-10 identical {top_ref == top_app} -> {'PASS' if ok else 'FAIL'}")
    print("ALL PASS" if ok_all else "SOME FAILED")


if __name__ == "__main__":
    main()
