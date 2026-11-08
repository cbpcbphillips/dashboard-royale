-- C13: Tracked (carded) players: most lose over six months, and results are concentrated.
SELECT dimension, grp, players, players_with_play,
       ROUND(ahead_rate, 3) AS share_ahead,
       ROUND(share_of_theo, 3) AS share_of_theo,
       ROUND(share_of_net_loss, 3) AS share_of_net_loss,
       ROUND(comp_reinvestment, 4) AS comp_cost_per_theo,
       ROUND(visits_per_player_with_play, 2) AS visits_per_player
FROM ${gold}.player_group_summary
WHERE dimension IN ('All players', 'Spend segment', 'Home region', 'Loyalty tier')
ORDER BY dimension, grp;
