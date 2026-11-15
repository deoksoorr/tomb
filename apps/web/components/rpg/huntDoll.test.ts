import { describe, expect, it } from "vitest";
import { avatarFrameGrid } from "@/game/sprites/avatar";
import { huntDollGrid } from "@/game/sprites/setGear";
import { huntLook } from "@/game/sprites/setGearWear";
import { dollOpts } from "./HuntDoll";

// 11/15 사냥 장비창 인형: 사냥터 안의 내 캐릭터와 같은 그림 — 낀 갑옷·머리·장신구(세트·상점·주운 장비 모두)를
// 사냥터와 같은 착용 목록(huntLook)으로 몸에 입히고, 무기는 손에. 반짝임 두 장 모두 그려진다

const none = { weapon: null, armor: null, head: null, acc1: null, acc2: null };

/** 두 그림이 다른 픽셀 수 */
function diff(a: { w: number; h: number; get(x: number, y: number): number }, b: typeof a): number {
  let n = 0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.get(x, y) !== b.get(x, y)) n++;
  return n;
}

describe("사냥 장비창 인형", () => {
  it("세트 갑옷·머리·장신구는 사냥터와 같은 착용 목록으로, 상점 무기는 아이콘을 손에, +15는 금빛 테", () => {
    const equip = {
      ...none,
      weapon: "w_stamp",
      armor: "s213.2.0.r6p29h10.0.0",
      head: "s023.3.15.c6m6k8.0.0",
      acc1: "s033.4.0.a7.0.0",
    };
    const o = dollOpts(equip, "#e8d9b0", "hood");
    expect(o.look).toEqual(huntLook([], equip));
    expect(o.look).toEqual(["sgw.a.23", "sgw.c.03", "sgw.h.03"]);
    expect(o.weapon && "grid" in o.weapon).toBe(true);
    expect(dollOpts({ ...none, weapon: "s003.1.15.a7.0.0" }, "#fff", "hood").glow).toBe(0xffc83c);
    expect(dollOpts({ ...none, weapon: "w_stamp+5" }, "#fff", "hood").glow).toBeNull();
    for (const frame of [0, 1]) expect(() => huntDollGrid({ ...o, frame })).not.toThrow();
    expect(() => huntDollGrid({ ...dollOpts(none, "#fff", "hood"), frame: 1 })).not.toThrow();
  });

  it("상점·주운 갑옷·머리·장신구(철제 캐비닛 아머·연차 쓴 날의 후광 +5·성과급 봉투 +5)도 입는다 — 예전엔 세트 장비만 그려 빠졌다", () => {
    const equip = { ...none, weapon: "w_laser+7", armor: "a_server_rack", head: "h_halo+5", acc1: "c_bonus+5" };
    const o = dollOpts(equip, "#c9b6e4", "sheet");
    expect(o.look).toEqual(["sgw.a.a_server_rack", "sgw.c.c_bonus+", "sgw.h.h_halo+"]);
    // 몸 그림이 사냥터의 아바타 시트와 같다 (같은 몸·색·착용 목록)
    const bare = huntDollGrid({ color: "#c9b6e4", body: "sheet" });
    const worn = huntDollGrid({ ...o, weapon: null, glow: null });
    expect(diff(bare, worn)).toBeGreaterThan(20);
    const inHunt = avatarFrameGrid("sheet", "down", 0, "#c9b6e4", huntLook([], equip));
    const plain = avatarFrameGrid("sheet", "down", 0, "#c9b6e4", []);
    expect(diff(inHunt, plain)).toBeGreaterThan(20);
  });

  it("입은 마을 꾸미기도 사냥터처럼: 머리 장비를 끼면 머리 꾸미기는 빠지고, 사냥 장비가 없는 자리 꾸미기는 남는다", () => {
    const o = dollOpts({ ...none, head: "h_halo" }, "#fff", "hood", ["hat_beanie", "neck_tie", "pet_ghost"]);
    expect(o.look).toContain("sgw.h.h_halo");
    expect(o.look).not.toContain("hat_beanie");
    expect(o.look).toContain("neck_tie");
    // 장비를 바꾸면 그림 옵션도 바로 바뀐다
    expect(dollOpts({ ...none, head: null }, "#fff", "hood", ["hat_beanie"]).look).toEqual(["hat_beanie"]);
  });
});
