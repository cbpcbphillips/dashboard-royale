# Q2-Q5 validation (2026-11-07 16:45)

Command: `uv run python -m royale.q2q5_validate`

| Check | A | B | Result |
|---|---:|---:|---|
| Q2 floor coin-in = property_day coin-in | 248,905,219.25 | 248,905,219.25 | PASS |
| Q2 zone-day coin-in = floor coin-in | 248,905,219.25 | 248,905,219.25 | PASS |
| Q2 traffic entries (ok/partial) = property_day entries | 2,653,848.00 | 2,653,848.00 | PASS |
| Q3 hourly downtime (machine_hour) = daily downtime (machine_day) | 5,021.08 | 5,021.08 | PASS |
| Q3 fault tickets = property_day faults_opened | 1,207.00 | 1,207.00 | PASS |
| Q4 tracked coin-in (player_month) = carded coin-in on machine meters | 163,804,869.65 | 163,804,869.65 | PASS |
| Q4 group summary 'All' theo = player_month theo | 15,485,020.98 | 15,485,020.98 | PASS |
| Q5 comp cost: ledger (by week) = player_period | 190,669.30 | 190,669.30 | PASS |
| Q5 comp cost: player_period = property_day = POS comp cogs (counted once) | 190,669.30 | 190,669.30 | PASS |
