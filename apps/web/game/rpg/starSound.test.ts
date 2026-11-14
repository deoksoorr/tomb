import { describe, expect, it } from "vitest";
import { CONSTELLATIONS } from "@/lib/rpg/constellations";
import { starCompleteTones, starEarlyTones, starLinkTones, starMelodyHz, starMissTones, starShootTones, type Tone } from "./starSound";

// 별자리 잇기 소리 설계 (재생 없이 겹 데이터만): 길이 · 음높이 방향 · 성공(완성) vs 실패(끊김) 차이.

const span = (ts: Tone[]) => Math.max(...ts.map((t) => t.at + t.dur));
const loudest = (ts: Tone[]) => Math.max(...ts.map((t) => t.gain));

describe("별자리 소리 설계", () => {
  it("잇기: 별자리 안에서 이을수록 선율이 올라가고, 같은 별자리는 늘 같은 선율 · 별자리마다 다른 선율", () => {
    for (const c of CONSTELLATIONS) {
      const n = c.stars.length;
      const mel = Array.from({ length: n }, (_, i) => starMelodyHz(c.id, i, n));
      expect(mel[n - 1], c.id).toBeGreaterThan(mel[0] * 3); // 약 두 옥타브 오른다
      // 꾸밈은 있어도 네 음 앞보다는 늘 높고, 내려가도 한 칸만 (전체로 오르는 선율)
      for (let i = 4; i < n; i++) expect(mel[i], `${c.id} ${i}`).toBeGreaterThan(mel[i - 4]);
      for (let i = 1; i < n; i++) expect(mel[i], `${c.id} ${i}`).toBeGreaterThan(mel[i - 1] * 0.8);
      expect(Array.from({ length: n }, (_, i) => starMelodyHz(c.id, i, n))).toEqual(mel);
      // 너무 높지 않게 (귀가 아프지 않게)
      expect(Math.max(...mel)).toBeLessThan(4200);
    }
    const tunes = new Set(CONSTELLATIONS.map((c) => Array.from({ length: 10 }, (_, i) => Math.round(starMelodyHz(c.id, i, 10))).join(",")));
    expect(tunes.size).toBeGreaterThan(CONSTELLATIONS.length / 2);
  });

  it("잇기: 완벽은 배음이 더 많고 더 길고 맑게, 좋아는 부드럽게(필터) 짧게", () => {
    const p = starLinkTones("c_gym", 3, 10, true);
    const g = starLinkTones("c_gym", 3, 10, false);
    expect(p.length).toBeGreaterThan(g.length);
    expect(span(p)).toBeGreaterThan(span(g));
    expect(Math.max(...p.map((t) => t.f0))).toBeGreaterThan(Math.max(...g.map((t) => t.f0)));
    expect(g.some((t) => t.lp)).toBe(true);
    expect(p[0].f0).toBeCloseTo(starMelodyHz("c_gym", 3, 10));
    for (const t of [...p, ...g]) expect(t.f1 === undefined || t.f1 >= t.f0 * 0.99).toBe(true); // 내려가지 않는다
  });

  it("완성(성공): 패드 + 올라가는 아르페지오 + 긴 잔향, 희귀·전설일수록 길고 겹이 많고 전설은 떨리는 합창", () => {
    const c1 = starCompleteTones(1, false);
    const c3 = starCompleteTones(3, false);
    const c5 = starCompleteTones(5, false);
    expect(span(c1)).toBeGreaterThan(2);
    expect(span(c3)).toBeGreaterThan(span(c1));
    expect(span(c5)).toBeGreaterThan(span(c3));
    expect(c3.length).toBeGreaterThan(c1.length);
    expect(c5.length).toBeGreaterThan(c3.length);
    // 패드: 천천히 부푼다
    expect(c1.some((t) => (t.atk ?? 0) >= 0.3)).toBe(true);
    // 아르페지오: 종소리(바로 울림)들이 시간 순서대로 점점 높아진다
    const arp = c1.filter((t) => (t.atk ?? 0.004) < 0.01 && t.f0 < 2000 && t.f0 > 300).sort((a, b) => a.at - b.at);
    for (let i = 1; i < arp.length; i++) expect(arp[i].f0).toBeGreaterThan(arp[i - 1].f0);
    // 잔향
    expect(c1.every((t) => (t.verb ?? 0) > 0)).toBe(true);
    // 전설만 떨리는 합창 겹
    expect(c5.some((t) => t.vib)).toBe(true);
    expect(c3.some((t) => t.vib)).toBe(false);
    // 처음 등록이면 꼭대기 반짝 꼬리
    expect(starCompleteTones(1, true).length).toBeGreaterThan(c1.length);
  });

  it("놓침·끊김(실패): 완성과 확실히 다르게 — 짧고, 음이 내려가고, 필터가 닫히고, 크지 않다", () => {
    const m = starMissTones();
    const c = starCompleteTones(1, false);
    for (const t of m) {
      if (t.f1 !== undefined) expect(t.f1).toBeLessThan(t.f0);
      if (t.lp) expect(t.lp[1]).toBeLessThan(t.lp[0]);
    }
    expect(m.filter((t) => t.f1 !== undefined).length).toBeGreaterThanOrEqual(2);
    expect(span(m)).toBeLessThan(1);
    expect(span(m)).toBeLessThan(span(c) / 2);
    expect(loudest(m)).toBeLessThanOrEqual(0.08);
    // 실패는 낮은 음, 성공은 높은 음
    expect(Math.max(...m.map((t) => t.f0))).toBeLessThan(Math.min(...c.filter((t) => !t.atk || t.atk < 0.01).map((t) => t.f0)));
  });

  it("너무 일찍: 짧고 탁한 틱 (0.1초 안, 사각파·필터)", () => {
    const e = starEarlyTones();
    expect(span(e)).toBeLessThan(0.1);
    expect(e.some((t) => t.wave === "square" && t.lp)).toBe(true);
    expect(span(e)).toBeLessThan(span(starMissTones()));
  });

  it("모든 소리: 음량 0..0.2, 길이 양수, 동시 음 수가 상한(56) 안", () => {
    const all = [
      starLinkTones("c_house", 19, 20, true),
      starLinkTones("c_house", 0, 20, false),
      starCompleteTones(5, true),
      starCompleteTones(3, true),
      starMissTones(),
      starEarlyTones(),
      starShootTones(),
    ];
    for (const ts of all) {
      expect(ts.length).toBeLessThanOrEqual(56);
      for (const t of ts) {
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(0.2);
        expect(t.dur).toBeGreaterThan(0);
        expect(t.f0).toBeGreaterThan(20);
      }
    }
    // 전설 완성 + 그 직전 잇기 소리가 겹쳐도 상한 안
    expect(starCompleteTones(5, true).length + starLinkTones("c_house", 19, 20, true).length).toBeLessThanOrEqual(56);
  });
});
