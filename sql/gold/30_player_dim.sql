-- Q4 (D-028): one row per loyalty account with the four drill groups. Tracked (carded) play only.
-- Spend segment = rank by full-window theo among players with carded play. It describes
-- concentration only and is never a target list.
CREATE OR REPLACE TABLE ${gold}.player_dim AS
WITH p AS (
    SELECT player_id, SUM(CAST(theo_usd AS DOUBLE)) AS theo, SUM(CAST(tracked_coin_in_usd AS DOUBLE)) AS coin_in
    FROM ${bronze}.player_period
    GROUP BY player_id
), r AS (
    SELECT player_id, ROW_NUMBER() OVER (ORDER BY theo DESC, player_id) AS rk, COUNT(*) OVER () AS n
    FROM p
    WHERE coin_in > 0
)
SELECT pl.player_id,
       pl.opening_tier,
       COALESCE(pl.age_band, 'Unknown') AS age_band,
       pl.home_region,
       CASE WHEN r.rk IS NULL THEN 'No carded play'
            WHEN r.rk <= 0.01 * r.n THEN '1 Top 1%'
            WHEN r.rk <= 0.10 * r.n THEN '2 Next 9%'
            WHEN r.rk <= 0.50 * r.n THEN '3 Next 40%'
            ELSE '4 Lower 50%' END AS spend_segment
FROM ${bronze}.players AS pl
LEFT JOIN r ON r.player_id = pl.player_id;
