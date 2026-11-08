-- C31: the guide's simple forecast (whole-floor coin-in per day, frozen at Apr 30) vs a constant mean on May-Jun,
-- and the fault forecast behind the staffing call (royale/floor_forecast.py).
SELECT * FROM ${gold}.floor_forecast_metrics;
SELECT * FROM ${gold}.fault_forecast_shift;
