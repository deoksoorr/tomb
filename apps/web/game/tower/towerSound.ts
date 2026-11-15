import type { FilterKind, Layer, Wave } from "../rpg/skillSound";

// 11/15 야근 빌딩 합성음 (음원 파일 없이 — 재생은 sfx.ts RpgSfx.synth, 공용 WebAudio 컨텍스트).
// 엘리베이터(문 미끄러짐·웅 소리·띵 — 우두머리 층은 낮은 두 음)와 지하 서버실(경보·전기·와이파이·재부팅·용지 걸림·지글).
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
const bell = (at: number, hz: number, dur: number, g: number): Layer[] => [
  osc("sine", at, dur, hz, hz, g, { atk: 0.002, verb: 0.5 }),
  osc("sine", at, dur * 0.55, hz * 2.0, hz * 2.0, g * 0.3, { atk: 0.002, verb: 0.4 }),
  osc("sine", at, dur * 0.3, hz * 3.01, hz * 3.01, g * 0.1, { atk: 0.002 }),
];

export type TowerSoundEv =
  | "door"
  | "hum"
  | "ding"
  | "dingBoss"
  | "tickFloor"
  | "siren"
  | "zap"
  | "wifi"
  | "reboot"
  | "rebootDone"
  | "jam"
  | "sizzle"
  | "restore"
  | "clone"
  | "alarm"
  | "grab";

export function towerSound(ev: TowerSoundEv): Layer[] {
  switch (ev) {
    // 문이 미끄러진다: 낮은 고무 바퀴 구름 + 금속 스침, 끝에 툭
    case "door":
      return [nz(0, 0.38, 0.22, "bandpass", 420, 260, 1.4, { env: "hold", atk: 0.05 }), nz(0, 0.32, 0.08, "highpass", 3200, 2400), osc("triangle", 0.34, 0.08, 90, 60, 0.25)];
    // 올라가는 웅 소리 (낮은 윙 + 바람)
    case "hum":
      return [
        osc("sawtooth", 0, 0.9, 58, 70, 0.1, { env: "hold", atk: 0.15, flt: { type: "lowpass", f0: 220, f1: 320, q: 2 } }),
        osc("sine", 0, 0.9, 116, 140, 0.1, { env: "hold", atk: 0.12 }),
        nz(0, 0.9, 0.05, "lowpass", 500, 700, 0, { env: "hold", atk: 0.2 }),
      ];
    case "ding":
      return bell(0, 1318.5, 1.2, 0.36);
    // 우두머리 층: 낮고 어두운 두 음 (단3도 아래로)
    case "dingBoss":
      return [...bell(0, 659.3, 1.1, 0.34), ...bell(0.22, 523.3, 1.4, 0.34), osc("sawtooth", 0.22, 0.6, 130.8, 123, 0.08, { flt: { type: "lowpass", f0: 600, f1: 300, q: 3 } })];
    // 층 숫자가 넘어갈 때 딸깍
    case "tickFloor":
      return [osc("square", 0, 0.03, 1800, 1500, 0.08), nz(0, 0.025, 0.06, "highpass", 4000)];
    // 냉각 실패 경보: 오르내리는 사이렌 두 번
    case "siren":
      return [osc("sawtooth", 0, 0.45, 620, 980, 0.12, { env: "hold", atk: 0.02, flt: { type: "lowpass", f0: 2400, f1: 2400, q: 1 } }), osc("sawtooth", 0.5, 0.45, 620, 980, 0.12, { env: "hold", atk: 0.02, flt: { type: "lowpass", f0: 2400, f1: 2400, q: 1 } })];
    // 전기: 지지직
    case "zap":
      return [{ src: "crackle", at: 0, dur: 0.35, gain: 0.35, atk: 0.002, env: "perc", flt: { type: "highpass", f0: 1800, f1: 900, q: 0 } }, osc("square", 0, 0.25, 120, 80, 0.12, { lfo: { hz: 50, cents: 300, on: "pitch" } })];
    case "wifi":
      return [osc("sine", 0, 0.08, 2200, 2200, 0.12), osc("sine", 0.1, 0.08, 2800, 2800, 0.12), osc("sine", 0.2, 0.25, 3300, 1800, 0.1)];
    // 재부팅: 내려가는 전원 꺼짐
    case "reboot":
      return [osc("triangle", 0, 0.5, 880, 110, 0.18), nz(0, 0.3, 0.06, "lowpass", 1200, 200)];
    // 재부팅 완료: 시동음 세 음
    case "rebootDone":
      return [osc("square", 0, 0.1, 523, 523, 0.08), osc("square", 0.1, 0.1, 659, 659, 0.08), osc("square", 0.2, 0.22, 784, 784, 0.09)];
    // 용지 걸림: 드르륵
    case "jam":
      return [nz(0, 0.4, 0.2, "bandpass", 900, 700, 3, { lfo: { hz: 28, cents: 600, on: "filter" } }), osc("square", 0.38, 0.06, 1400, 1400, 0.08)];
    case "sizzle":
      return [{ src: "crackle", at: 0, dur: 0.25, gain: 0.18, atk: 0.01, env: "perc", flt: { type: "highpass", f0: 2600, f1: 2200, q: 0 } }];
    // 백업 복원: 감기는 테이프 + 오르는 음
    case "restore":
      return [nz(0, 0.6, 0.1, "bandpass", 300, 2400, 4, { env: "swell", atk: 0.4 }), osc("sine", 0.1, 0.5, 220, 880, 0.12, { verb: 0.3 })];
    case "clone":
      return [osc("square", 0, 0.05, 1200, 1200, 0.07), osc("square", 0.07, 0.05, 1600, 1600, 0.07)];
    // 보안 카메라 들킴: 높은 삐삐삐
    case "alarm":
      return [0, 0.12, 0.24].map((t) => osc("square", t, 0.08, 1760, 1760, 0.08));
    case "grab":
      return [osc("triangle", 0, 0.18, 300, 140, 0.18), nz(0, 0.12, 0.08, "bandpass", 1500, 600, 2)];
  }
}
