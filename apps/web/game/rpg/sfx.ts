import { audioLife } from "@/lib/audioLife";
import type { SkillId } from "@/lib/rpg/skillTree";
import { playBuffer, preloadSound, releaseOnEnd, sharedAudioContext, soundMissing } from "@/lib/sharedAudio";
import { busGain, loadSoundMix } from "@/lib/soundMix";
import { bridge } from "../bridge";
import { AudioHost } from "../world/audioHost";
import { fillCrackle, fillImpulse, fillNoise, limitCurve, skillSound, type Layer, type SoundEv, type SoundOpt } from "./skillSound";

// 사냥터 효과음. Phaser 오디오는 꺼 두었으므로 공용 WebAudio 컨텍스트에 미리 디코딩한 버퍼로 낸다 (game/world/Sfx.ts와 같은 방식,
// 아이폰 홈 화면 앱에서 <audio>를 매번 재생하면 '지금 재생 중'이 깜빡이며 버벅인다 — lib/sharedAudio).
// 파일이 아직 없거나 재생이 막히면 조용히 넘어가고, 13번: 볼륨·끄기는 효과음 갈래(audio:mix sfx 버스)를 따른다.

export type RpgSound =
  | "hit"
  | "crit"
  | "monster-die"
  | "levelup"
  | "potion"
  | "skill"
  | "coin-drop"
  | "defeat"
  | "victory"
  | "tick"
  | "miss"
  // 2·16·40번 사냥 손맛: 처치, 무기마다 공격 소리, 몬스터 경고·내려찍기, 우두머리 단계
  | "kill"
  | "swish"
  | "thud"
  | "stab"
  | "clack"
  | "twang"
  | "flick"
  | "ink"
  | "warn"
  | "slam"
  | "roar";

const NAMES: RpgSound[] = [
  "hit",
  "crit",
  "monster-die",
  "levelup",
  "potion",
  "skill",
  "coin-drop",
  "defeat",
  "victory",
  "tick",
  "miss",
  "kill",
  "swish",
  "thud",
  "stab",
  "clack",
  "twang",
  "flick",
  "ink",
  "warn",
  "slam",
  "roar",
];
const MAX_VOICES = 8;
/** 스킬 합성음 동시 보이스 상한 (넘으면 오래된 것부터 줄인다) */
const MAX_SKILL_VOICES = 10;

type Voice = { dry: GainNode; wet: GainNode; srcs: AudioScheduledSourceNode[]; end: number };
type SkillBus = { input: GainNode; verbIn: GainNode; nodes: AudioNode[] };
type Bank = { noise: AudioBuffer; crackle: AudioBuffer; ir: AudioBuffer; curve: Float32Array<ArrayBuffer> };

// 잡음·타닥·잔향 버퍼와 리미터 곡선은 컨텍스트마다 한 번만 만들어 재사용한다
const banks = new WeakMap<BaseAudioContext, Bank>();
function bank(ac: BaseAudioContext): Bank {
  const known = banks.get(ac);
  if (known) return known;
  const sr = ac.sampleRate;
  const noise = ac.createBuffer(1, Math.floor(sr * 2), sr);
  fillNoise(noise.getChannelData(0), Math.random);
  const crackle = ac.createBuffer(1, Math.floor(sr * 2), sr);
  fillCrackle(crackle.getChannelData(0), sr, Math.random);
  const ir = ac.createBuffer(2, Math.floor(sr * 2.2), sr);
  fillImpulse([ir.getChannelData(0), ir.getChannelData(1)], sr, Math.random, 2.2);
  const b: Bank = { noise, crackle, ir, curve: limitCurve() };
  banks.set(ac, b);
  return b;
}

/** 보이스를 50ms 만에 줄여 끈다 (보이스 상한·씬 정리) */
function fadeVoice(v: Voice, t: number): void {
  for (const g of [v.dry, v.wet]) {
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.05);
    } catch {
      // 이미 뗐다
    }
  }
  for (const s of v.srcs) {
    try {
      s.stop(t + 0.06);
    } catch {
      // 이미 멈췄다
    }
  }
}

