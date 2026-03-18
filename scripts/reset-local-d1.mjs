import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const d1StatePath = path.join(process.cwd(), ".wrangler", "state", "v3", "d1");

if (existsSync(d1StatePath)) {
  rmSync(d1StatePath, { recursive: true, force: true });
}
