-- Gold: active machine-days with labels and supplied costs. The app filters this table by
-- date range, so every Q1 metric can be recomputed for any analysis period.
CREATE OR REPLACE TABLE ${gold}.machine_day AS
SELECT
    s.machine_id,
    s.gaming_date,
    p.month,
    p.local_weekday,
    p.is_weekend,
    s.location_id,
    s.bank_id,
    s.zone_id,
    p.zone_name,
    s.config_id,
    p.theme,
    p.volatility_class,
    CAST(p.configured_rtp AS DOUBLE) AS configured_rtp,
    p.manufacturer,
    p.lease_class,
    s.scheduled_hours,
    s.available_hours,
    s.occupied_hours,
    s.paid_spins,
    s.coin_in_usd,
    s.payout_usd,
    s.house_win_usd,
    s.theo_usd,
    s.luck_var_cents2,
    s.carded_coin_in_usd,
    CAST(p.lease_cost_usd AS DOUBLE) + CAST(p.service_cost_usd AS DOUBLE)
        + CAST(p.power_cost_usd AS DOUBLE) + CAST(p.repair_cost_usd AS DOUBLE) AS supplied_cost_usd,
    CAST(p.contribution_after_supplied_costs_usd AS DOUBLE) AS contribution_usd,
    p.faults_opened
FROM ${silver}.machine_day_active AS s
JOIN ${bronze}.prepared_daily_view AS p
  ON p.machine_id = s.machine_id AND p.gaming_date = s.gaming_date;
