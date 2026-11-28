import { describe, expect, it } from "vitest";
import { AVATAR_BODIES } from "@tomb/protocol";
import { AV_ANIM, AV_H, AV_W, avatarFrameGrid, BODY_METRICS, bodyOf } from "./avatar";
import { hammockLieKey } from "./hammockArt";
import { INDOOR_POSE_FRAMES, indoorPoseKey, indoorPoseSheet, type LieCover } from "./indoorPose";
import { CX_COVER } from "../housing/campExclusive";
import { cxCoverName } from "../housing/campExclusive/types";

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

// 11/16 운영 버그: 해먹 누운 텍스처 키("-lie")가 침대 자세 키와 같아, 해먹에 한 번 누운 화면에서는 침대에 누워도 해먹 그림이 나왔다.
// Phaser 텍스처는 씬끼리 같이 쓰므로 생김새 하나에서 나오는 자세 텍스처 키는 모두 달라야 한다.
describe("pose texture keys never collide", () => {
  it("hammock, bed (quilt), sun lounger (towel), read, bath each get their own key", () => {
    const av = "avatar-e8d9b0";
    const keys = [
      hammockLieKey(av),
      indoorPoseKey(av, "lie"),
      indoorPoseKey(av, "lie", "quilt"),
      indoorPoseKey(av, "lie", "towel"),
      indoorPoseKey(av, "read"),
      indoorPoseKey(av, "bath"),
    ];
    // 침대 기본 덮개 = 이불 (같은 키)
    expect(keys[1]).toBe(keys[2]);
    const distinct = [keys[0], keys[1], keys[3], keys[4], keys[5]];
    expect(new Set(distinct).size).toBe(distinct.length);
    // 아바타 시트 키 자체와도 겹치지 않는다
    for (const k of distinct) expect(k).not.toBe(av);
  });
});

// 11/27 운영 버그: 누운 자세 프레임 1에 그리던 3×3 "작은 z"가 I자로 보였고, 돌린 자리(릴렉스 체어·돌린 침대)에서는 자세와 함께 돌아 머리 옆·발밑에 떴다.
// 누운 자세는 목선 위(머리·모자)를 아바타 그림 그대로 둔다 — 덮개 말고는 아무것도 덧그리지 않는다.
// (캠핑장 기본 침대의 옆·뒤 덮개 cvbed1~3·pnbed1~3은 침대 그림을 프레임 가장자리까지 이어 그리므로 뺀다)
describe("lie pose adds nothing above the neck", () => {
  it("every body × every cover × both frames: rows above the cover equal the plain avatar frame", () => {
    const covers: LieCover[] = ["quilt", "towel", "cvbed0", "pnbed0"];
    for (const key of Object.keys(CX_COVER)) for (let d = 0; d < 4; d++) covers.push(cxCoverName(key, d));
    for (const { id: body } of AVATAR_BODIES)
      for (const look of [[], ["hat_crown"]]) {
        const b = bodyOf(body);
        const base = avatarFrameGrid(b, "down", AV_ANIM.hammock.col, "#9fb8d8", look);
        let y0 = AV_H;
        for (let y = 0; y < AV_H && y0 === AV_H; y++) for (let x = 0; x < AV_W; x++) if (base.filled(x, y)) { y0 = y; break; }
        const neck = Math.max(AV_H - 1 - BODY_METRICS[b].shoulder - 1, y0 + 7);
        for (const cover of covers) {
          const g = indoorPoseSheet("lie", body, "#9fb8d8", look, cover);
          for (let f = 0; f < INDOOR_POSE_FRAMES; f++)
            for (let y = 0; y < neck; y++)
              for (let x = 0; x < AV_W; x++) expect(g.get(f * AV_W + x, y), `${body} ${look.join()} ${cover} f${f} (${x},${y})`).toBe(base.get(x, y));
        }
      }
  });
});
