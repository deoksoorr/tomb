import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { it } from "vitest";
import { FURNITURE } from "@/lib/housing/catalog";
import { floorGrid, furnitureGrid, itemVariant, wallGrid } from "./art";
import type { Grid } from "../sprites/pixel";

function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function sheet(file: string, grids: (Grid | null)[], S: number, cell: number, cols: number, flips: boolean[] = []) {
  const rows = Math.ceil(grids.length / cols);
  const W = cell * cols * S, H = cell * rows * S;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 0xc6; out[i * 4 + 1] = 0xb6; out[i * 4 + 2] = 0x98; out[i * 4 + 3] = 255; }
  grids.forEach((g, i) => {
    if (!g) return;
    const ox = (i % cols) * cell + Math.floor((cell - g.w) / 2), oy = Math.floor(i / cols) * cell + (cell - g.h - 2);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const v = g.get(flips[i] ? g.w - 1 - x : x, y); const a = (v & 255) / 255; if (!a) continue;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const p = (((oy + y) * S + sy) * W + (ox + x) * S + sx) * 4;
        out[p] = out[p] * (1 - a) + ((v >>> 24) & 255) * a; out[p + 1] = out[p + 1] * (1 - a) + ((v >>> 16) & 255) * a; out[p + 2] = out[p + 2] * (1 - a) + ((v >>> 8) & 255) * a;
      }
    }
  });
  writeFileSync(file, png(W, H, out));
}
const D = "/private/tmp/claude-501/-Users-deoksookim-Desktop----tomb/843041b4-5d64-40e9-b3b4-417f8a66d6dd/scratchpad/seaside-housing";
it("sheet", () => {
  const sea = FURNITURE.filter((f) => f.category === "sea");
  const gs: (Grid | null)[] = [];
  const fl: boolean[] = [];
  for (const f of sea) for (let r = 4; r < 8; r++) { gs.push(furnitureGrid(f.id, itemVariant(f.id, "", { r }))); fl.push(r === 7); }
  for (let r = 4; r < 8; r++) { gs.push(furnitureGrid("sea_hammock", itemVariant("sea_hammock", "lie", { r }))); fl.push(r === 7); }
  for (const id of ["floor_deck", "floor_sand", "floor_mosaic"]) gs.push(floorGrid(id, 0));
  for (const id of ["wall_sea", "wall_shell", "wall_driftwood"]) gs.push(wallGrid(id, 0));
  sheet(`${D}/furniture-sheet.png`, gs, 4, 66, 8, fl);
  sheet(`${D}/r2/shell-1x.png`, [0, 1, 2, 3].map((k) => furnitureGrid("shell_decor", itemVariant("shell_decor", "", { r: 4 + k }))), 1, 32, 4, [false, false, false, true]);
  sheet(`${D}/r2/shell-6x.png`, [0, 1, 2, 3].map((k) => furnitureGrid("shell_decor", itemVariant("shell_decor", "", { r: 4 + k }))), 8, 32, 4, [false, false, false, true]);
});
