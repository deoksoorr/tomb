import { AudioHost } from "../world/audioHost";

// 별자리 잇기 합성음 (음원 파일 없이, 앱 공용 WebAudio 컨텍스트 — lib/sharedAudio. <audio>는 쓰지 않는다).
// 사냥터 효과음(sfx.ts)과 따로 둔다 (같은 효과음 갈래 = 볼륨·끄기는 audio:mix sfx 버스를 따른다).
// 설계(어떤 음을 언제 얼마나)는 아래 순수 함수(starLinkTones 등)가 Tone 목록으로 내고 시험(starSound.test.ts)이 확인한다. 재생은 StarSfx.
//  - 잇기: 유리 종·첼레스타·글로켄슈필처럼 맑은 종소리. 한 별자리 안에서 이을수록 음계를 따라 올라가 선율이 되고,
//    선율은 별자리마다 정해져 있다 (같은 별자리는 늘 같은 노래). 완벽은 배음이 많고 맑게, 좋아는 부드럽고 짧게
//  - 완성: 은은한 패드 위로 반짝이는 아르페지오가 펼쳐지고 긴 잔향 — "밤하늘이 열리는" 느낌. 희귀·전설일수록 길고 웅장하게, 전설은 합창 같은 화음 겹
//  - 놓침·끊김: 조율이 어긋난 종이 낮게 떨어지며 필터가 닫힌다 (별빛이 꺼지듯) · 너무 일찍: 짧고 탁한 "틱"
// 시각은 초, 음량은 0..1 (볼륨·리미터는 재생 쪽).

export type Tone = {
  /** 시작 (초) */
  at: number;
  /** 음높이 Hz: f0에서 f1로 (길이 동안 지수로) */
  f0: number;
  f1?: number;
  /** 길이 (초, 소리가 사라질 때까지) */
  dur: number;
  /** 최고 음량 */
  gain: number;
  /** 올라가는 시간 (초). 기본 0.004 (종처럼 바로) — 패드·합창은 길게 */
  atk?: number;
  wave?: OscillatorType;
  /** 좌우 -1..1 */
  pan?: number;
  /** 음 어긋남 (cents) */
  det?: number;
  /** 낮은 통과 필터: f0에서 f1로 (별빛이 꺼지듯 닫히는 소리) */
  lp?: readonly [number, number];
  /** 잔향 보냄 0..1 */
  verb?: number;
  /** 떨림 (합창): hz·cents */
  vib?: readonly [number, number];
};

/** 5음 음계 n번째 칸 (한 옥타브 = 5칸) */
const PENTA = [0, 2, 4, 7, 9];
const step = (base: number, n: number) => base * 2 ** ((PENTA[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5)) / 12);

/** 문자열 → 0..2³² (별자리마다 정해진 선율) */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 별자리마다 다른 으뜸음 (C5·D5·E5·G5 중) */
const ROOTS = [523.25, 587.33, 659.25, 783.99];

/**
 * 그 별자리 선율의 idx번째 음 (Hz). 처음부터 끝까지 약 두 옥타브(10칸)를 올라가고, 별자리마다 정해진 꾸밈(한 칸 위로 튐)을 얹는다.
 * 같은 별자리·같은 순서면 늘 같은 음
 */
export function starMelodyHz(conId: string, idx: number, size: number): number {
  const h = hashStr(conId);
  const root = ROOTS[h % ROOTS.length] / 2;
  const rise = Math.round((idx * 10) / Math.max(1, size - 1));
  // 꾸밈: 1비트씩 꺼내 한 칸 위로 튀는 음 (처음·마지막 음은 꾸밈 없이)
  const orn = idx === size - 1 || idx === 0 ? 0 : (h >>> (idx % 31)) & 1;
  return step(root, 5 + rise + orn);
}

/** 별 하나를 이었다: 맑은 종 (완벽 = 유리 종 배음이 많고 길게, 좋아 = 부드럽고 짧게) */
export function starLinkTones(conId: string, idx: number, size: number, perfect: boolean): Tone[] {
  const f = starMelodyHz(conId, idx, size);
  const pan = Math.max(-0.6, Math.min(0.6, (idx / Math.max(1, size - 1)) * 1.2 - 0.6));
  if (!perfect)
    return [
      { at: 0, f0: f, dur: 0.75, gain: 0.12, wave: "triangle", pan, lp: [3200, 1600], verb: 0.2 },
      { at: 0, f0: f * 2, dur: 0.35, gain: 0.03, pan, verb: 0.2 },
    ];
  // 유리 종·글로켄슈필: 기음 + 어긋난 배음(×2.76·×5.4) + 아주 높은 반짝임
  return [
    { at: 0, f0: f, dur: 1.4, gain: 0.13, pan, verb: 0.35 },
    { at: 0, f0: f * 2.76, dur: 0.7, gain: 0.05, pan, verb: 0.35 },
    { at: 0, f0: f * 5.4, dur: 0.3, gain: 0.025, pan, verb: 0.35 },
    { at: 0.02, f0: f * 4, f1: f * 4.02, dur: 0.22, gain: 0.018, pan: -pan, verb: 0.4 },
  ];
}

