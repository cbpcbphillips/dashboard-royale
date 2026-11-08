-- Silver: one row per machine per gaming day while the machine was on the floor.
-- Shared SQL (same text on DuckDB and Databricks; layer prefixes filled per engine).
-- Rules applied: active rows only (drops the 1,018 off-floor rows); cents -> dollars;
-- hours from scheduled_seconds (DST day = 23 h); location as of that day (machines move);
-- luck variance per day = sum_bet_squared x payout_multiplier_variance (cents^2), summed
-- later and square-rooted for the luck SD of any period.
CREATE OR REPLACE TABLE ${silver}.machine_day_active AS
SELECT
    md.machine_id,
    md.gaming_date,
    md.location_id,
    fl.bank_id,
    fl.zone_id,
    md.config_id,
    CAST(md.scheduled_seconds AS DOUBLE) / 3600 AS scheduled_hours,
    CAST(md.available_seconds AS DOUBLE) / 3600 AS available_hours,
    CAST(md.occupied_seconds AS DOUBLE) / 3600 AS occupied_hours,
    md.paid_spins,
    CAST(md.coin_in_cents AS DOUBLE) / 100 AS coin_in_usd,
    CAST(md.payout_cents AS DOUBLE) / 100 AS payout_usd,
    CAST(md.house_win_cents AS DOUBLE) / 100 AS house_win_usd,
    CAST(md.theo_cents AS DOUBLE) / 100 AS theo_usd,
    CAST(md.sum_bet_squared AS DOUBLE) * CAST(gm.payout_multiplier_variance AS DOUBLE) AS luck_var_cents2,
    CAST(md.carded_coin_in_cents AS DOUBLE) / 100 AS carded_coin_in_usd,
    CAST(md.carded_theo_cents AS DOUBLE) / 100 AS carded_theo_usd
FROM ${bronze}.machine_day AS md
JOIN ${bronze}.floor_locations AS fl ON fl.location_id = md.location_id
JOIN ${bronze}.game_math AS gm ON gm.config_id = md.config_id
WHERE md.active AND md.location_id IS NOT NULL;
