import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

/** One verified claim from docs/claims.md (exported by `uv run python -m royale.claims --export`). */
export type Claim = { id: string; claim: string; query: string; result: string; alternative: string; limitation: string; used_in: string };

export const CLAIMS: Claim[] = JSON.parse(readFileSync(path.join(process.cwd(), "data", "claims.json"), "utf8"));
