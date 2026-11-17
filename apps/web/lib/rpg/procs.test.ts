import { describe, expect, it } from "vitest";
import { CARDS, RARITY_COLOR } from "./cards";
import { cardProc, cookieProc, isProcCard, PROC_CARDS, SG_PROCS, sgProc } from "./procs";

// 11/17 「발동」 표시에 적는 것

const ICON = { shape: "sg:003", main: 0, accent: 0 };
const all = () => [
  ...PROC_CARDS.map((id) => cardProc(id)),
  ...SG_PROCS.map((k) => sgProc(k, ICON)),
  cookieProc(),
];

describe("발동 표시", () => {
  it("발동형 카드 목록: 무한 야근 · 반차 · 연차 몰아 쓰기 · 법인카드", () => {
    expect([...PROC_CARDS]).toEqual(["overtime", "halfday", "leave", "corpcard"]);
    expect(isProcCard("halfday")).toBe(true);
    expect(isProcCard("oneshot")).toBe(false);
  });

  it("카드는 카드 고르기와 같은 그림·이름·등급 색", () => {
    for (const id of PROC_CARDS) {
      const p = cardProc(id);
      expect(p.art).toEqual({ card: id });
      expect(p.name).toBe(CARDS[id].name);
      expect(p.color).toBe(RARITY_COLOR[CARDS[id].rarity]);
      expect(p.key).toBe(`card:${id}`);
    }
  });

  it("그때의 숫자를 적는다 (팀장 승진이면 더 크게)", () => {
    expect(cardProc("overtime", { reviveHp: 0.45, big: true })).toMatchObject({ line: "체력 45%로 다시 일어나요", left: "남은 부활 0번", big: true });
    expect(cardProc("overtime").big).toBeUndefined();
    expect(cardProc("leave", { leaveAspd: 0.75 }).line).toBe("3초 무적, 공격 속도 +75%");
    expect(cardProc("corpcard", { perk: "이동 속도", perkV: 0.3 }).line).toBe("5초 동안 이동 속도 +30%");
  });

  it("세트 장비·부활 쿠키도 같은 모양", () => {
    expect(sgProc("vacation", ICON)).toMatchObject({ name: "연차", line: "체력 1로 버텼어요", art: { icon: ICON } });
    expect(sgProc("overtimeFour", ICON).name).toBe("야근 세트");
    expect(sgProc("bossLow", ICON).name).toBe("결재 완료");
    expect(cookieProc()).toMatchObject({ name: "부활 쿠키", big: true });
  });

  it("화면 문구: 짧은 해요체, 「라벨: 설명」 콜론과 「A · B」 나열 없이", () => {
    for (const p of all()) {
      for (const t of [p.name, p.line, p.left ?? ""]) {
        expect(t).not.toMatch(/[:·]/);
        expect(t.length).toBeLessThanOrEqual(24);
      }
      expect(p.line).toMatch(/(요|%)$/);
    }
  });
});
