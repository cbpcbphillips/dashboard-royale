import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

/** The general manager's list: the 10 machines with the lowest total house win, Jan 1 - Jun 30 (claim C01).
 *  web/data/manager.json, exported by `royale/export_app.py --only manager` from royale.gold.machine_metrics_full. */
export type ManagerMachine = {
  manager_rank: number; machine_id: string; zone_name: string; bank_id: string; days_on_floor: number;
  house_win_usd: number; theo_usd: number; luck_z: number; install_date: string | null; retire_date: string | null;
};

export const MANAGER: ManagerMachine[] = JSON.parse(readFileSync(path.join(process.cwd(), "data", "manager.json"), "utf8")).machines;
