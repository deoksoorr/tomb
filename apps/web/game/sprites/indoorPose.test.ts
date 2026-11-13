import { describe, expect, it } from "vitest";
import { AVATAR_BODIES } from "@tomb/protocol";
import { AV_H, AV_W } from "./avatar";
import { INDOOR_POSE_FRAMES, indoorPoseSheet } from "./indoorPose";

// 욕조 물: 네모 블록이 아니라 욕조 물 타원 안에서만 (프레임 아래쪽·양 끝은 비워 욕조 그림이 보이게)
describe("bath pose water", () => {
  it("stays inside an oval: bottom rows and side corners are empty, the head is above water", () => {
    for (const { id: body } of AVATAR_BODIES)
      for (const look of [[], ["back_cape"]]) {
        const g = indoorPoseSheet("bath", body, "#9fb8d8", look);
        for (let f = 0; f < INDOOR_POSE_FRAMES; f++) {
          const ox = f * AV_W;
          const at = (x: number, y: number) => g.get(ox + x, y) & 255;
          // 욕조 그림의 물 타원 아래(앞 테두리·다리)는 비어 있다
          for (let y = 24; y < AV_H; y++) for (let x = 0; x < AV_W; x++) expect(at(x, y), `${body} f${f} (${x},${y})`).toBe(0);
          // 수면 줄 양 끝 모서리 (네모 블록이면 칠해져 있던 곳)
          for (const y of [21, 22, 23]) for (const x of [0, AV_W - 1]) expect(at(x, y), `${body} corner (${x},${y})`).toBe(0);
          // 머리는 물 위에 남는다
          let head = 0;
          for (let y = 0; y < 16; y++) for (let x = 0; x < AV_W; x++) if (at(x, y) === 255) head++;
          expect(head, body).toBeGreaterThan(20);
        }
      }
  });
});
