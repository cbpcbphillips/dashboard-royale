-- C24: Does the machine ranking hold up out of sample? Flags made on Jan-Apr only (labels, top 10 and the
-- shrinkage prior), then each group's May-Jun play vs its own same-day prediction (royale/q1_persistence.py).
-- lo/hi = 95% bootstrap of the difference vs everyone else.
SELECT * FROM ${gold}.q1_persistence;