/** 겹 하나 → 소스(오실레이터·잡음) → 필터 → 엔벨로프 게인 → 좌우 → 보이스 (+ 잔향 보냄). 끝나면 노드를 뗀다 */
function layerNode(ac: AudioContext, bk: Bank, l: Layer, t0: number, dry: AudioNode, wet: AudioNode): AudioScheduledSourceNode | null {
  const t = t0 + l.at;
  const dur = Math.max(0.02, l.dur);
  const end = t + dur;
  const made: AudioNode[] = [];
  let src: AudioScheduledSourceNode;
  let buf: AudioBufferSourceNode | null = null;
  let pitch: AudioParam | null = null;
  if (l.src === "osc") {
    const o = ac.createOscillator();
    o.type = l.wave ?? "sine";
    const f0 = l.f0 ?? 440;
    const f1 = l.f1 ?? f0;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(dur, l.glide ?? dur));
    if (l.det) o.detune.value = l.det;
    pitch = o.detune;
    src = o;
  } else {
    const s = ac.createBufferSource();
    s.buffer = l.src === "noise" ? bk.noise : bk.crackle;
    s.loop = true;
    src = buf = s;
  }
  let head: AudioNode = src;
  let fdet: AudioParam | null = null;
  if (l.flt) {
    const f = ac.createBiquadFilter();
    f.type = l.flt.type;
    f.Q.value = l.flt.q;
    f.frequency.setValueAtTime(l.flt.f0, t);
    if (l.flt.f1 !== l.flt.f0) f.frequency.exponentialRampToValueAtTime(l.flt.f1, end);
    head.connect(f);
    head = f;
    fdet = f.detune;
    made.push(f);
  }
  // 엔벨로프 (skillSound.Env와 같은 모양 — 테스트 렌더도 같은 식)
  const env = ac.createGain();
  const g = env.gain;
  const pk = Math.max(0.0002, l.gain);
  const atk = Math.min(dur * 0.9, Math.max(0.001, l.atk));
  g.setValueAtTime(0.0001, t);
  if (l.env === "swell") {
    g.exponentialRampToValueAtTime(pk, t + dur * 0.92);
    g.linearRampToValueAtTime(0.0001, end);
  } else {
    g.linearRampToValueAtTime(pk, t + atk);
    if (l.env === "hold") g.setValueAtTime(pk, t + Math.max(atk, dur * 0.6));
    g.exponentialRampToValueAtTime(0.0001, end);
  }
  head.connect(env);
  made.push(env);
  let out: AudioNode = env;
  if (l.pan && typeof ac.createStereoPanner === "function") {
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, l.pan));
    env.connect(p);
    out = p;
    made.push(p);
  }
  out.connect(dry);
  if (l.verb && l.verb > 0) {
    const sg = ac.createGain();
    sg.gain.value = l.verb;
    out.connect(sg).connect(wet);
    made.push(sg);
  }
  // 떨림 (음높이 또는 필터를 cents만큼)
  const target = l.lfo ? (l.lfo.on === "pitch" ? (pitch ?? fdet) : (fdet ?? pitch)) : null;
  let lfo: OscillatorNode | null = null;
  if (l.lfo && target) {
    lfo = ac.createOscillator();
    lfo.frequency.value = l.lfo.hz;
    const lg = ac.createGain();
    lg.gain.value = l.lfo.cents;
    lfo.connect(lg).connect(target);
    made.push(lg);
    lfo.start(t);
    lfo.stop(end + 0.02);
    releaseOnEnd(lfo);
  }
  // 잡음은 같은 버퍼의 아무 데서나 시작한다 (매번 다른 결)
  if (buf) buf.start(t, Math.random() * 1.5);
  else src.start(t);
  src.stop(end + 0.02);
  releaseOnEnd(src, ...made);
  return src;
}

const url = (name: RpgSound) => `/sfx/${name}.mp3`;

export class RpgSfx extends AudioHost {
  private voices = 0;
  /** 스킬 합성음 보이스 (오래된 순) · 버스 · 같은 소리 마지막 시각 */
  private voices2: Voice[] = [];
  private bus2: SkillBus | null = null;
  private readonly lastSkill = new Map<string, number>();

  constructor() {
    super("sfx");
    for (const name of NAMES) void preloadSound(url(name));
  }

  play(name: RpgSound, gain = 1): void {
    const vol = this.busGain();
    if (vol <= 0 || this.hidden || soundMissing(url(name)) || this.voices >= MAX_VOICES) return;
    const ac = this.audio();
    if (!ac) return;
    const started = playBuffer(ac, this.output, url(name), {
      gain: Math.max(0, Math.min(1, vol * gain)),
      onEnded: () => {
        this.voices = Math.max(0, this.voices - 1);
      },
    });
    if (started) this.voices++;
  }

  /**
   * 은은한 종소리 (별자리 잇기). 파일 없이 WebAudio로 합성한다: 펜타토닉 음계의 사인파 + 한 옥타브 위 약한 배음, 천천히 사라진다.
   * degree: 음계 단계 (별 순서), bright: 완벽 판정이면 조금 더 밝게
   */
  chime(degree: number, bright = false): void {
    const vol = this.busGain();
    if (vol <= 0) return;
    try {
      const ctx = this.audio();
      if (!ctx) return;
      const scale = [0, 2, 4, 7, 9];
      const step = scale[((degree % 5) + 5) % 5] + 12 * Math.floor(degree / 5);
      const freq = 523.25 * 2 ** (step / 12);
      const t0 = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(0.16 * vol * (bright ? 1.2 : 0.9), t0 + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      out.connect(this.output);
      for (const [mul, g] of [
        [1, 1],
        [2, bright ? 0.28 : 0.15],
        [3, 0.05],
      ] as const) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq * mul;
        og.gain.value = g;
        o.connect(og).connect(out);
        o.start(t0);
        o.stop(t0 + 1.5);
      }
    } catch {
      /* 오디오를 못 쓰면 조용히 */
    }
  }

