// 11/26 캠핑장 미끄럼 효과음 합성 (파일 없이 WebAudio로 — import 없는 순수 그래프라 OfflineAudioContext로도 그대로 굽는다).
// 눈썰매(겨울·크리스마스): 오를 때 눈 밟는 사각 소리 · 꼭대기에 앉는 폭신한 소리(크리스마스면 작은 썰매 방울) ·
//   내려가는 동안 눈 위를 스치는 「쉬이익」(빠를수록 높고 크게) · 언덕 밑에 멈출 때 눈더미에 「폭」.
// 워터 슬라이드(기본): 사다리 톡톡 · 앉을 때 물 찰방 · 물길 「쏴아」(빠를수록 높고 크게, 물결처럼 일렁) · 풀에 작게 첨벙.
// 크기(v)는 부르는 쪽이 효과음 볼륨·거리까지 곱해서 준다. 일부러 작고 부드럽게 (모닥불 옆에서도 거슬리지 않게).

export type SlideKind = "sled" | "water";
export type SlideCue = "climb" | "sit" | "land";
/** 0..1 난수 (시험·굽기에서는 고정 씨앗) */
export type Rand = () => number;

/** 잡음 한 장 (sec초, 하얀 잡음) */
export function makeNoise(ac: BaseAudioContext, sec: number, rand: Rand = Math.random): AudioBuffer {
  const n = Math.max(1, Math.floor(ac.sampleRate * sec));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1;
  return buf;
}

/** 끝나면 이어 붙인 노드를 모두 뗀다 */
function release(last: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  last.addEventListener(
    "ended",
    () => {
      for (const n of [last, ...nodes]) {
        try {
          n.disconnect();
        } catch {
          // 이미 뗐다
        }
      }
    },
    { once: true },
  );
}

type Ctx = { ac: BaseAudioContext; dest: AudioNode; noise: AudioBuffer; rand: Rand };

