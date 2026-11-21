import type { FilterKind, Layer, Wave } from "../rpg/skillSound";
import type { KillId, PatId } from "./rules";

// 11/20 회장님 독대 합성음 (음원 파일 없이 — 재생은 game/rpg/sfx.ts RpgSfx.synth, 효과음 갈래 음량·끄기를 따른다).
// 기술마다 「시전(예고)」과 「터지는 순간」 두 소리, 즉사 셋, 단계 변신(옷 던지기·쨍그랑·크런치)·지옥 봉인.
// 같은 소리는 CHAIR_SND_GAP 안에 또 나지 않고(sfx.synth gapMs), 보이스 상한은 sfx가 지킨다. 겹쳐도 귀가 아프지 않게 겹마다 0.3 아래.
// 순수 데이터라 브라우저 없이 테스트한다. 시각은 초, 음량 0..1.

const osc = (wave: Wave, at: number, dur: number, f0: number, f1: number, gain: number, x: Partial<Layer> = {}): Layer => ({ src: "osc", wave, at, dur, f0, f1, gain, atk: 0.004, env: "perc", ...x });
const nz = (at: number, dur: number, gain: number, type: FilterKind, f0: number, f1 = f0, q = type === "bandpass" ? 1.2 : 0, x: Partial<Layer> = {}): Layer => ({
  src: "noise",
  at,
  dur,
  gain,
  atk: 0.004,
  env: "perc",
  flt: { type, f0, f1, q },
  ...x,
});
const crk = (at: number, dur: number, gain: number, f0: number, f1 = f0): Layer => ({ src: "crackle", at, dur, gain, atk: 0.002, env: "perc", flt: { type: "highpass", f0, f1, q: 0 } });
const bell = (at: number, hz: number, dur: number, g: number): Layer[] => [
  osc("sine", at, dur, hz, hz, g, { atk: 0.002, verb: 0.4 }),
  osc("sine", at, dur * 0.55, hz * 2.0, hz * 2.0, g * 0.3, { atk: 0.002, verb: 0.3 }),
  osc("sine", at, dur * 0.3, hz * 3.01, hz * 3.01, g * 0.1, { atk: 0.002 }),
];
/** 쿵 (낮은 몸통 + 짧은 잡음) */
const thump = (at: number, hz: number, g: number): Layer[] => [osc("sine", at, 0.28, hz, hz * 0.45, g), nz(at, 0.12, g * 0.6, "lowpass", 900, 200)];
/** 폭발 (잡음 몸통 + 낮은 쿵 + 타닥) */
const blast = (at: number, g: number, low = 70): Layer[] => [nz(at, 0.55, g, "lowpass", 2400, 160), osc("sine", at, 0.45, low, low * 0.5, g * 0.9), crk(at + 0.03, 0.35, g * 0.35, 1500, 600)];

export type ChairSoundEv = `${PatId}:cast` | `${PatId}:hit` | `k-${KillId}:cast` | `k-${KillId}:hit` | "strip" | "glass" | "crunch" | "seal" | "phase" | "siren" | "coffee";

/** 같은 소리가 또 날 수 있는 최소 간격 (ms) — 한꺼번에 터지는 칸·탄이 소리를 수십 번 겹치지 않게 */
export const CHAIR_SND_GAP = 110;

