import { describe, expect, it } from "vitest";
import { huntDollGrid } from "@/game/sprites/setGear";
import { dollOpts } from "./HuntDoll";

// 11/15 사냥 장비창 인형: 마을 꾸미기 없이 낀 사냥 장비만, 반짝임 두 장 모두 그려진다

const none = { weapon: null, armor: null, head: null, acc1: null, acc2: null };

describe("사냥 장비창 인형", () => {
  it("세트 갑옷·머리·장신구는 몸에, 상점 무기는 아이콘을 손에, +15는 금빛 테", () => {
    const o = dollOpts(
      {
        ...none,
        weapon: "w_stamp",
        armor: "s213.2.0.r6p29h10.0.0",
        head: "s023.3.15.c6m6k8.0.0",
        acc1: "s033.4.0.a7.0.0",
      },
      "#e8d9b0",
      "hood",
    );
    expect(o.armor).toEqual({ set: "meeting", grade: 3 });
    expect(o.head).toEqual({ set: "overtime", grade: 3 });
    expect(o.accs).toEqual([{ set: "overtime", grade: 3 }]);
    expect(o.weapon && "grid" in o.weapon).toBe(true);
    expect(dollOpts({ ...none, weapon: "s003.1.15.a7.0.0" }, "#fff", "hood").glow).toBe(0xffc83c);
    expect(dollOpts({ ...none, weapon: "w_stamp+5" }, "#fff", "hood").glow).toBeNull();
    for (const frame of [0, 1]) expect(() => huntDollGrid({ ...o, frame })).not.toThrow();
    expect(() => huntDollGrid({ ...dollOpts(none, "#fff", "hood"), frame: 1 })).not.toThrow();
  });
});
