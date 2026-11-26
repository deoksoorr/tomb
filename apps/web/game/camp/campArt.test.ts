import { describe, expect, it } from "vitest";
import { CAMP_BUS_STOP, CAMP_FURNITURE } from "@tomb/protocol";
import { SHELTER_ART_H, SHELTER_ART_W, SHELTER_FRONT, SHELTER_PAD, shelterArt } from "./campArt";

// 11/16 정류장 지붕·앞 기둥만 벤치에 앉은 사람 앞에 한 번 더 그린다 (CampMap) — 뒷벽·포스터·그림자는 앞 조각에 섞이면 안 된다
describe("bus shelter front pieces", () => {
  const WALL = [0x6e9a96, 0x8ab8b2, 0xf2e2b8, 0x6ea052, 0xe8783a, 0xe8dcc0, 0xe0563c];
  it("앞 조각(지붕·기둥)에는 뒷벽·포스터 색과 반투명 그림자가 없다", () => {
    const g = shelterArt();
    for (const [x0, y0, w, h] of SHELTER_FRONT) {
      // 11/26 텍스처는 둘레 여백(SHELTER_PAD)만큼 넓다 — 자르기 자리도 그만큼 옮겼다 (campSpriteEdge.test가 옛 자리와 같은 픽셀인지 본다)
      expect(x0 >= 0 && y0 >= 0 && x0 + w <= SHELTER_ART_W + SHELTER_PAD.x * 2 && y0 + h <= SHELTER_ART_H + SHELTER_PAD.top).toBe(true);
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const v = g.px[y * g.w + x];
          const a = v & 255;
          if (a === 0) continue;
          expect(a, `${x},${y}`).toBe(255);
          expect(WALL, `${x},${y}`).not.toContain(v >>> 8);
        }
    }
  });
  it("뒷벽은 정류장 벤치(qB) 바로 뒤 depth (CampMap: 정류장 − 9 < 벤치 y)", () => {
    const qB = CAMP_FURNITURE.find((f) => f.id === "qB")!;
    expect(CAMP_BUS_STOP.y - 9).toBe(qB.y - 1);
  });
});
