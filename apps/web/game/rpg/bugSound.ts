import type { InsectArt } from "./meadowLayout";
import type { FilterKind, Layer, Wave } from "./skillSound";

// 32번 곤충 채집 합성음 설계 (음원 파일 없이 — 재생은 sfx.ts RpgSfx.synth, 공용 WebAudio 컨텍스트).
// skillSound.ts와 같은 겹(Layer) 데이터라 브라우저 없이 테스트한다.
//  - 잡기: 그물 "폭" + 곤충마다 다른 음색 (나비 = 부드러운 퉁김, 잠자리 = 짧은 휘릭 + 퉁김, 반딧불이 = 유리 종).
//    콤보가 이어질수록 5음 음계를 한 칸씩 올라가고, 콤보 단계(0..4)만큼 반짝이 겹이 붙는다
//  - 황금 곤충: 종 아르페지오 + 반짝 쉬익 / 벌: 거친 붕붕 + 내려가는 뿡 / 낙엽: 바스락
//  - 헛치기: 바람 가르는 쉭 / 놓침: 팔랑 날아가는 소리 / 콤보 단계 올라감: 화음 / 준비·시작·끝
// 시각은 초, 음량은 0..1 (볼륨·리미터는 재생 쪽에서).

export type BugSoundEv = "catch" | "golden" | "bee" | "leaf" | "whiff" | "escape" | "tier" | "ready" | "go" | "end";

export type BugSoundOpt = {
  /** 잡은 곤충 그림 (catch) */
  art?: InsectArt;
  /** 지금 콤보 수 (catch: 음 높이) */
  combo?: number;
  /** 콤보 단계 0..4 (catch: 반짝이 겹, tier: 화음 밝기) */
  tier?: number;
};

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
const semi = (hz: number, s: number) => hz * 2 ** (s / 12);
/** 5음 음계 n번째 칸 (한 옥타브 = 5칸) */
const penta = (base: number, n: number) => semi(base, [0, 2, 4, 7, 9][((n % 5) + 5) % 5] + 12 * Math.floor(n / 5));

/** 그물이 덤불을 덮는 "폭" (낮은 잡음 + 짧은 저음) */
const thwump = (at: number, g: number): Layer[] => [nz(at, 0.08, g, "lowpass", 1400, 300, 0), osc("sine", at, 0.09, 180, 90, g * 0.5, { atk: 0.002 })];

/** 반짝이 (높은 사인 몇 개가 위로) */
const sparkle = (at: number, base: number, n: number, g: number): Layer[] =>
  Array.from({ length: n }, (_, i) => {
    const f = penta(base, 5 + i * 2);
    return osc("sine", at + 0.05 + i * 0.045, 0.16, f, f, g * (1 - i * 0.12), { atk: 0.002, pan: i % 2 ? 0.35 : -0.35, verb: 0.25 });
  });

