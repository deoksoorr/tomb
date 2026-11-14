import type { LootLook } from "./lootLook";
import type { FilterKind, Layer, Wave } from "./skillSound";

// 사냥터 바닥 드롭 합성음 설계 (음원 파일 없이 — 재생은 sfx.ts RpgSfx.synth, 공용 WebAudio 컨텍스트).
// skillSound·bugSound와 같은 겹(Layer) 데이터라 브라우저 없이 테스트한다.
//  - pop: 몬스터 자리에서 튀어 오를 때 짧은 "뿅" (모든 등급 같은 결, 높은 등급은 조금 낮고 굵게)
//  - land: 바닥에 닿는 순간. 등급이 높을수록 겹이 많고 길고 깊다
//      plain(물약·일반) = 작은 "톡" / fine(고급) = 맑은 두 음 / rare(희귀) = 낮은 쿵 + 오르는 세 음 + 반짝 쉬익
//      legend(전설) = 깊은 울림 + 오르는 다섯 음 + 오래 남는 종 화음 + 긴 반짝임 / gift(꾸미기) = 리본 풀리는 오르내림 + 종
//  - pick: 캐릭터에게 빨려 들어올 때 오르는 짧은 음 (등급마다 높이·겹)
// 시각은 초, 음량은 0..1 (볼륨·리미터는 재생 쪽에서).

export type LootSoundEv = "pop" | "land" | "pick";

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

/** 종: 기음 + 맑은 배음 두 개 (금속이 아닌 유리 쪽 결) */
const bell = (at: number, hz: number, dur: number, g: number, pan = 0): Layer[] => [
  osc("sine", at, dur, hz, hz, g, { atk: 0.002, verb: 0.45, pan }),
  osc("sine", at, dur * 0.6, hz * 2.0, hz * 2.0, g * 0.32, { atk: 0.002, verb: 0.4, pan }),
  osc("sine", at, dur * 0.35, hz * 3.01, hz * 3.01, g * 0.12, { atk: 0.002, pan }),
];

/** 반짝임: 높은 음 몇 개가 좌우로 흩어진다 */
const glints = (at: number, base: number, n: number, g: number): Layer[] =>
  Array.from({ length: n }, (_, i) => {
    const f = semi(base, [0, 4, 7, 12, 16, 19][i % 6]);
    return osc("sine", at + i * 0.05, 0.18, f, f, g * (1 - i * 0.08), { atk: 0.002, pan: i % 2 ? 0.4 : -0.4, verb: 0.3 });
  });

export function lootSound(ev: LootSoundEv, sound: LootLook["sound"]): Layer[] {
  const t = { plain: 0, fine: 1, rare: 2, gift: 2, legend: 3 }[sound];
  switch (ev) {
    case "pop":
      // 튀어 오름: 위로 휘는 짧은 사인 + 바람 소리 (높은 등급은 한 옥타브 아래를 겹친다)
      return [
        osc("sine", 0, 0.12, 420 - t * 40, 980 - t * 80, 0.12, { atk: 0.003 }),
        nz(0, 0.12, 0.05 + t * 0.012, "bandpass", 900, 2600, 1.6, { atk: 0.02 }),
        ...(t >= 2 ? [osc("triangle", 0, 0.16, 210, 490, 0.08, { atk: 0.004 })] : []),
      ];
    case "pick": {
      // 빨려 들어옴: 짧게 오르는 두 음 (등급이 높을수록 높고 반짝 겹이 붙는다)
      const f = semi(988, t * 2);
      return [osc("triangle", 0, 0.08, f, f * 1.06, 0.12), osc("triangle", 0.06, 0.14, semi(f, 7), semi(f, 7), 0.11, { verb: 0.2 }), ...glints(0.1, semi(f, 12), t, 0.05)];
    }
    case "land":
      switch (sound) {
        case "plain":
          // 작은 "톡" (바닥에 닿는 나무·유리 사이 결)
          return [osc("sine", 0, 0.09, 920, 640, 0.16, { atk: 0.002 }), nz(0, 0.04, 0.08, "highpass", 3000, 3000, 0)];
        case "fine":
          // 맑은 두 음 (5도) + 작은 톡
          return [nz(0, 0.05, 0.08, "highpass", 2600, 2600, 0), ...bell(0.02, 1318, 0.5, 0.15, -0.2), ...bell(0.12, semi(1318, 7), 0.6, 0.13, 0.2)];
        case "rare":
          // 낮은 쿵 + 오르는 세 음 + 반짝 쉬익
          return [
            osc("sine", 0, 0.22, 150, 70, 0.26, { atk: 0.003 }),
            nz(0, 0.1, 0.12, "lowpass", 1400, 300, 0),
            ...[0, 4, 7].flatMap((s, i) => bell(0.05 + i * 0.07, semi(880, s), 0.7 - i * 0.05, 0.14, (i - 1) * 0.3)),
            nz(0.12, 0.55, 0.06, "highpass", 5000, 9000, 1, { env: "hold", atk: 0.06, verb: 0.3 }),
            ...glints(0.3, 1760, 3, 0.06),
          ];
        case "gift":
          // 리본이 풀리듯 오르내리는 음 + 종 하나 (꾸미기 선물)
          return [
            osc("sine", 0, 0.18, 160, 80, 0.2, { atk: 0.003 }),
            ...[0, 4, 9, 4, 12].map((s, i) => osc("triangle", 0.04 + i * 0.06, 0.2, semi(784, s), semi(784, s), 0.13, { atk: 0.003, verb: 0.3, pan: (i - 2) * 0.2 })),
            ...bell(0.36, semi(784, 16), 0.8, 0.14),
            ...glints(0.4, 2093, 3, 0.05),
          ];
        case "legend":
          // 깊은 울림 + 오르는 다섯 음 + 오래 남는 종 화음 + 긴 반짝임
          return [
            osc("sine", 0, 0.6, 110, 42, 0.34, { atk: 0.004 }),
            osc("triangle", 0, 0.3, 220, 90, 0.12, { atk: 0.004 }),
            nz(0, 0.25, 0.16, "lowpass", 1800, 200, 0),
            ...[0, 2, 4, 7, 12].map((s, i) => osc("triangle", 0.08 + i * 0.065, 0.24, semi(659, s), semi(659, s), 0.14, { atk: 0.003, verb: 0.35, pan: (i - 2) * 0.22 })),
            ...[0, 4, 7].flatMap((s, i) => bell(0.42, semi(659, 12 + s), 1.5, 0.11, (i - 1) * 0.35)),
            nz(0.38, 1.3, 0.07, "highpass", 6000, 10000, 1, { env: "hold", atk: 0.12, verb: 0.5, lfo: { hz: 7, cents: 300, on: "filter" } }),
            ...glints(0.6, 2637, 5, 0.06),
          ];
      }
  }
}
