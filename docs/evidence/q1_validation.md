# Q1 validation (2026-11-07 16:20)

Command: `uv run python -m royale.q1_validate`

## 1. Manager's bottom 10 reproduced

Guide query: M-5076, M-1158, M-1120, M-1118, M-1238, M-1181, M-1035, M-1179, M-1017, M-1265

Ours: M-5076, M-1158, M-1120, M-1118, M-1238, M-1181, M-1035, M-1179, M-1017, M-1265

**PASS** (same machines, same order)

## 2. Totals reconcile

| Source | Coin-in $ | House win $ | Theo $ | Available hours |
|---|---:|---:|---:|---:|
| gold.machine_day | 248,905,219.25 | 23,638,155.10 | 23,545,364.48 | 1,316,886.9 |
| prepared_daily_view (active) | 248,905,219.25 | 23,638,155.10 | 23,545,364.48 | 1,316,886.9 |
| property_day | 248,905,219.25 | 23,638,155.10 | 23,545,364.48 | 1,316,886.9 |

**PASS** (all three agree to the cent / 0.01 h)

## 3. Luck z-scores behave like luck

310 machines: mean -0.067 (expect 0), SD 1.095 (expect 1), Shapiro-Wilk p = 0.166.

| z at or below | Machines | Expected by chance |
|---:|---:|---:|
| -2.0 | 11 | 7.1 |
| -2.5 | 3 | 1.9 |
| -3.0 | 1 | 0.4 |
| -3.7 | 1 | 0.0 |

Most extreme: z = -4.57; one-sided p = 2.4e-06; chance that at least one of 310 machines is this extreme by luck = 0.0008.