/**
 * 별자리 완성: 패드(느리게 부풀었다 길게 사라지는 화음) + 반짝이는 아르페지오 + 긴 잔향.
 * rarity 1~5 (희귀·전설일수록 길고 높고 겹이 많다, 전설은 떨리는 합창 화음), fresh = 도감에 처음이면 꼭대기에 반짝 꼬리
 */
export function starCompleteTones(rarity: number, fresh: boolean): Tone[] {
  const big = rarity >= 5 ? 2 : rarity >= 3 ? 1 : 0;
  const root = [392, 440, 523.25][big];
  const len = [2.6, 3.4, 4.6][big];
  const out: Tone[] = [];
  // 패드: 1·5·8도 (+ 희귀부터 10도)
  const pad = [1, 1.5, 2, ...(big ? [2.52] : [])];
  for (const [i, m] of pad.entries())
    out.push({ at: 0, f0: (root / 2) * m, dur: len, gain: 0.045, atk: 0.35, wave: "triangle", pan: i % 2 ? 0.3 : -0.3, lp: [1800, 900], verb: 0.5 });
  // 아르페지오: 5음 음계를 타고 올라간다 (희귀일수록 길게)
  const n = [6, 9, 12][big];
  for (let i = 0; i < n; i++) {
    const f = step(root, 5 + i);
    out.push({ at: 0.08 + i * 0.085, f0: f, dur: 1.1, gain: 0.08 - i * 0.003, pan: (i / (n - 1)) * 1.2 - 0.6, verb: 0.55 });
    out.push({ at: 0.08 + i * 0.085, f0: f * 2.76, dur: 0.4, gain: 0.02, verb: 0.55 });
  }
  // 전설: 합창 같은 화음 겹 (떨리는 목소리 셋이 천천히 들어온다)
  if (big === 2)
    for (const [i, m] of [1, 1.25, 1.5, 2].entries())
      for (const det of [-9, 9])
        out.push({
          at: 0.3 + i * 0.12,
          f0: root * m,
          dur: len - 0.4,
          gain: 0.03,
          atk: 0.6,
          wave: "sawtooth",
          det,
          vib: [5.2, 14],
          lp: [1400, 1000],
          pan: det < 0 ? -0.4 : 0.4,
          verb: 0.6,
        });
  if (fresh) {
    const top = 0.08 + n * 0.085 + 0.1;
    for (let i = 0; i < 3; i++) out.push({ at: top + i * 0.07, f0: step(root * 2, 7 + i * 2), dur: 0.5, gain: 0.035, pan: i % 2 ? 0.5 : -0.5, verb: 0.6 });
  }
  return out;
}

/** 놓침·끊김: 조율이 어긋난 종 둘이 낮게 떨어지며 필터가 닫힌다 (크지 않게) */
export function starMissTones(): Tone[] {
  return [
    { at: 0, f0: 392, f1: 262, dur: 0.7, gain: 0.07, wave: "triangle", lp: [2400, 260], verb: 0.25 },
    { at: 0, f0: 392 * 1.03, f1: 262 * 0.97, dur: 0.7, gain: 0.05, det: 30, lp: [2000, 220], verb: 0.25 },
    { at: 0.03, f0: 196, f1: 147, dur: 0.5, gain: 0.04, lp: [900, 200] },
  ];
}

/** 너무 일찍 눌러 놓침: 짧고 탁한 틱 */
export function starEarlyTones(): Tone[] {
  return [
    { at: 0, f0: 320, f1: 180, dur: 0.05, gain: 0.07, wave: "square", lp: [900, 500] },
    { at: 0, f0: 90, dur: 0.04, gain: 0.05, wave: "triangle" },
  ];
}

/** 별똥별 (아주 작게) */
export function starShootTones(): Tone[] {
  return [{ at: 0, f0: 2600, f1: 1300, dur: 0.45, gain: 0.018, verb: 0.4 }];
}

/** 한 번에 울리는 음 상한 (넘으면 새 소리를 건너뛴다 — 폰에서 가볍게, 찢어지지 않게) */
const MAX_TONES = 56;

