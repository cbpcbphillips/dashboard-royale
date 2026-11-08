-- Gold: each machine-day next to its peers on the SAME day (D-013).
-- Peers exclude the machine itself: bank-mates, rest of zone, same game floor-wide,
-- same game in the same zone. Peers are taken per day, so moves and seasonality are handled.
CREATE OR REPLACE TABLE ${gold}.machine_day_peers AS
WITH bank_day AS (
    SELECT bank_id, gaming_date, COUNT(*) AS n, SUM(available_hours) AS avail, SUM(occupied_hours) AS occ,
           SUM(coin_in_usd) AS coin_in, SUM(theo_usd) AS theo
    FROM ${gold}.machine_day GROUP BY bank_id, gaming_date
), zone_day AS (
    SELECT zone_id, gaming_date, COUNT(*) AS n, SUM(available_hours) AS avail, SUM(occupied_hours) AS occ,
           SUM(coin_in_usd) AS coin_in, SUM(theo_usd) AS theo
    FROM ${gold}.machine_day GROUP BY zone_id, gaming_date
), game_day AS (
    SELECT config_id, gaming_date, COUNT(*) AS n, SUM(available_hours) AS avail, SUM(occupied_hours) AS occ,
           SUM(coin_in_usd) AS coin_in, SUM(theo_usd) AS theo
    FROM ${gold}.machine_day GROUP BY config_id, gaming_date
), zone_game_day AS (
    SELECT zone_id, config_id, gaming_date, COUNT(*) AS n, SUM(available_hours) AS avail,
           SUM(occupied_hours) AS occ, SUM(coin_in_usd) AS coin_in, SUM(theo_usd) AS theo
    FROM ${gold}.machine_day GROUP BY zone_id, config_id, gaming_date
)
SELECT
    m.machine_id, m.gaming_date, m.bank_id, m.zone_id, m.config_id,
    m.available_hours, m.occupied_hours, m.coin_in_usd, m.theo_usd,
    b.n - 1 AS bank_peers,       b.avail - m.available_hours AS bank_avail,  b.occ - m.occupied_hours AS bank_occ,
    b.coin_in - m.coin_in_usd AS bank_coin_in,  b.theo - m.theo_usd AS bank_theo,
    z.n - 1 AS zone_peers,       z.avail - m.available_hours AS zone_avail,  z.occ - m.occupied_hours AS zone_occ,
    z.coin_in - m.coin_in_usd AS zone_coin_in,  z.theo - m.theo_usd AS zone_theo,
    g.n - 1 AS game_peers,       g.avail - m.available_hours AS game_avail,  g.occ - m.occupied_hours AS game_occ,
    g.coin_in - m.coin_in_usd AS game_coin_in,  g.theo - m.theo_usd AS game_theo,
    zg.n - 1 AS zone_game_peers, zg.avail - m.available_hours AS zone_game_avail,
    zg.coin_in - m.coin_in_usd AS zone_game_coin_in, zg.theo - m.theo_usd AS zone_game_theo
FROM ${gold}.machine_day AS m
JOIN bank_day AS b ON b.bank_id = m.bank_id AND b.gaming_date = m.gaming_date
JOIN zone_day AS z ON z.zone_id = m.zone_id AND z.gaming_date = m.gaming_date
JOIN game_day AS g ON g.config_id = m.config_id AND g.gaming_date = m.gaming_date
JOIN zone_game_day AS zg ON zg.zone_id = m.zone_id AND zg.config_id = m.config_id AND zg.gaming_date = m.gaming_date;
