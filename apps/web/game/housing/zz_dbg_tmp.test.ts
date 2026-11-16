import { it } from "vitest";
import { furnitureGrid } from "./art";
it("dbg", () => {
  const g = furnitureGrid("shell_decor", "")!;
  const rows: string[] = [];
  for (let y = 0; y < g.h; y++) { let r = ""; for (let x = 0; x < g.w; x++) { const v = g.get(x, y); r += (v & 255) === 0 ? "." : ((v >>> 8) & 0xffffff).toString(16).slice(0, 1); } rows.push(r); }
  require("node:fs").writeFileSync("/private/tmp/claude-501/-Users-deoksookim-Desktop----tomb/843041b4-5d64-40e9-b3b4-417f8a66d6dd/scratchpad/seaside-housing/r2/dbg.txt", rows.join("\n"));
});