export function bugSound(ev: BugSoundEv, o: BugSoundOpt = {}): Layer[] {
  const tier = Math.max(0, Math.min(4, o.tier ?? 0));
  switch (ev) {
    case "catch": {
      // 콤보마다 한 칸씩 (열 칸 = 두 옥타브에서 다시 처음으로 — 너무 높아지지 않게)
      const step = Math.max(0, (o.combo ?? 1) - 1) % 10;
      const art = o.art ?? "butterfly";
      const out: Layer[] = [...thwump(0, 0.32)];
      if (art === "firefly") {
        const f = penta(880, step);
        out.push(osc("sine", 0.03, 0.42, f, f, 0.24, { atk: 0.002, verb: 0.35 }), osc("sine", 0.03, 0.22, f * 2.76, f * 2.76, 0.08, { atk: 0.002 }));
      } else if (art === "dragonfly") {
        const f = penta(587, step);
        out.push(nz(0, 0.1, 0.12, "bandpass", 1800, 5200, 2.5), osc("triangle", 0.05, 0.22, f, f, 0.26), osc("sine", 0.05, 0.14, f * 2, f * 2, 0.07));
      } else {
        const f = penta(523, step);
        out.push(osc("triangle", 0.03, 0.26, f * 1.02, f, 0.28), osc("sine", 0.03, 0.18, f * 2, f * 2, 0.08));
      }
      out.push(...sparkle(0.02, 1046, tier, 0.07 + tier * 0.012));
      return out;
    }
    case "golden":
      return [
        ...thwump(0, 0.3),
        ...[0, 2, 4, 7].map((s, i) => osc("sine", 0.03 + i * 0.06, 0.5, semi(988, s), semi(988, s), 0.2 - i * 0.02, { atk: 0.002, verb: 0.4, pan: (i - 1.5) * 0.25 })),
        nz(0.05, 0.4, 0.07, "highpass", 6000, 9000, 1, { env: "hold", atk: 0.05 }),
        ...sparkle(0.25, 1318, 2 + Math.min(2, tier), 0.08),
      ];
    case "bee":
      // 거친 붕붕 (떨리는 톱니파) + 실망스러운 뿡
      return [
        osc("sawtooth", 0, 0.32, 210, 190, 0.14, { env: "hold", atk: 0.01, flt: { type: "lowpass", f0: 1600, f1: 900, q: 4 }, lfo: { hz: 28, cents: 90, on: "pitch" } }),
        osc("square", 0.12, 0.22, 220, 140, 0.08, { flt: { type: "lowpass", f0: 900, f1: 400, q: 1 } }),
        nz(0, 0.06, 0.12, "lowpass", 1200, 300, 0),
      ];
    case "leaf":
      // 마른 잎 바스락 (타닥 잡음) + 작은 쿵
      return [
        { src: "crackle", at: 0, dur: 0.22, gain: 0.28, atk: 0.005, env: "perc", flt: { type: "highpass", f0: 1800, f1: 1800, q: 0 } },
        nz(0, 0.16, 0.14, "bandpass", 3000, 1600, 1.4),
        osc("sine", 0.02, 0.12, 160, 110, 0.12),
      ];
    case "whiff":
      // 채가 허공을 가른다
      return [nz(0, 0.16, 0.2, "bandpass", 700, 2600, 2, { atk: 0.05 }), nz(0.04, 0.1, 0.06, "highpass", 3000, 5000, 0)];
    case "escape":
      // 팔랑팔랑 위로 날아간다 (작게)
      return [nz(0, 0.3, 0.06, "bandpass", 900, 2400, 3, { env: "hold", atk: 0.02, lfo: { hz: 14, cents: 400, on: "filter" } }), osc("sine", 0.02, 0.18, 700, 1100, 0.04)];
    case "tier": {
      // 콤보 단계가 오를 때: 단계만큼 높아지는 화음
      const base = semi(523, Math.min(4, Math.max(1, tier)) * 2);
      return [0, 4, 7, 12].map((s, i) => osc("triangle", i * 0.035, 0.45, semi(base, s), semi(base, s), 0.12, { atk: 0.004, verb: 0.3, pan: (i - 1.5) * 0.3 }));
    }
    case "ready":
      return [osc("square", 0, 0.12, 440, 440, 0.07, { flt: { type: "lowpass", f0: 2400, f1: 2400, q: 0 } })];
    case "go":
      return [osc("square", 0, 0.1, 659, 659, 0.08, { flt: { type: "lowpass", f0: 3000, f1: 3000, q: 0 } }), osc("square", 0.09, 0.22, 880, 880, 0.09, { flt: { type: "lowpass", f0: 3000, f1: 3000, q: 0 } })];
    case "end":
      // 끝: 내려오며 맺는 종소리 세 개
      return [0, -3, -7].map((s, i) => osc("sine", i * 0.14, 0.7, semi(784, s), semi(784, s), 0.18, { atk: 0.003, verb: 0.45 }));
  }
}
