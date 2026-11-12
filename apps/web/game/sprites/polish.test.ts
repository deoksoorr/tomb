import { describe, expect, it } from "vitest";
import { AVATAR_BODIES, EMOS, SEAT_MOODS } from "@tomb/protocol";
import { AV_ANIM, AV_H, AV_W, avatarFrameGrid, seatedAnchors } from "./avatar";
import { EMOTE_ICONS, emoteGrid } from "./emotes";
import { EMO_BOARD, emoIcon, emoSlotOfKey } from "../logic/emoBoard";
import { MOOD_ICON, moodIconGrid, moodPropGrid } from "./moodArt";

// 다듬기 5·24·17번: 이모티콘 판·벤치 상태 그림·나무 매달리기 뒷모습

const filledRows = (g: { get(x: number, y: number): number }, y0: number, y1: number) => {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < AV_W; x++) if ((g.get(x, y) & 255) > 0) n++;
  return n;
};

describe("5번 이모티콘 판", () => {
  it("손 흔들기·환호 + 이모티콘 12종 이상, 칸마다 그림이 있고 단축키 1~9", () => {
    expect(EMOS.length).toBeGreaterThanOrEqual(12);
    expect(EMO_BOARD.slice(0, 2).map((s) => s.id)).toEqual(["wave", "cheer"]);
    expect(EMO_BOARD).toHaveLength(EMOS.length + 2);
    for (const s of EMO_BOARD) {
      expect(EMOTE_ICONS).toContain(s.icon);
      const g = emoteGrid(s.icon);
      expect([g.w, g.h]).toEqual([13, 13]);
      expect(filledRows({ get: (x, y) => g.get(x, y) }, 0, 12)).toBeGreaterThan(20);
    }
    expect(emoSlotOfKey(1)?.id).toBe("wave");
    expect(emoSlotOfKey(3)?.id).toBe(EMOS[0].id);
    expect(emoSlotOfKey(9)?.id).toBe(EMOS[6].id);
    expect(emoSlotOfKey(0)).toBeNull();
    expect(emoSlotOfKey(10)).toBeNull();
    // 음표는 어두운 말풍선에서도 보이게 집 안 음표와 다른 밝은 그림
    expect(emoIcon("note")).toBe("tune");
  });
});

describe("24번 벤치 상태 그림", () => {
  it("상태마다 머리 위 아이콘(9×9)과 앞·옆 소품이 있다", () => {
    for (const m of SEAT_MOODS) {
      const ic = moodIconGrid(m.id);
      expect([ic.w, ic.h]).toEqual([MOOD_ICON, MOOD_ICON]);
      for (const v of ["down", "side"] as const) {
        const p = moodPropGrid(m.id, v, 10);
        expect(p.w * p.h).toBeGreaterThan(0);
        let n = 0;
        for (let i = 0; i < p.px.length; i++) if (p.px[i] & 255) n++;
        expect(n, `${m.id} ${v}`).toBeGreaterThan(4);
      }
    }
  });

  it("앉은 자세 기준점: 머리가 무릎보다 위, 프레임 안", () => {
    for (const b of AVATAR_BODIES) {
      const a = seatedAnchors(b.id);
      expect(a.headUp).toBeGreaterThan(a.lapUp);
      expect(a.headTop).toBeGreaterThan(a.headUp);
      expect(a.headTop).toBeLessThan(AV_H);
      expect(a.lapUp).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("17번 나무 매달리기 뒷모습", () => {
  const col = AV_ANIM.hang.col;
  it("6종 모두 뒷모습에서 두 손이 머리 위(가지 높이)에 보이고 가지가 그려진다", () => {
    for (const b of AVATAR_BODIES) {
      const g = avatarFrameGrid(b.id, "up", col);
      // 우산 유령은 서 있을 때 머리 위에 우산을 펴고 매달리면 내려놓는다 → 바탕(두건) 몸의 서 있는 모습과 비교
      const idle = avatarFrameGrid(b.id === "umbrella" ? "hood" : b.id, "up", AV_ANIM.idle.col);
      // 서 있는 뒷모습과 달리 머리 위쪽(위 8줄)에 손·가지가 칠해져 있다
      expect(filledRows(g, 0, 8), b.id).toBeGreaterThan(filledRows(idle, 0, 8) + 8);
      // 가지 나무색이 손 높이에 가로로 걸쳐 있다
      let bark = 0;
      for (let y = 0; y < 12; y++) for (let x = 0; x < AV_W; x++) if (g.get(x, y) >>> 8 === 0x8a6a44) bark++;
      expect(bark, b.id).toBeGreaterThan(4);
    }
  });

  it("두 프레임은 다리(아래쪽)가 번갈아 흔들린다 (발 없는 이불 유령은 밑단)", () => {
    for (const b of AVATAR_BODIES) {
      const f0 = avatarFrameGrid(b.id, "up", col);
      const f1 = avatarFrameGrid(b.id, "up", col + 1);
      let diff = 0;
      for (let y = 20; y < AV_H; y++) for (let x = 0; x < AV_W; x++) if (f0.get(x, y) !== f1.get(x, y)) diff++;
      expect(diff, b.id).toBeGreaterThan(0);
    }
  });
});