  /**
   * 스킬 고유 합성음 (skillSound.ts의 설계를 공용 WebAudio 컨텍스트에서 낸다, 파일·<audio> 없이).
   * k: 단·랭크 강도 (skillMoves.skillPower). 같은 소리를 gapMs 안에 또 부르면 건너뛴다 (투사체 여러 발이 한꺼번에 맞을 때)
   */
  skill(id: SkillId, ev: SoundEv, k: number, o: SoundOpt = {}, gapMs = 45): void {
    const vol = this.busGain();
    if (vol <= 0 || this.hidden) return;
    const key = `${id}:${ev}`;
    const now = performance.now();
    if (now - (this.lastSkill.get(key) ?? -Infinity) < gapMs) return;
    const layers = skillSound(id, ev, k, o);
    if (!layers.length) return;
    try {
      const ac = this.audio();
      // 멈춘 컨텍스트에 걸어 두면 깨어날 때 밀린 소리가 한꺼번에 난다 → 건너뛴다
      if (!ac || ac.state !== "running") return;
      this.lastSkill.set(key, now);
      this.voice(ac, layers, vol);
    } catch {
      /* 오디오를 못 쓰면 조용히 */
    }
  }

  /** 스킬 소리 버스: 들어온 소리 → 컴프레서(뭉개지 않게 살짝) → 부드러운 리미터(최대 ±0.89) → 호스트 출력. 잔향은 컨볼버 하나를 같이 쓴다 */
  private skillBus(ac: AudioContext): SkillBus {
    if (this.bus2) return this.bus2;
    const bk = bank(ac);
    const input = ac.createGain();
    input.gain.value = 0.75;
    const verbIn = ac.createGain();
    const verb = ac.createConvolver();
    verb.normalize = false;
    verb.buffer = bk.ir;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 3;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    // 리미터 곡선은 ±2까지 받으므로 절반으로 줄여 넣는다
    const pre = ac.createGain();
    pre.gain.value = 0.5;
    const lim = ac.createWaveShaper();
    lim.curve = bk.curve;
    input.connect(comp);
    verbIn.connect(verb).connect(comp);
    comp.connect(pre).connect(lim).connect(this.output);
    this.bus2 = { input, verbIn, nodes: [input, verbIn, verb, comp, pre, lim] };
    return this.bus2;
  }

  /** 소리 한 묶음(보이스)을 낸다. 보이스가 너무 많으면 가장 오래된 것부터 빠르게 줄여 끈다 */
  private voice(ac: AudioContext, layers: Layer[], vol: number): void {
    const bus = this.skillBus(ac);
    const bk = bank(ac);
    const t0 = ac.currentTime + 0.005;
    this.voices2 = this.voices2.filter((v) => v.end > t0);
    while (this.voices2.length >= MAX_SKILL_VOICES) {
      const old = this.voices2.shift();
      if (old) fadeVoice(old, t0);
    }
    const dry = ac.createGain();
    dry.gain.value = vol;
    dry.connect(bus.input);
    const wet = ac.createGain();
    wet.gain.value = vol;
    wet.connect(bus.verbIn);
    const v: Voice = { dry, wet, srcs: [], end: t0 };
    let last: AudioScheduledSourceNode | null = null;
    for (const l of layers) {
      const src = layerNode(ac, bk, l, t0, dry, wet);
      if (!src) continue;
      v.srcs.push(src);
      if (t0 + l.at + l.dur >= v.end) {
        v.end = t0 + l.at + l.dur;
        last = src;
      }
    }
    // 마지막으로 끝나는 소스가 끝나면 보이스 게인도 뗀다 (각 겹의 노드는 겹마다 뗀다)
    if (last) releaseOnEnd(last, dry, wet);
    this.voices2.push(v);
  }

  destroy(): void {
    const t = this.context?.currentTime ?? 0;
    for (const v of this.voices2) fadeVoice(v, t);
    this.voices2 = [];
    for (const n of this.bus2?.nodes ?? []) {
      try {
        n.disconnect();
      } catch {
        // 이미 뗐다
      }
    }
    this.bus2 = null;
    this.closeAudio();
  }
}

/** 씬 밖(결과 화면 등)에서 효과음 한 번 (볼륨·음소거 설정을 따른다). 레벨 업 소리에 쓴다 */
export function playRpgSoundOnce(name: RpgSound, gain = 1): void {
  const raw = busGain(bridge.last("audio:mix") ?? loadSoundMix(), "sfx");
  if (raw <= 0 || audioLife.hidden) return;
  const ac = sharedAudioContext();
  if (!ac) return;
  const wake = ac.state === "running" ? null : ac.resume().catch(() => undefined);
  // 아직 안 받았으면 받는 대로 한 번 (레벨 업 화면은 사냥 중에 이미 받아 둔 경우가 많다)
  void Promise.all([preloadSound(url(name)), wake]).then(() =>
    playBuffer(ac, ac.destination, url(name), { gain: Math.max(0, Math.min(1, raw * gain)) }),
  );
}
