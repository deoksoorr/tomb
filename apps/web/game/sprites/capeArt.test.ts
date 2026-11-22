import { describe, expect, it } from "vitest";
import { avatarColorSpec, avatarFrameGrid } from "./avatar";

// 11/22 등(pack)으로 옮긴 망토·걸친 재킷·숄: 뒷모습에서 머리 아래(뒷덜미)부터 자락까지 덮고, 옷(롱패딩) 위에 걸친다

const BASE = "#9fc5a8";
const CAPES = ["back_cape", "back_milkcape", "xm_cape", "fr_cloak", "q_back_cape", "back_jacket", "back_shawl"];
const frame = (look: string[], view: "down" | "side" | "up", body = "hood", spec = BASE) => [...avatarFrameGrid(body, view, 0, spec, look).px];
const changed = (a: number[], b: number[], y0: number, y1: number) => {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < 20; x++) if (a[y * 20 + x] !== b[y * 20 + x]) n++;
  return n;
};

describe("11/22 망토 뒷덜미 깃 (capeArt)", () => {
  it("뒷모습: 머리 아래 두 줄 + 목 줄(두건 18~20줄, 키다리 13~15줄)을 망토가 덮는다", () => {
    for (const id of CAPES)
      for (const [body, y0] of [["hood", 18], ["cat", 18], ["tall", 13]] as const) {
        const bare = frame([], "up", body);
        expect(changed(bare, frame([id], "up", body), y0, y0 + 2), `${id} ${body}`).toBeGreaterThanOrEqual(12);
      }
  });

  it("롱패딩 + 망토: 뒷모습 등판은 망토 색 (롱패딩 털 후드가 망토를 덮지 않는다), 앞모습은 롱패딩이 그대로 보인다", () => {
    for (const id of ["back_cape", "q_back_cape", "xm_cape"]) {
      const bare = frame([], "up");
      const cape = frame([id], "up");
      const both = frame(["sc_padding", id], "up");
      // 목 줄 아래 세 줄(21~23)에서 망토가 칠한 칸은 롱패딩을 같이 입어도 망토 색 그대로 (망토 밖으로 삐져나온 패딩 가장자리는 제외)
      let diff = 0;
      for (let y = 21; y <= 23; y++) for (let x = 0; x < 20; x++) { const i = y * 20 + x; if (cape[i] !== bare[i] && cape[i] !== both[i]) diff++; }
      expect(diff, id).toBe(0);
      expect(changed(frame(["sc_padding"], "down"), frame(["sc_padding", id], "down"), 21, 23), id).toBeLessThan(20);
    }
  });

  it("어깨 깃도 망토 색으로 염색된다 (뒷덜미가 기본색으로 남지 않는다)", () => {
    for (const id of ["back_cape", "back_milkcape", "back_jacket"]) {
      const plain = frame([id], "up");
      const dyed = frame([id], "up", "hood", avatarColorSpec(BASE, { items: { [id]: "#3fbfa4" } }));
      expect(changed(plain, dyed, 18, 20), id).toBeGreaterThan(4);
    }
  });
});