export function chairSound(ev: ChairSoundEv): Layer[] {
  switch (ev) {
    // 도트 찍기: 픽셀 뿅뿅 (네모파 오르는 셋) · 칸이 찍힐 때 톡톡
    case "dot:cast":
      return [osc("square", 0, 0.07, 880, 880, 0.09), osc("square", 0.08, 0.07, 1175, 1175, 0.09), osc("square", 0.16, 0.1, 1568, 1760, 0.09)];
    case "dot:hit":
      return [osc("square", 0, 0.05, 1320, 660, 0.1), nz(0, 0.05, 0.12, "highpass", 3000)];
    // 프로젝트가 터졌다: 도화선 치지직 · 폭발 쾅
    case "projBoom:cast":
      return [crk(0, 0.7, 0.16, 3000, 2000), osc("triangle", 0, 0.12, 300, 520, 0.1)];
    case "projBoom:hit":
      return blast(0, 0.3, 60);
    // 팀이 터졌다: 풍선 부풀기 · 연쇄 팡팡팡
    case "teamBoom:cast":
      return [osc("sine", 0, 0.5, 220, 660, 0.12, { env: "hold", atk: 0.1 }), nz(0, 0.5, 0.05, "bandpass", 800, 2400, 2)];
    case "teamBoom:hit":
      return [0, 0.07, 0.14].flatMap((t, i) => [nz(t, 0.09, 0.2, "bandpass", 1800 - i * 300, 600, 1.5), osc("sine", t, 0.1, 240 - i * 30, 90, 0.14)]);
    // 기획 변경: 종이 촤르륵 · 도장 쾅
    case "planChange:cast":
      return [nz(0, 0.45, 0.14, "bandpass", 2600, 5200, 1.4, { lfo: { hz: 22, cents: 500, on: "filter" } }), nz(0.3, 0.15, 0.08, "highpass", 4200)];
    case "planChange:hit":
      return [...thump(0, 140, 0.24), nz(0, 0.06, 0.14, "bandpass", 1200, 800, 2)];
    // 그거 금방 되죠?: 시계 째깍이 빨라진다 · 돌진 쉭
    case "quick:cast":
      return [0, 0.16, 0.28, 0.37, 0.43].map((t) => osc("square", t, 0.025, 2400, 2000, 0.08));
    case "quick:hit":
      return [nz(0, 0.22, 0.2, "bandpass", 600, 2400, 1.1), ...thump(0.16, 110, 0.18)];
    // 출시일: 달력 넘김 · 쿵
    case "launch:cast":
      return [nz(0, 0.12, 0.1, "bandpass", 3000, 1800, 1.5), nz(0.14, 0.12, 0.1, "bandpass", 3000, 1800, 1.5), ...bell(0.28, 784, 0.4, 0.12)];
    case "launch:hit":
      return thump(0, 90, 0.26);
    // 버그: 벌레 지지직 (빠른 떨림)
    case "bug:cast":
      return [osc("sawtooth", 0, 0.7, 420, 520, 0.08, { env: "hold", atk: 0.05, lfo: { hz: 38, cents: 900, on: "pitch" }, flt: { type: "bandpass", f0: 1500, f1: 1800, q: 2 } }), crk(0, 0.6, 0.1, 2500)];
    case "bug:hit":
      return [crk(0, 0.18, 0.16, 2200), osc("square", 0, 0.1, 900, 300, 0.08)];
    // 긴급 점검: 사이렌 · 번개 쾅
    case "maint:cast":
      return [osc("sawtooth", 0, 0.5, 600, 960, 0.1, { env: "hold", atk: 0.02, flt: { type: "lowpass", f0: 2200, f1: 2200, q: 1 } }), osc("sawtooth", 0.52, 0.5, 600, 960, 0.1, { env: "hold", atk: 0.02, flt: { type: "lowpass", f0: 2200, f1: 2200, q: 1 } })];
    case "maint:hit":
      return [crk(0, 0.3, 0.24, 1800, 700), nz(0, 0.4, 0.2, "lowpass", 3000, 200), osc("sine", 0, 0.35, 70, 40, 0.18)];
    // 핫픽스: 주사 칙 · 전기 지직
    case "hotfix:cast":
      return [nz(0, 0.18, 0.14, "highpass", 5000, 7000), osc("sine", 0.05, 0.25, 1800, 2600, 0.06)];
    case "hotfix:hit":
      return [crk(0, 0.25, 0.22, 2600, 1200), osc("square", 0, 0.2, 140, 90, 0.1, { lfo: { hz: 60, cents: 400, on: "pitch" } })];
    // 확률 공개: 가챠 딸랑 · 캡슐 팡
    case "gacha:cast":
      return [...bell(0, 1568, 0.3, 0.1), ...bell(0.1, 2093, 0.4, 0.1), osc("triangle", 0, 0.3, 300, 200, 0.06, { lfo: { hz: 14, cents: 300, on: "pitch" } })];
    case "gacha:hit":
      return [nz(0, 0.1, 0.2, "bandpass", 2200, 800, 1.4), osc("sine", 0, 0.12, 520, 180, 0.14)];
    // 트럭 시위: 경적 빵빵 · 엔진 부릉 + 쾅
    case "truck:cast":
      return [osc("square", 0, 0.22, 392, 392, 0.08, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 1800, f1: 1800, q: 1 } }), osc("square", 0, 0.22, 494, 494, 0.06, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 1800, f1: 1800, q: 1 } }), osc("square", 0.3, 0.3, 392, 392, 0.08, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 1800, f1: 1800, q: 1 } })];
    case "truck:hit":
      return [osc("sawtooth", 0, 0.6, 55, 90, 0.12, { env: "hold", atk: 0.05, lfo: { hz: 24, cents: 300, on: "pitch" }, flt: { type: "lowpass", f0: 500, f1: 800, q: 2 } }), nz(0, 0.6, 0.08, "lowpass", 700, 400)];
    // 별점 테러: 별 쨍쨍 (높은 종 둘) · 떨어지는 쨍
    case "stars:cast":
      return [...bell(0, 2637, 0.35, 0.08), ...bell(0.12, 3136, 0.4, 0.08), nz(0, 0.5, 0.05, "highpass", 6000)];
    case "stars:hit":
      return [...bell(0, 1760, 0.2, 0.1), nz(0, 0.18, 0.16, "lowpass", 2000, 300)];
    // 빌드 실패: 에러 삑- (낮은 두 음)
    case "buildFail:cast":
      return [osc("square", 0, 0.16, 330, 330, 0.08, { flt: { type: "lowpass", f0: 2000, f1: 2000, q: 1 } }), osc("square", 0.2, 0.3, 220, 220, 0.08, { flt: { type: "lowpass", f0: 2000, f1: 2000, q: 1 } })];
    case "buildFail:hit":
      return [osc("square", 0, 0.12, 180, 140, 0.1), nz(0, 0.1, 0.14, "bandpass", 900, 500, 2)];
    // 그거 내일까지 되죠?: 자명종 따르릉 · 도장 쿵
    case "deadline:cast":
      return [osc("triangle", 0, 0.6, 1800, 1800, 0.08, { env: "hold", atk: 0.01, lfo: { hz: 22, cents: 1200, on: "pitch" } })];
    case "deadline:hit":
      return [...thump(0, 160, 0.16), nz(0, 0.05, 0.1, "bandpass", 1400, 900, 2)];
    // 전사 공지 메일: 메일 수신 띵동 · 파도 쏴아
    case "mail:cast":
      return [...bell(0, 1319, 0.35, 0.12), ...bell(0.14, 1047, 0.45, 0.12)];
    case "mail:hit":
      return [nz(0, 0.9, 0.16, "bandpass", 500, 2200, 0.8, { env: "hold", atk: 0.2 }), nz(0.3, 0.5, 0.08, "highpass", 3000, 5000)];
    // OKR 레이저: 충전 위잉 · 빔 지이잉
    case "okr:cast":
      return [osc("sawtooth", 0, 0.9, 110, 880, 0.08, { env: "hold", atk: 0.2, flt: { type: "lowpass", f0: 600, f1: 4000, q: 4 } }), osc("sine", 0, 0.9, 220, 1760, 0.06, { env: "hold", atk: 0.2 })];
    case "okr:hit":
      return [osc("sawtooth", 0, 0.8, 180, 160, 0.08, { env: "hold", atk: 0.02, lfo: { hz: 9, cents: 80, on: "pitch" }, flt: { type: "bandpass", f0: 1400, f1: 1400, q: 3 } }), nz(0, 0.8, 0.06, "bandpass", 3000, 3000, 3, { env: "hold", atk: 0.02 })];
    // 사무실 이전: 상자 끄는 소리 · 쿵쿵 이삿짐
    case "move:cast":
      return [nz(0, 0.5, 0.14, "bandpass", 500, 350, 2, { lfo: { hz: 16, cents: 500, on: "filter" } })];
    case "move:hit":
      return [...thump(0, 100, 0.22), ...thump(0.18, 80, 0.22), ...thump(0.36, 70, 0.2)];
    // 야근은 집합의 힘이다!: 웅성웅성 · 빨려드는 쉬익 + 굴러가는 쿠르릉
    case "gather:cast":
      return [nz(0, 1.2, 0.12, "bandpass", 500, 700, 3, { env: "hold", atk: 0.3, lfo: { hz: 6, cents: 600, on: "filter" } }), osc("sawtooth", 0, 1.2, 160, 175, 0.04, { env: "hold", atk: 0.3, flt: { type: "lowpass", f0: 700, f1: 700, q: 2 } }), nz(0.6, 0.7, 0.1, "highpass", 6000, 800)];
    case "gather:hit":
      return [nz(0, 0.9, 0.18, "lowpass", 600, 200, 0, { env: "hold", atk: 0.05 }), osc("sine", 0, 0.9, 55, 45, 0.18, { lfo: { hz: 11, cents: 200, on: "pitch" } })];
    // 판 엎자: 책상 들썩 · 뒤집기 쾅
    case "k-flip:cast":
      return [...thump(0, 120, 0.2), ...thump(0.25, 110, 0.2), nz(0.4, 0.5, 0.1, "bandpass", 300, 600, 2)];
    case "k-flip:hit":
      return [...blast(0, 0.2, 50), ...thump(0.08, 70, 0.16)];
    // 프로젝트 드랍: 떨어지는 휘익 · 땅에 닿는 쿵
    // 11/22 책상 쾅 + 기획서 찌익 찢기 + 떨어지는 휘익
    case "k-drop:cast":
      return [...thump(0, 95, 0.28), nz(0.08, 0.32, 0.16, "bandpass", 2400, 5200, 1.6, { lfo: { hz: 34, cents: 700, on: "filter" } }), crk(0.1, 0.3, 0.12, 3500, 2000), osc("sine", 0.3, 0.9, 1400, 140, 0.1, { env: "hold", atk: 0.05 })];
    case "k-drop:hit":
      return [...blast(0, 0.3, 45)];
    // 권고사직: 불길한 낮은 종 둘 · 서명 쾅
    case "k-quit:cast":
      return [...bell(0, 196, 1.6, 0.18), ...bell(0.5, 185, 1.8, 0.16), osc("sawtooth", 0, 1.6, 98, 92, 0.04, { flt: { type: "lowpass", f0: 400, f1: 300, q: 3 } })];
    case "k-quit:hit":
      return [...thump(0, 70, 0.3), ...bell(0, 147, 1.4, 0.14)];
    // 단계 변신: 옷 휙 던지기 · 안경 쨍그랑 · 크런치 경보
    case "strip":
      return [nz(0, 0.25, 0.16, "bandpass", 800, 2600, 1.2), osc("triangle", 0, 0.2, 300, 600, 0.06)];
    case "glass":
      return [...bell(0, 3520, 0.25, 0.08), ...bell(0.03, 4186, 0.3, 0.07), crk(0, 0.35, 0.16, 5000, 3000)];
    case "crunch":
      return [osc("sawtooth", 0, 0.4, 440, 440, 0.08, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 2400, f1: 2400, q: 1 } }), osc("sawtooth", 0.45, 0.4, 440, 440, 0.08, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 2400, f1: 2400, q: 1 } }), ...thump(0.9, 60, 0.24)];
    // 단계 전환 화면: 징 (낮은 쿵 + 길게 우는 금속) · 크런치는 오르내리는 사이렌 두 번
    case "phase":
      return [...thump(0, 90, 0.2), osc("sine", 0, 1.4, 196, 190, 0.14, { atk: 0.003, lfo: { hz: 5, cents: 25, on: "pitch" }, verb: 0.5 }), osc("triangle", 0, 1.0, 392 * 1.47, 392 * 1.45, 0.05, { verb: 0.4 }), nz(0, 0.15, 0.08, "bandpass", 1800, 900, 2)];
    case "siren":
      return [0, 0.6].flatMap((t) => [osc("sawtooth", t, 0.55, 520, 1040, 0.1, { env: "hold", atk: 0.03, flt: { type: "lowpass", f0: 2600, f1: 2600, q: 1 } }), osc("square", t, 0.55, 260, 520, 0.05, { env: "hold", atk: 0.03, flt: { type: "lowpass", f0: 1600, f1: 1600, q: 1 } })]);
    // 11/22 탕비실 커피: 후루룩 + 띵
    case "coffee":
      return [nz(0, 0.35, 0.12, "bandpass", 700, 1600, 2.5, { lfo: { hz: 9, cents: 400, on: "filter" } }), ...bell(0.3, 1319, 0.5, 0.1), ...bell(0.38, 1760, 0.6, 0.08)];
    case "seal":
      return [...thump(0, 150, 0.2), nz(0, 0.08, 0.12, "bandpass", 1600, 900, 2)];
  }
}

/** 소리 이름 전부 (검사용) */
export const CHAIR_SOUND_EVS = (pats: readonly PatId[], kills: readonly KillId[]): ChairSoundEv[] => [
  ...pats.flatMap((p) => [`${p}:cast`, `${p}:hit`] as ChairSoundEv[]),
  ...kills.flatMap((k) => [`k-${k}:cast`, `k-${k}:hit`] as ChairSoundEv[]),
  "strip",
  "glass",
  "crunch",
  "seal",
  "phase",
  "siren",
  "coffee",
];
