-- C23: Why the floor got quieter after April: each explanation tested (royale/q2_dip.py).
-- change = weekday-matched % change May-Jun vs Jan-Apr (lo/hi = 95% bootstrap of days within weekday);
-- share = how much of the headline drop the explanation accounts for. Weather: NOAA GHCN-Daily (public domain).
SELECT test, ROUND(change, 4) AS change, ROUND(lo, 4) AS lo, ROUND(hi, 4) AS hi, ROUND(share, 2) AS share_of_drop, verdict, note
FROM ${gold}.demand_dip_tests;
