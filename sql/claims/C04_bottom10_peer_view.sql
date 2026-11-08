-- C04: The manager's bottom-10 machines in Back Forty are played at least as much as their
-- bank-mates (occupancy ratio >= 1), so players are not avoiding those machines; the spot is low.
SELECT f.manager_rank, f.machine_id, f.zone_id, f.bank_id, f.days_on_floor, f.retired,
       ROUND(f.occ_vs_bank, 2) AS occupancy_vs_bank_mates,
       ROUND(s.occ_vs_bank_lo, 2) AS ci_low, ROUND(s.occ_vs_bank_hi, 2) AS ci_high,
       ROUND(f.tpah_vs_game, 2) AS earning_vs_same_game_floorwide,
       ROUND(f.bank_effect, 2) AS bank_effect_vs_floor
FROM ${gold}.machine_metrics_full AS f
JOIN ${gold}.machine_q1_stats AS s ON s.machine_id = f.machine_id
WHERE f.in_manager_bottom10
ORDER BY f.manager_rank;