/** 걸러낸 잡음 한 번 (at초부터 len초) */
function noiseHit(c: Ctx, at: number, len: number, v: number, filter: { type: BiquadFilterType; from: number; to: number; q?: number }, attack = 0.006): void {
  const { ac } = c;
  const src = ac.createBufferSource();
  src.buffer = c.noise;
  const f = ac.createBiquadFilter();
  f.type = filter.type;
  f.Q.value = filter.q ?? 0.8;
  f.frequency.setValueAtTime(filter.from, at);
  f.frequency.exponentialRampToValueAtTime(filter.to, at + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(v, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, at + len);
  src.connect(f).connect(g).connect(c.dest);
  const off = c.rand() * Math.max(0, c.noise.duration - len - 0.05);
  src.start(at, off);
  src.stop(at + len + 0.03);
  release(src, f, g);
}

/** 사인 한 번 (from→to Hz) */
function tone(c: Ctx, at: number, len: number, v: number, from: number, to: number, type: OscillatorType = "sine", attack = 0.006): void {
  const { ac } = c;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(v, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, at + len);
  o.connect(g).connect(c.dest);
  o.start(at);
  o.stop(at + len + 0.03);
  release(o, g);
}

/** 오르는 동안 발소리가 나는 때 (탄 뒤 초 — 사다리·언덕 오르기 1.1초 안) */
export const CLIMB_STEPS: readonly number[] = [0.12, 0.47, 0.82];

/**
 * 한 번 소리 (오르기·앉기·내려서기). t = 시작 시각(ac 초), v = 크기 0..1 (볼륨·거리를 곱한 값).
 * 가장 긴 소리가 끝나는 때까지의 길이(초)를 돌려준다 (굽기용).
 */
export function playSlideCue(ac: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, kind: SlideKind, cue: SlideCue, t: number, v: number, bells = false, rand: Rand = Math.random): number {
  if (v <= 0.0005) return 0;
  const c: Ctx = { ac, dest, noise, rand };
  if (kind === "sled") {
    if (cue === "climb") {
      // 눈 밟는 사각 소리 셋 (낮게 뭉개진 잡음 + 위쪽 아주 작은 바스락)
      for (const at of CLIMB_STEPS) {
        const s = t + at + (rand() - 0.5) * 0.03;
        noiseHit(c, s, 0.11, v * 0.2, { type: "lowpass", from: 1500 + rand() * 300, to: 380 });
        noiseHit(c, s + 0.012, 0.06, v * 0.05, { type: "highpass", from: 3600, to: 2800 });
      }
      return CLIMB_STEPS[CLIMB_STEPS.length - 1] + 0.16;
    }
    if (cue === "sit") {
      // 썰매에 폭 앉는 소리: 낮고 둥근 「툭」 + 눈 사각
      tone(c, t, 0.16, v * 0.2, 150, 85);
      noiseHit(c, t + 0.005, 0.14, v * 0.1, { type: "lowpass", from: 1100, to: 300 });
      if (!bells) return 0.2;
      // 크리스마스: 썰매 방울 몇 알 (아주 작게, 높은 사인 두 겹이 빨리 사라진다)
      const base = 2350;
      for (let i = 0; i < 4; i++) {
        const at = t + 0.05 + i * 0.055 + rand() * 0.02;
        const hz = base * (1 + (rand() - 0.5) * 0.08);
        tone(c, at, 0.22, v * 0.035, hz, hz * 0.985, "sine", 0.002);
        tone(c, at, 0.12, v * 0.018, hz * 2.71, hz * 2.68, "sine", 0.002);
      }
      return 0.5;
    }
    // 언덕 밑에 멈춤: 눈더미에 폭 (둔한 사인 + 부드러운 눈가루 잡음, 높은 소리는 깎는다)
    tone(c, t, 0.22, v * 0.26, 118, 52);
    noiseHit(c, t, 0.34, v * 0.2, { type: "lowpass", from: 1300, to: 240 }, 0.012);
    noiseHit(c, t + 0.05, 0.16, v * 0.04, { type: "bandpass", from: 2600, to: 1800, q: 1.2 }, 0.01);
    return 0.4;
  }
  // ── 워터 슬라이드 ──
  if (cue === "climb") {
    // 사다리 톡톡 (짧고 둥근 소리 셋)
    for (const at of CLIMB_STEPS) {
      const s = t + at + (rand() - 0.5) * 0.03;
      tone(c, s, 0.07, v * 0.07, 520 + rand() * 60, 380);
      noiseHit(c, s, 0.03, v * 0.04, { type: "bandpass", from: 1800, to: 1200, q: 1.5 }, 0.002);
    }
    return CLIMB_STEPS[CLIMB_STEPS.length - 1] + 0.1;
  }
  if (cue === "sit") {
    // 물 흐르는 미끄럼에 앉는 찰방
    noiseHit(c, t, 0.16, v * 0.16, { type: "bandpass", from: 1400, to: 700, q: 1.1 }, 0.008);
    tone(c, t + 0.04, 0.07, v * 0.04, 760, 1300);
    return 0.2;
  }
  // 풀에 작게 첨벙 (걸러낸 잡음 + 물방울 몇 개)
  noiseHit(c, t, 0.38, v * 0.3, { type: "bandpass", from: 1700, to: 450, q: 0.9 }, 0.012);
  for (let i = 0; i < 3; i++) {
    const at = t + 0.11 + i * 0.07 + rand() * 0.04;
    tone(c, at, 0.08, v * 0.06, 700 + rand() * 400, 1400 + rand() * 600, "sine", 0.004);
  }
  return 0.45;
}

/** 내려가는 소리 (루프 한 가닥) — set()을 매 프레임 불러 크기·빠르기를 따라가게, 끝나면 stop() */
export type SlideRunVoice = {
  /** level 0..1 (볼륨·거리 곱한 크기, 0이면 잦아든다), speed 0..1 (빠를수록 높고 크게), t = ac 시각 */
  set(level: number, speed: number, t: number): void;
  /** 잦아들며 멈춘다 (fadeSec 뒤 발진·잡음을 멈추고 뗀다) */
  stop(t: number, fadeSec?: number): void;
};

/** 루프 소리 크기 (level·speed → 최종 게인). 순수 함수 */
export function runGain(kind: SlideKind, level: number, speed: number): number {
  const l = Math.max(0, Math.min(1, level));
  const s = Math.max(0, Math.min(1, speed));
  return l * (0.3 + 0.7 * s) * (kind === "sled" ? 0.17 : 0.2);
}

/** 루프 필터 가운데 주파수 (빠를수록 높게) */
export function runFreq(kind: SlideKind, speed: number): number {
  const s = Math.max(0, Math.min(1, speed));
  return kind === "sled" ? 850 + s * 1500 : 480 + s * 820;
}

/** set()이 이만큼 안 오면 루프가 스스로 잦아든다 (초) */
export const RUN_HOLD_SEC = 0.35;

export function startSlideRun(ac: BaseAudioContext, dest: AudioNode, noise: AudioBuffer, kind: SlideKind, t: number): SlideRunVoice {
  const out = ac.createGain();
  // 바탕값을 0으로 (예약 값이 아니라 — set()의 cancelScheduledValues가 지워도 1에서 시작해 「틱」 하지 않게)
  out.gain.value = 0;
  out.connect(dest);
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = kind === "sled" ? 0.7 : 1.3;
  bp.frequency.setValueAtTime(runFreq(kind, 0), t);
  // 높은 쉿 소리를 깎아 부드럽게
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = kind === "sled" ? 4200 : 2600;
  // 결: 눈썰매는 빠른 떨림(눈 알갱이 긁힘)을 크기에, 물은 느린 일렁임을 필터 주파수에
  const grain = ac.createGain();
  grain.gain.value = kind === "sled" ? 0.8 : 1;
  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = kind === "sled" ? 11 : 4.2;
  const depth = ac.createGain();
  depth.gain.value = kind === "sled" ? 0.2 : 170;
  lfo.connect(depth).connect(kind === "sled" ? grain.gain : bp.frequency);
  src.connect(bp).connect(lp).connect(grain).connect(out);
  // 눈썰매: 아래쪽 묵직한 「우웅」 한 겹 (썰매 바닥이 눈을 누르는 무게)
  let rumble: { f: BiquadFilterNode; g: GainNode } | null = null;
  if (kind === "sled") {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    const g = ac.createGain();
    g.gain.value = 0.55;
    src.connect(f).connect(g).connect(out);
    rumble = { f, g };
  }
  src.start(t, 0);
  lfo.start(t);
  let stopped = false;
  return {
    set(level, speed, at) {
      if (stopped) return;
      // 프레임이 끊기면(탭이 뒤로 가 게임이 멈춤 등) 스스로 잦아들게: 0.35초 뒤 0으로 가는 예약을 매번 새로 건다
      out.gain.cancelScheduledValues(at);
      out.gain.setTargetAtTime(runGain(kind, level, speed), at, 0.06);
      out.gain.setTargetAtTime(0, at + RUN_HOLD_SEC, 0.05);
      bp.frequency.setTargetAtTime(runFreq(kind, speed), at, 0.08);
      if (kind === "sled") lfo.frequency.setTargetAtTime(9 + speed * 7, at, 0.1);
    },
    stop(at, fadeSec = 0.12) {
      if (stopped) return;
      stopped = true;
      out.gain.cancelScheduledValues(at);
      out.gain.setTargetAtTime(0, at, Math.max(0.01, fadeSec / 3));
      const end = at + Math.max(0.02, fadeSec) + 0.02;
      try {
        src.stop(end);
        lfo.stop(end);
      } catch {
        // 이미 멈췄다
      }
      const nodes: AudioNode[] = [bp, lp, grain, depth, out];
      if (rumble) nodes.push(rumble.f, rumble.g);
      release(src, ...nodes);
      release(lfo);
    },
  };
}
