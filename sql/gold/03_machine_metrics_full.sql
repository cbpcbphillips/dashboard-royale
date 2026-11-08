-- Gold: one row per machine for the full window (Jan 1 - Jun 30, 2025). All ratios are ratio
-- of sums. Peer ratios compare the machine with its peers on the same days (D-013).
CREATE OR REPLACE TABLE ${gold}.machine_metrics_full AS
WITH m AS (
    SELECT
        machine_id,
        COUNT(*) AS days_on_floor,
        MIN(gaming_date) AS first_day,
        MAX(gaming_date) AS last_day,
        MAX_BY(bank_id, gaming_date) AS bank_id,
        MAX_BY(zone_id, gaming_date) AS zone_id,
        MAX_BY(zone_name, gaming_date) AS zone_name,
        MAX_BY(config_id, gaming_date) AS config_id,
        MAX_BY(theme, gaming_date) AS theme,
        MAX_BY(volatility_class, gaming_date) AS volatility_class,
        MAX_BY(manufacturer, gaming_date) AS manufacturer,
        MAX_BY(lease_class, gaming_date) AS lease_class,
        COUNT(DISTINCT bank_id) AS banks_used,
        SUM(scheduled_hours) AS scheduled_hours,
        SUM(available_hours) AS available_hours,
        SUM(occupied_hours) AS occupied_hours,
        SUM(coin_in_usd) AS coin_in_usd,
        SUM(house_win_usd) AS house_win_usd,
        SUM(theo_usd) AS theo_usd,
        SUM(luck_var_cents2) AS luck_var_cents2,
        SUM(contribution_usd) AS contribution_usd,
        SUM(faults_opened) AS faults_opened
    FROM ${gold}.machine_day
    GROUP BY machine_id
), p AS (
    SELECT
        machine_id,
        SUM(bank_occ) / SUM(bank_avail) AS bank_occupancy,
        SUM(bank_coin_in) / SUM(bank_avail) AS bank_cpah,
        SUM(bank_theo) / SUM(bank_avail) AS bank_tpah,
        SUM(zone_occ) / SUM(zone_avail) AS zone_occupancy,
        SUM(zone_coin_in) / SUM(zone_avail) AS zone_cpah,
        SUM(zone_theo) / SUM(zone_avail) AS zone_tpah,
        SUM(game_theo) / SUM(game_avail) AS game_tpah,
        SUM(game_coin_in) / SUM(game_avail) AS game_cpah,
        SUM(zone_game_theo) / NULLIF(SUM(zone_game_avail), 0) AS zone_game_tpah,
        AVG(bank_peers) AS avg_bank_peers,
        AVG(zone_game_peers) AS avg_zone_game_peers
    FROM ${gold}.machine_day_peers
    GROUP BY machine_id
), floor AS (
    SELECT SUM(theo_usd) / SUM(available_hours) AS floor_tpah,
           SUM(coin_in_usd) / SUM(available_hours) AS floor_cpah,
           SUM(occupied_hours) / SUM(available_hours) AS floor_occupancy
    FROM ${gold}.machine_day
), manager AS (
    SELECT machine_id, RANK() OVER (ORDER BY house_win_usd) AS manager_rank FROM m
)
SELECT
    m.*,
    mc.install_date,
    mc.retire_date,
    mc.retire_date IS NOT NULL AS retired,
    mg.manager_rank,
    mg.manager_rank <= 10 AS in_manager_bottom10,
    m.available_hours / m.scheduled_hours AS availability,
    m.occupied_hours / m.available_hours AS occupancy,
    m.theo_usd / m.available_hours AS tpah,
    m.coin_in_usd / m.available_hours AS cpah,
    m.house_win_usd / m.available_hours AS hwpah,
    m.house_win_usd / NULLIF(m.coin_in_usd, 0) AS observed_hold,
    m.theo_usd / NULLIF(m.coin_in_usd, 0) AS theo_hold,
    m.house_win_usd - m.theo_usd AS luck_usd,
    SQRT(m.luck_var_cents2) / 100 AS luck_sd_usd,
    (m.house_win_usd - m.theo_usd) / (SQRT(m.luck_var_cents2) / 100) AS luck_z,
    m.contribution_usd / m.days_on_floor AS contribution_per_day,
    m.available_hours / m.days_on_floor AS avail_hours_per_day,
    p.bank_occupancy, p.bank_cpah, p.bank_tpah,
    p.zone_occupancy, p.zone_cpah, p.zone_tpah,
    p.game_tpah, p.game_cpah, p.zone_game_tpah,
    p.avg_bank_peers, p.avg_zone_game_peers,
    (m.occupied_hours / m.available_hours) / p.bank_occupancy AS occ_vs_bank,
    (m.coin_in_usd / m.available_hours) / p.bank_cpah AS cpah_vs_bank,
    (m.theo_usd / m.available_hours) / p.bank_tpah AS tpah_vs_bank,
    (m.occupied_hours / m.available_hours) / p.zone_occupancy AS occ_vs_zone,
    (m.coin_in_usd / m.available_hours) / p.zone_cpah AS cpah_vs_zone,
    (m.theo_usd / m.available_hours) / p.game_tpah AS tpah_vs_game,
    (m.theo_usd / m.available_hours) / p.zone_game_tpah AS tpah_vs_game_in_zone,
    p.bank_tpah / f.floor_tpah AS bank_effect,
    p.zone_tpah / f.floor_tpah AS zone_effect,
    f.floor_tpah, f.floor_cpah, f.floor_occupancy
FROM m
JOIN p ON p.machine_id = m.machine_id
JOIN manager AS mg ON mg.machine_id = m.machine_id
JOIN ${bronze}.machines AS mc ON mc.machine_id = m.machine_id
CROSS JOIN floor AS f;