type Bus = { input: GainNode; verb: GainNode; nodes: AudioNode[] };

export class StarSfx extends AudioHost {
  private live = 0;
  private chain: Bus | null = null;

  constructor() {
    super("sfx");
  }

  /** 들어온 소리 → 리미터(컴프레서) → 호스트 출력. 잔향 = 되먹임 지연 + 낮은 통과 (가벼운 메아리) */
  private ensureBus(ac: AudioContext): Bus {
    if (this.chain) return this.chain;
    const input = ac.createGain();
    const lim = ac.createDynamicsCompressor();
    lim.threshold.value = -14;
    lim.knee.value = 8;
    lim.ratio.value = 12;
    lim.attack.value = 0.003;
    lim.release.value = 0.2;
    input.connect(lim).connect(this.output);
    const verb = ac.createGain();
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.21;
    const fb = ac.createGain();
    fb.gain.value = 0.48;
    const tone = ac.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    verb.connect(delay).connect(tone).connect(fb).connect(delay);
    tone.connect(input);
    this.chain = { input, verb, nodes: [input, lim, verb, delay, fb, tone] };
    return this.chain;
  }

  private play(list: Tone[]): void {
    const vol = this.busGain();
    if (vol <= 0 || this.hidden || !list.length || this.live + list.length > MAX_TONES) return;
    try {
      const ac = this.audio();
      // 멈춘 컨텍스트에 걸어 두면 깨어날 때 밀린 소리가 한꺼번에 난다 → 건너뛴다
      if (!ac || ac.state !== "running") return;
      const bus = this.ensureBus(ac);
      const t0 = ac.currentTime + 0.005;
      for (const t of list) {
        const at = t0 + t.at;
        const end = at + t.dur;
        const o = ac.createOscillator();
        o.type = t.wave ?? "sine";
        o.frequency.setValueAtTime(t.f0, at);
        if (t.f1 && t.f1 !== t.f0) o.frequency.exponentialRampToValueAtTime(t.f1, end);
        if (t.det) o.detune.value = t.det;
        const made: AudioNode[] = [o];
        if (t.vib) {
          const lfo = ac.createOscillator();
          const depth = ac.createGain();
          lfo.frequency.value = t.vib[0];
          depth.gain.value = t.vib[1];
          lfo.connect(depth).connect(o.detune);
          lfo.start(at);
          lfo.stop(end + 0.05);
          made.push(lfo, depth);
        }
        let node: AudioNode = o;
        if (t.lp) {
          const f = ac.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.setValueAtTime(t.lp[0], at);
          f.frequency.exponentialRampToValueAtTime(t.lp[1], end);
          node.connect(f);
          node = f;
          made.push(f);
        }
        const g = ac.createGain();
        const atk = t.atk ?? 0.004;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, t.gain * vol), at + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        node.connect(g);
        made.push(g);
        let tail: AudioNode = g;
        if (t.pan && typeof ac.createStereoPanner === "function") {
          const p = ac.createStereoPanner();
          p.pan.value = t.pan;
          g.connect(p);
          tail = p;
          made.push(p);
        }
        tail.connect(bus.input);
        if (t.verb) {
          const send = ac.createGain();
          send.gain.value = t.verb * 0.5;
          tail.connect(send).connect(bus.verb);
          made.push(send);
        }
        this.live++;
        o.onended = () => {
          this.live = Math.max(0, this.live - 1);
          for (const n of made)
            try {
              n.disconnect();
            } catch {
              /* 이미 뗐다 */
            }
        };
        o.start(at);
        o.stop(end + 0.02);
      }
    } catch {
      /* 오디오를 못 쓰면 조용히 */
    }
  }

  /** 별 하나를 이었다 (conId·size: 그 별자리 선율, idx: 몇 번째 별) */
  link(conId: string, idx: number, size: number, perfect: boolean): void {
    this.play(starLinkTones(conId, idx, size, perfect));
  }

  /** 별자리 완성: rarity 1~5, fresh = 도감에 처음 */
  complete(rarity: number, fresh: boolean): void {
    this.play(starCompleteTones(rarity, fresh));
  }

  /** 놓침·끊김 */
  miss(): void {
    this.play(starMissTones());
  }

  /** 너무 일찍 눌러 놓침 */
  early(): void {
    this.play(starEarlyTones());
  }

  /** 별똥별 */
  shoot(): void {
    this.play(starShootTones());
  }

  destroy(): void {
    for (const n of this.chain?.nodes ?? [])
      try {
        n.disconnect();
      } catch {
        /* 이미 뗐다 */
      }
    this.chain = null;
    this.closeAudio();
  }
}
