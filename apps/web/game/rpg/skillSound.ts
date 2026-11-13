import type { SkillId } from "@/lib/rpg/skillTree";

// 사냥 스킬 33종의 고유 합성음 설계 (외부 음원 파일 없이 Web Audio로 낸다 — 재생은 sfx.ts의 RpgSfx.skill).
// 여기는 "무슨 소리를 언제 얼마나"만 정하는 순수 데이터라 브라우저 없이도 테스트·수치 렌더를 할 수 있다.
//  - 갈래별 재료감: 모닥불(불 붙는 쉭·타닥 잡음·저음 쿵·화염 휘몰이), 서리(유리 종·얼음 깨짐·찬바람·결정 상승음),
//    넋(몽환 화음·속삭임 잡음·사슬 찰랑·빨려 드는 역재생 느낌)
//  - 스킬 형태별: 투사체(발사+꼬리, 착탄), 장판(지속 울림), 낙하(떨어지는 휘익+충돌), 연쇄(튕길 때마다 음 상승), 소환(솟는 소리)
//  - 등급 강도: 단·랭크 계수(skillMoves.skillPower, 0.75~1.5)가 오를수록 겹수·저음 무게·잔향·음량·화음 두께가 는다 (intensify)
//  - 궁극기 3종: 기 모으기(상승음·심장 박동) → 폭발(서브 베이스 쿵·넓은 잡음·고음 쨍) → 박자마다 타격 → 여파 잔향
// 시각은 초(소리 시작 기준), 음량은 0..1 (효과음 볼륨·리미터는 재생 쪽에서 건다). 무작위 값은 스킬마다 고정 씨앗이라 늘 같은 소리다.

export type Wave = "sine" | "triangle" | "square" | "sawtooth";
/** perc: 빨리 올라 길게 사라짐 · swell: 천천히 차올라 뚝 끊김 (역재생 느낌) · hold: 올라서 머물다 사라짐 */
export type Env = "perc" | "swell" | "hold";
export type FilterKind = "lowpass" | "highpass" | "bandpass";

/** 소리 한 겹 (오실레이터 하나 또는 잡음 하나) */
export type Layer = {
  src: "osc" | "noise" | "crackle";
  wave?: Wave;
  /** 시작 (초) */
  at: number;
  /** 길이 (초) */
  dur: number;
  /** 최고 음량 0..1 */
  gain: number;
  /** 올라가는 시간 (초, perc·hold) */
  atk: number;
  env: Env;
  /** 음높이 Hz: f0에서 f1로 (glide초 동안, 기본은 길이 전체) 지수로 휜다 */
  f0?: number;
  f1?: number;
  glide?: number;
  /** 필터: f0에서 f1로 길이 동안 휜다. q는 lowpass·highpass면 공명 dB, bandpass면 배수 (Web Audio와 같다) */
  flt?: { type: FilterKind; f0: number; f1: number; q: number };
  /** 떨림: 음높이 또는 필터를 cents만큼 hz로 흔든다 (화염 휘몰이·몽환 떨림) */
  lfo?: { hz: number; cents: number; on: "pitch" | "filter" };
  /** 음 어긋남 (cents, 두껍게 겹칠 때) */
  det?: number;
  /** 좌우 -1..1 */
  pan?: number;
  /** 잔향 보냄 (intensify가 등급에 맞춰 채운다) */
  verb?: number;
};

export type SoundEv = "cast" | "hit" | "tick";
export type SoundOpt = {
  /** 낙하·기 모으기 시간 (ms) */
  ms?: number;
  /** 연쇄 수 */
  n?: number;
  /** 몇 번째 박자·틱 */
  i?: number;
  last?: boolean;
};

/** 등급 강도: k = skillPower (1단 1랭크 0.75 ~ 5단 만랭크 1.5), t = 0..1, ly = 겹수 단계 1..4 */
export type Pow = { k: number; t: number; ly: number };

export function soundPow(k: number): Pow {
  const t = Math.max(0, Math.min(1, (k - 0.75) / 0.75));
  return { k, t, ly: 1 + Math.round(t * 3) };
}

type Branch = "ember" | "frost" | "soul";
const branchOf = (id: SkillId): Branch => (id.startsWith("em_") ? "ember" : id.startsWith("fr_") ? "frost" : "soul");

export const ULTIMATES = ["em_bonfire", "fr_blizzard", "so_procession"] as const;
export type UltId = (typeof ULTIMATES)[number];
const isUlt = (id: SkillId): id is UltId => (ULTIMATES as readonly string[]).includes(id);

/** 단일 스킬 소리 한 번의 길이 상한 (초, 잔향 제외) — 궁극기는 시퀀스 전체 */
export const SOUND_LIMITS = { maxLen: 3.2, ultMaxLen: 4.6 } as const;

// ── 씨앗 난수 (스킬마다 늘 같은 소리) ──
export function rngOf(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 기본 겹 ──
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
/** 타닥 (드문드문 튀는 잡음) */
const crk = (at: number, dur: number, gain: number, hp = 1500, x: Partial<Layer> = {}): Layer => ({ src: "crackle", at, dur, gain, atk: 0.01, env: "hold", flt: { type: "highpass", f0: hp, f1: hp, q: 0 }, ...x });
const semi = (hz: number, s: number) => hz * 2 ** (s / 12);

// ── 모닥불 재료 ──
/** 저음 쿵: 음이 뚝 떨어지는 사인 + 낮은 잡음 덩어리 */
const thump = (at: number, hz: number, dur: number, g: number): Layer[] => [
  osc("sine", at, dur, hz * 2.6, hz, g, { glide: dur * 0.35, atk: 0.002 }),
  nz(at, dur * 0.45, g * 0.45, "lowpass", 900, 120, 0),
];
/** 불 붙는 쉭 */
const fwoosh = (at: number, dur: number, g: number, lo: number, hi: number, x: Partial<Layer> = {}): Layer => nz(at, dur, g, "bandpass", lo, hi, 1.4, { atk: dur * 0.3, ...x });
/** 화염 휘몰이: 공명 필터가 일렁이는 낮은 잡음 */
const roar = (at: number, dur: number, g: number, f0: number, f1: number, hz = 6): Layer => nz(at, dur, g, "lowpass", f0, f1, 6, { env: "hold", atk: Math.min(0.08, dur * 0.2), lfo: { hz, cents: 500, on: "filter" } });

// ── 서리 재료 ──
const GLASS = [1, 2.76, 5.4] as const;
/** 유리 같은 종소리 (비정수 배음) */
const bell = (at: number, hz: number, dur: number, g: number, ratios: readonly number[] = GLASS, x: Partial<Layer> = {}): Layer[] =>
  ratios
    .map((r, i) => osc("sine", at, dur * [1, 0.6, 0.35, 0.25][i], hz * r, hz * r, g * [1, 0.5, 0.28, 0.18][i], { atk: 0.002, ...x }))
    .filter((l) => (l.f0 ?? 0) < 10000);
/** 얼음 깨짐 짤그랑: 짧은 고역 잡음 + 흩어지는 높은 핑 */
const shatter = (at: number, g: number, rnd: () => number, n = 4, lo = 2600, hi = 7000): Layer[] => [
  nz(at, 0.09, g * 0.8, "highpass", 3200, 2400, 2),
  ...Array.from({ length: n }, (_, i) => {
    const f = lo + (hi - lo) * rnd();
    return osc("sine", at + i * 0.017 + rnd() * 0.01, 0.06 + rnd() * 0.12, f, f * 0.98, g * 0.5 * (1 - (i / n) * 0.5), { pan: rnd() * 1.2 - 0.6, atk: 0.001 });
  }),
];
/** 찬바람 쉬익 */
const wind = (at: number, dur: number, g: number, f0: number, f1: number, x: Partial<Layer> = {}): Layer => nz(at, dur, g, "bandpass", f0, f1, 3, { env: "hold", atk: dur * 0.35, lfo: { hz: 0.9, cents: 300, on: "filter" }, ...x });
/** 결정이 돋는 상승음 */
const rise = (at: number, base: number, steps: number, gap: number, g: number, wave: Wave = "sine"): Layer[] =>
  Array.from({ length: steps }, (_, i) => {
    const f = semi(base, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21][i % 10] + 24 * Math.floor(i / 10));
    return osc(wave, at + i * gap, 0.22, f, f, g * (0.7 + (0.3 * i) / steps), { atk: 0.002 });
  });

// ── 넋 재료 ──
/** 몽환 화음 (살짝 어긋난 음들이 떨린다) */
const pad = (at: number, dur: number, root: number, semis: readonly number[], g: number, wave: Wave = "triangle", x: Partial<Layer> = {}): Layer[] =>
  semis.map((s, i) =>
    osc(wave, at, dur, semi(root, s), semi(root, s), g / Math.sqrt(semis.length), { env: "hold", atk: dur * 0.3, det: i % 2 ? 7 : -7, lfo: { hz: 4.5 + i * 0.4, cents: 14, on: "pitch" }, pan: (i / Math.max(1, semis.length - 1)) * 0.8 - 0.4, ...x }),
  );
/** 속삭임 (좁은 대역 잡음이 말하듯 일렁인다) */
const whisper = (at: number, dur: number, g: number, f0: number, f1: number): Layer => nz(at, dur, g, "bandpass", f0, f1, 8, { env: "hold", atk: dur * 0.3, lfo: { hz: 3.5, cents: 450, on: "filter" } });
/** 사슬 찰랑 (금속성 비정수 핑) */
const jingle = (at: number, base: number, g: number, n = 3): Layer[] =>
  Array.from({ length: n }, (_, i) => osc("triangle", at + i * 0.022, 0.13, base * [1, 1.47, 2.09, 2.71][i % 4], base * [1, 1.47, 2.09, 2.71][i % 4], g * (1 - i * 0.15), { atk: 0.001, pan: i % 2 ? 0.3 : -0.3 }));
/** 빨려 듦 (역재생처럼 차오르다 뚝) */
const inhale = (at: number, dur: number, g: number, f0: number, f1: number): Layer[] => [
  nz(at, dur, g, "bandpass", f0, f1, 2, { env: "swell" }),
  osc("sine", at, dur, f0 / 6, f1 / 6, g * 0.5, { env: "swell" }),
];

/** 설계 하나: 겹들 + 주된 순간(hit, 초)과 바탕음(base, Hz) — 등급 강도가 이 순간에 무게를 더한다 */
type Design = { ls: Layer[]; hit: number; base: number };
type Recipe = (p: Pow, o: SoundOpt, rnd: () => number) => Design;
type Recipes = Partial<Record<SoundEv, Recipe>>;

// ════ 스킬 33종 ════
const R: Record<SkillId, Recipes> = {
  // ── 모닥불지기 ──
  // 불씨 던지기 (투사체): 성냥 긋는 칙 + 날아가는 휘파람 꼬리 → 착탄 퍽 + 타닥
  em_kindle: {
    cast: () => ({ ls: [nz(0, 0.06, 0.35, "bandpass", 2600, 5200, 2), fwoosh(0.02, 0.16, 0.25, 900, 1900), osc("sine", 0.03, 0.15, 980, 620, 0.12, { env: "hold", atk: 0.02 })], hit: 0, base: 160 }),
    hit: () => ({ ls: [...thump(0, 150, 0.2, 0.45), nz(0, 0.18, 0.3, "lowpass", 3200, 500, 2), crk(0.02, 0.28, 0.35, 1800)], hit: 0, base: 150 }),
  },
  // 화롯가 온기 (패시브, 콤보 마무리): 따뜻한 낮은 화음 + 잔잔한 타닥
  em_hearth: {
    hit: () => ({ ls: [...pad(0, 0.55, 110, [0, 7], 0.18, "triangle", { lfo: { hz: 2, cents: 8, on: "pitch" } }), crk(0, 0.4, 0.2, 2200)], hit: 0, base: 110 }),
  },
  // 불꽃 부채 (부채형): 좌에서 우로 쓸어 가는 화염 휘몰이 + 낮은 우르릉
  em_fan: {
    cast: () => ({
      ls: [fwoosh(0, 0.32, 0.4, 300, 2600, { pan: -0.6 }), fwoosh(0.06, 0.3, 0.3, 500, 2200, { pan: 0.6 }), osc("sawtooth", 0, 0.38, 82, 58, 0.18, { flt: { type: "lowpass", f0: 420, f1: 260, q: 4 } }), crk(0.09, 0.3, 0.3, 1600), ...thump(0.09, 95, 0.22, 0.3)],
      hit: 0.09,
      base: 95,
    }),
  },
  // 불길 돋우기 (강화): 풀무가 푸욱 들이켜 불이 확 오른다 (상승)
  em_stoke: {
    cast: () => ({ ls: [nz(0, 0.42, 0.3, "lowpass", 200, 1600, 3, { env: "swell" }), osc("triangle", 0.05, 0.5, 70, 150, 0.22, { env: "hold", atk: 0.25 }), fwoosh(0.38, 0.3, 0.4, 700, 3200), crk(0.4, 0.45, 0.35, 1400)], hit: 0.4, base: 70 }),
  },
  // 튀는 불티 (패시브, 치명타): 부싯돌 딱 + 작은 불티
  em_spark: {
    hit: () => ({ ls: [osc("square", 0, 0.05, 2400, 1700, 0.12, { atk: 0.001, flt: { type: "highpass", f0: 1200, f1: 1200, q: 0 } }), crk(0, 0.16, 0.3, 3000), nz(0, 0.03, 0.2, "highpass", 5000)], hit: 0, base: 300 }),
  },
  // 불꽃 고리 (장판): 기 모으는 웅 → 고리가 터지며 둘레를 도는 화염 휘몰이
  em_ring: {
    cast: () => ({ ls: [nz(0, 0.2, 0.25, "bandpass", 400, 1300, 1.5, { env: "swell" }), osc("sine", 0, 0.2, 55, 70, 0.25, { env: "swell" })], hit: 0.2, base: 55 }),
    hit: () => ({ ls: [...thump(0, 72, 0.4, 0.55), roar(0, 1.1, 0.4, 500, 1500, 7), fwoosh(0, 0.25, 0.3, 1200, 3500), crk(0.05, 0.9, 0.3, 1500)], hit: 0, base: 72 }),
  },
  // 불씨 옮기기 (발동): 짧은 퍽
  em_ignite: {
    hit: () => ({ ls: [...thump(0, 190, 0.12, 0.22), nz(0, 0.08, 0.25, "highpass", 1000), crk(0, 0.14, 0.25, 2000)], hit: 0, base: 190 }),
  },
  // 장작 유성 (낙하): 떨어지는 휘익 + 우르릉 → 땅을 가르는 충돌 + 돌 튀는 소리
  em_meteor: {
    cast: (_p, o) => {
      const d = (o.ms ?? 800) / 1000;
      return { ls: [osc("sine", 0, d, 1800, 260, 0.16, { env: "swell" }), nz(0, d, 0.3, "bandpass", 3000, 500, 1.5, { env: "swell" }), roar(d * 0.3, d * 0.7, 0.2, 200, 600, 9)], hit: d, base: 50 };
    },
    hit: (_p, _o, rnd) => ({
      ls: [
        osc("sine", 0, 0.85, 120, 32, 0.5, { glide: 0.5, atk: 0.002 }),
        nz(0, 0.9, 0.45, "lowpass", 4200, 150, 1),
        crk(0.03, 1.1, 0.35, 1200),
        ...Array.from({ length: 4 }, (_, i) => osc("triangle", 0.05 + i * 0.07 + rnd() * 0.03, 0.09, 320 + rnd() * 300, 280, 0.14, { pan: rnd() - 0.5 })),
      ],
      hit: 0,
      base: 40,
    }),
  },
  // 화톳불 (장판, 지속): 쇠받침 땡 + 불 붙는 쉭 + 낮게 웅웅 울림 / 틱마다 불길 훅
  em_brazier: {
    cast: () => ({ ls: [osc("triangle", 0, 0.3, 520, 515, 0.18, { atk: 0.001 }), osc("triangle", 0, 0.22, 784, 780, 0.1, { atk: 0.001 }), fwoosh(0.05, 0.4, 0.35, 600, 2400), osc("sine", 0.1, 1.0, 98, 98, 0.18, { env: "hold", atk: 0.2, lfo: { hz: 3, cents: 30, on: "pitch" } }), crk(0.1, 0.9, 0.25, 1600)], hit: 0.05, base: 98 }),
    tick: () => ({ ls: [nz(0, 0.22, 0.25, "lowpass", 1000, 300, 3, { atk: 0.04 }), crk(0, 0.18, 0.2, 2000), osc("sine", 0, 0.2, 196, 150, 0.12)], hit: 0, base: 98 }),
  },
  // 큰 모닥불 (궁극) — 아래 ULT
  em_bonfire: {},
  // 잿빛 심장 (패시브, 광역 명중): 재가 풀썩 + 흩날리는 쉬익
  em_ashheart: {
    hit: () => ({ ls: [nz(0, 0.3, 0.3, "lowpass", 260, 120, 2), osc("sine", 0, 0.3, 58, 44, 0.25), nz(0.04, 0.4, 0.16, "highpass", 6000, 4000, 0, { env: "hold", atk: 0.1 })], hit: 0, base: 50 }),
  },

  // ── 서리 묘지기 ──
  // 서리 숨결 (부채형): 차가운 숨 쉬익 + 반짝이는 결정 + 끝에 작은 유리 종
  fr_breath: {
    cast: () => ({ ls: [wind(0, 0.45, 0.4, 1800, 3600), nz(0, 0.35, 0.15, "highpass", 6000, 5000, 0, { env: "hold", atk: 0.1 }), ...bell(0.08, 2093, 0.5, 0.18)], hit: 0.08, base: 523 }),
  },
  // 서리 옷깃 (패시브, 맞을 때): 얼음 판에 톡
  fr_collar: {
    hit: () => ({ ls: [...bell(0, 1318, 0.25, 0.2, [1, 2.4]), nz(0, 0.05, 0.25, "highpass", 2500)], hit: 0, base: 330 }),
  },
  // 고드름 (투사체): 팅 튕기는 발사 + 휘파람 꼬리 / 착탄 짤그랑
  fr_icicle: {
    cast: () => ({ ls: [osc("triangle", 0, 0.12, 1760, 1975, 0.28, { atk: 0.001 }), osc("sine", 0.02, 0.3, 3000, 2200, 0.1, { env: "hold", atk: 0.05 }), nz(0, 0.28, 0.15, "bandpass", 5000, 3000, 3, { env: "hold", atk: 0.05 })], hit: 0, base: 440 }),
    hit: (_p, _o, rnd) => ({ ls: [...shatter(0, 0.32, rnd, 3), osc("sine", 0, 0.08, 900, 600, 0.15)], hit: 0, base: 440 }),
  },
  // 살얼음 (발동): 쩍 금 가는 소리
  fr_brittle: {
    hit: () => ({ ls: [nz(0, 0.03, 0.35, "highpass", 2000), osc("square", 0, 0.04, 3200, 1100, 0.1, { atk: 0.001, flt: { type: "lowpass", f0: 6000, f1: 3000, q: 0 } }), osc("sine", 0.01, 0.18, 4186, 4186, 0.1)], hit: 0, base: 600 }),
  },
  // 얼음 방패 (강화): 결정 껍질이 차례로 돋는 상승 + 맑은 울림 / 깨질 때 짤그랑
  fr_ward: {
    cast: () => ({ ls: [...rise(0, 1046, 6, 0.045, 0.14), ...pad(0.05, 0.7, 523, [0, 7, 12], 0.18, "sine")], hit: 0.27, base: 523 }),
    hit: (_p, _o, rnd) => ({ ls: [...shatter(0, 0.4, rnd, 6, 2000, 6500), ...bell(0, 784, 0.6, 0.2)], hit: 0, base: 392 }),
  },
  // 서리꽃 (장판): 결정이 자라는 상승 → 눈꽃이 피며 유리 종 무리 + 찬바람
  fr_nova: {
    cast: () => ({ ls: [osc("sine", 0, 0.18, 400, 1600, 0.2, { env: "swell" }), nz(0, 0.18, 0.15, "highpass", 2000, 6000, 0, { env: "swell" })], hit: 0.18, base: 400 }),
    hit: (_p, _o, rnd) => ({ ls: [...bell(0, 1568, 0.9, 0.22), ...bell(0.01, 2349, 0.7, 0.14), ...shatter(0, 0.3, rnd, 4), wind(0, 0.8, 0.25, 900, 2400), osc("sine", 0, 0.4, 130, 90, 0.25)], hit: 0, base: 196 }),
  },
  // 안개 걸음 (돌진): 바람 휙 + X자로 두 번 칭칭
  fr_mist: {
    cast: () => ({ ls: [wind(0, 0.35, 0.4, 600, 3000, { pan: -0.5, atk: 0.06 }), wind(0.05, 0.3, 0.25, 900, 3500, { pan: 0.5, atk: 0.06 }), osc("triangle", 0.08, 0.2, 2637, 2400, 0.2, { atk: 0.001, pan: -0.3 }), osc("triangle", 0.16, 0.22, 3136, 2900, 0.2, { atk: 0.001, pan: 0.3 }), nz(0.08, 0.05, 0.2, "highpass", 4000)], hit: 0.08, base: 660 }),
  },
  // 얼음 무덤 (낙하): 고드름 비가 떨어지며 내려가는 핑 무리 → 얼음 비석이 솟는 묵직한 쩍 + 짤그랑
  fr_tomb: {
    cast: (_p, o, rnd) => {
      const d = (o.ms ?? 600) / 1000;
      return {
        ls: [wind(0, d, 0.25, 2500, 900, { env: "swell" }), ...Array.from({ length: 7 }, (_, i) => osc("sine", (i / 7) * d * 0.9, 0.12, 5200 - i * 450 + rnd() * 300, 3000 - i * 200, 0.1, { pan: rnd() * 1.4 - 0.7, atk: 0.001 }))],
        hit: d,
        base: 90,
      };
    },
    hit: (_p, _o, rnd) => ({ ls: [osc("sine", 0, 0.6, 95, 55, 0.5, { atk: 0.003 }), nz(0, 0.3, 0.35, "bandpass", 900, 500, 1.2), ...shatter(0.03, 0.4, rnd, 6, 1800, 6000), ...rise(0.05, 784, 4, 0.03, 0.12)], hit: 0, base: 55 }),
  },
  // 서리밭 (장판, 지속): 얼음이 번지는 바스락 + 느린 결정 상승 + 차가운 낮은 화음 / 틱마다 얼음 똑
  fr_field: {
    cast: () => ({ ls: [nz(0, 0.9, 0.22, "highpass", 8000, 3000, 2, { env: "hold", atk: 0.2 }), crk(0, 0.8, 0.18, 4000), ...rise(0.05, 1318, 5, 0.09, 0.1, "triangle"), ...pad(0, 1.0, 220, [0, 3, 10], 0.16, "sine")], hit: 0.05, base: 220 }),
    tick: () => ({ ls: [...bell(0, 2637, 0.2, 0.1, [1, 2.76]), nz(0, 0.06, 0.1, "highpass", 5000)], hit: 0, base: 660 }),
  },
  fr_blizzard: {},
  // 동지의 맹세 (패시브, 시전할 때): 시간이 얼어붙는 듯 느리게 떨리는 두 종
  fr_solstice: {
    hit: () => ({ ls: [osc("sine", 0, 0.6, 1975, 1975, 0.1, { lfo: { hz: 7, cents: 25, on: "pitch" } }), osc("sine", 0.04, 0.6, 2960, 2960, 0.07, { lfo: { hz: 5, cents: 25, on: "pitch" } })], hit: 0, base: 494 }),
  },

  // ── 넋 인도자 ──
  // 넋불 (투사체, 따라감): 후웅 떠오르는 떨림 + 속삭임 / 착탄 부드러운 퐁
  so_wisp: {
    cast: () => ({ ls: [osc("sine", 0, 0.3, 660, 880, 0.22, { env: "hold", atk: 0.08, lfo: { hz: 6, cents: 30, on: "pitch" } }), whisper(0, 0.35, 0.2, 900, 1500)], hit: 0.05, base: 330 }),
    hit: () => ({ ls: [osc("triangle", 0, 0.16, 990, 740, 0.22), nz(0, 0.1, 0.18, "bandpass", 1800, 900, 3)], hit: 0, base: 330 }),
  },
  // 넋등 기도 (회복): 장조 화음이 차오름 + 작은 종 + 속삭임
  so_lamp: {
    cast: () => ({ ls: [...pad(0, 0.95, 262, [0, 4, 7, 12], 0.28, "sine"), ...bell(0.25, 1568, 0.6, 0.1, [1, 2]), whisper(0, 0.6, 0.1, 1200, 1800)], hit: 0.25, base: 131 }),
  },
  // 넋 거두기 (발동): 붉은 넋이 빨려 든다
  so_drain: {
    hit: () => ({ ls: [...inhale(0, 0.26, 0.22, 2400, 600), osc("sine", 0, 0.26, 300, 600, 0.1, { env: "swell" })], hit: 0.26, base: 150 }),
  },
  // 바람 넋 (강화): 바람 띠가 감기며 피리 같은 미끄럼
  so_swift: {
    cast: () => ({ ls: [nz(0, 0.5, 0.3, "bandpass", 1200, 4000, 2.5, { env: "hold", atk: 0.12, pan: -0.5 }), nz(0.08, 0.45, 0.2, "bandpass", 1500, 4500, 2.5, { env: "hold", atk: 0.12, pan: 0.5 }), osc("sine", 0.05, 0.45, 784, 1175, 0.16, { env: "hold", atk: 0.1, lfo: { hz: 5.5, cents: 20, on: "pitch" } })], hit: 0.1, base: 392 }),
  },
  // 길동무 넋 (소환): 묘비가 웅 솟는 낮은 울림 + 빨려 듦 + 단조 화음 / 길동무 공격 작은 넋 화살
  so_friend: {
    cast: () => ({ ls: [osc("triangle", 0, 0.5, 82, 110, 0.3, { env: "hold", atk: 0.15 }), nz(0, 0.4, 0.2, "lowpass", 300, 900, 2, { env: "swell" }), ...pad(0.25, 0.7, 220, [0, 3, 7], 0.2)], hit: 0.3, base: 82 }),
    tick: () => ({ ls: [osc("sine", 0, 0.12, 520, 780, 0.12, { atk: 0.01 }), nz(0, 0.08, 0.08, "bandpass", 1600, 2400, 4)], hit: 0, base: 260 }),
  },
  // 넋 사슬 (연쇄): 튕길 때마다 한 음씩 올라가는 사슬 찰랑 → 봉인 쿵 + 화음
  so_chain: {
    cast: (_p, o) => {
      const n = Math.max(1, Math.min(8, o.n ?? 3));
      const ls: Layer[] = [];
      for (let i = 0; i < n; i++) ls.push(...jingle(i * 0.055, semi(1400, i * 2), 0.18, 2 + (i % 2)));
      const end = n * 0.055 + 0.06;
      ls.push(osc("sine", end, 0.35, 160, 70, 0.35, { atk: 0.002 }), ...pad(end, 0.6, 196, [0, 3, 6], 0.2));
      return { ls, hit: end, base: 98 };
    },
  },
  // 저승 너울 (순간이동): 역재생처럼 빨려 들었다가 뽁 나타남 + 어두운 화음
  so_veil: {
    cast: () => ({ ls: [...inhale(0, 0.3, 0.3, 3500, 400), osc("sine", 0.3, 0.12, 900, 300, 0.25, { atk: 0.001 }), ...pad(0.3, 0.6, 147, [0, 3, 6], 0.22, "sawtooth", { flt: { type: "lowpass", f0: 900, f1: 500, q: 0 } })], hit: 0.3, base: 147 }),
  },
  // 넋 소용돌이 (회오리): 길게 빨려 듦 / 틱마다 빙글 도는 휘몰이 (틱마다 음이 오른다)
  so_harvest: {
    cast: () => ({ ls: [...inhale(0, 0.22, 0.25, 600, 2400), whisper(0, 0.3, 0.15, 700, 1100)], hit: 0.22, base: 110 }),
    tick: (_p, o) => {
      const i = o.i ?? 0;
      const up = semi(1, i * 3);
      return {
        ls: [nz(0, 0.36, 0.3, "bandpass", 500 * up, 1800 * up, 4, { env: "hold", atk: 0.06, lfo: { hz: 9, cents: 700, on: "filter" } }), osc("sine", 0, 0.32, 220 * up, 440 * up, 0.2, { env: "hold", atk: 0.05, lfo: { hz: 9, cents: 40, on: "pitch" } }), ...(o.last ? [osc("sine", 0, 0.5, 140, 50, 0.35), ...pad(0, 0.6, 165, [0, 7, 10], 0.18)] : [])],
        hit: 0,
        base: 110 * up,
      };
    },
  },
  // 망자의 초롱 (소환): 유령 손이 솟는 상승 미끄럼 + 초롱 종 + 합창 / 초롱이 쏘는 작은 넋불
  so_lantern: {
    cast: () => ({ ls: [osc("sine", 0, 0.45, 220, 660, 0.22, { env: "hold", atk: 0.2 }), ...bell(0.3, 1318, 0.7, 0.14, [1, 2.01, 3]), ...pad(0.1, 0.8, 330, [0, 4, 9], 0.16, "sine"), whisper(0.05, 0.5, 0.1, 1500, 2200)], hit: 0.3, base: 165 }),
    tick: () => ({ ls: [osc("triangle", 0, 0.1, 1046, 1318, 0.12, { atk: 0.003 }), whisper(0, 0.12, 0.06, 1800, 2400)], hit: 0, base: 523 }),
  },
  so_procession: {},
  // 넋의 인연 (패시브, 소환수 공격): 맑은 5도 두 음
  so_kinship: {
    hit: () => ({ ls: [osc("sine", 0, 0.3, 392, 392, 0.1, { atk: 0.02 }), osc("sine", 0.03, 0.3, 587, 587, 0.08, { atk: 0.02 })], hit: 0, base: 196 }),
  },
};

// ════ 궁극기: 기 모으기 → 폭발 → 박자 → 여파 ════
const ULT = {
  ember: { sub: 30, riser: "sawtooth" as Wave, r0: 55, r1: 220, chord: [0, 7, 12, 19], root: 73, hi: 2600 },
  frost: { sub: 36, riser: "sine" as Wave, r0: 220, r1: 880, chord: [0, 5, 10, 15], root: 110, hi: 4186 },
  soul: { sub: 33, riser: "triangle" as Wave, r0: 110, r1: 440, chord: [0, 4, 7, 11, 14], root: 98, hi: 3136 },
};

/** 기 모으기 (lead초 뒤 첫 폭발): 올라가는 상승음 + 빨라지는 심장 박동 + 갈래 잡음이 차오르고, 폭발 직전 빨려 듦 */
function ultCharge(b: Branch, lead: number): Design {
  const u = ULT[b];
  const ls: Layer[] = [
    osc(u.riser, 0.05, lead - 0.05, u.r0, u.r1, 0.2, { env: "swell", flt: { type: "lowpass", f0: 250, f1: 3200, q: 3 } }),
    osc("sine", 0.1, lead - 0.1, u.r0 * 2, u.r1 * 2, 0.08, { env: "swell", det: 9 }),
  ];
  // 심장 박동 (쿵-쿵, 점점 빨라지고 세진다)
  const beats = [0.2, 0.45, 0.65, 0.8, 0.92];
  beats.forEach((f, i) => {
    const t = lead * f;
    const g = 0.25 + i * 0.07;
    ls.push(osc("sine", t, 0.16, 70, 45, g, { atk: 0.003 }), osc("sine", t + 0.13, 0.13, 62, 42, g * 0.75, { atk: 0.003 }));
  });
  if (b === "ember") ls.push(roar(0.1, lead - 0.1, 0.18, 180, 1200, 5), crk(0.2, lead - 0.2, 0.18, 1500));
  else if (b === "frost") ls.push(wind(0, lead, 0.22, 600, 3000), ...rise(lead * 0.4, 1046, 8, (lead * 0.5) / 8, 0.08));
  else ls.push(whisper(0, lead, 0.16, 600, 1600), ...pad(0.1, lead - 0.1, 196, [0, 7, 14], 0.16));
  ls.push(...inhale(lead - 0.28, 0.28, 0.22, 600, 5000));
  return { ls, hit: lead, base: u.root };
}

/** 폭발: 서브 베이스 쿵 + 넓은 잡음 폭발 + 고음 쨍 + 갈래 화음 */
function ultBoom(b: Branch, at: number, g: number, rnd: () => number): Layer[] {
  const u = ULT[b];
  return [
    osc("sine", at, 1.2, 110, u.sub, 0.7 * g, { glide: 0.6, atk: 0.002 }),
    osc("triangle", at, 0.5, 220, 60, 0.25 * g, { atk: 0.002 }),
    nz(at, 1.3, 0.45 * g, "lowpass", 8000, 120, 0, { pan: -0.3 }),
    nz(at, 1.1, 0.3 * g, "lowpass", 6000, 200, 0, { pan: 0.3 }),
    ...bell(at, u.hi, 0.7, 0.2 * g, [1, 1.51, 2.3]),
    ...pad(at, 1.2, u.root * 2, u.chord, 0.3 * g, b === "ember" ? "sawtooth" : b === "frost" ? "sine" : "triangle", { atk: 0.01, env: "perc", ...(b === "ember" ? { flt: { type: "lowpass", f0: 2500, f1: 600, q: 0 } } : {}) }),
    ...(b === "ember" ? [crk(at, 1.2, 0.35 * g, 1200), roar(at, 1.0, 0.3 * g, 1500, 300, 8)] : b === "frost" ? shatter(at, 0.4 * g, rnd, 7, 2200, 7500) : [...jingle(at, 1760, 0.2 * g, 4), whisper(at, 0.9, 0.18 * g, 800, 2000)]),
  ];
}

/** 박자 하나 (i번째, last면 폭발 + 여파 잔향). 첫 박자도 폭발이다 */
function ultBeat(b: Branch, i: number, last: boolean, rnd: () => number): Design {
  const u = ULT[b];
  const up = semi(1, i * 2);
  const ls: Layer[] = [];
  if (i === 0 || last) ls.push(...ultBoom(b, 0, last ? 0.72 : 0.62, rnd));
  else {
    // 중간 박자: 갈래 타격 (박자마다 음이 오른다)
    ls.push(...thump(0, 60 * up, 0.35, 0.4));
    if (b === "ember") ls.push(fwoosh(0, 0.3, 0.35, 400 * up, 2500 * up, { pan: i % 2 ? 0.5 : -0.5 }), crk(0, 0.3, 0.25, 1500));
    else if (b === "frost") ls.push(wind(0, 0.4, 0.35, 900 * up, 3200, { atk: 0.04, pan: i % 2 ? 0.5 : -0.5 }), ...shatter(0.02, 0.25, rnd, 3));
    else ls.push(...jingle(0, 1320 * up, 0.16, 3), ...pad(0, 0.4, u.root * 2 * up, [0, 4, 7], 0.2, "triangle", { atk: 0.01, env: "perc" }));
  }
  if (last) {
    // 여파: 길게 남는 잔향 겹
    if (b === "ember") ls.push(crk(0.3, 1.8, 0.22, 1300), roar(0.2, 1.6, 0.16, 600, 150, 3));
    else if (b === "frost") ls.push(wind(0.2, 1.8, 0.2, 2400, 700), ...Array.from({ length: 8 }, (_, k) => osc("sine", 0.3 + k * 0.18 + rnd() * 0.08, 0.3, 3000 + rnd() * 3500, 2800, 0.06, { pan: rnd() * 1.6 - 0.8, atk: 0.001 })));
    else ls.push(...pad(0.2, 1.9, u.root * 2, [0, 7, 12, 16], 0.22, "sine"), whisper(0.2, 1.6, 0.12, 1400, 700));
  }
  return { ls, hit: 0, base: 40 };
}

// ════ 등급 강도 ════
const SUB: Record<Branch, number> = { ember: 42, frost: 55, soul: 48 };

/** 갈래 재료 한 겹 더 (겹수 2단계부터) */
function texture(b: Branch, at: number, p: Pow): Layer[] {
  const g = 0.08 + 0.1 * p.t;
  if (b === "ember") return [crk(at, 0.25 + 0.4 * p.t, g, 1600)];
  if (b === "frost") return [osc("sine", at + 0.01, 0.25 + 0.3 * p.t, 3520, 3500, g * 0.7, { atk: 0.001, pan: 0.4 }), nz(at, 0.12, g * 0.6, "highpass", 6000)];
  return [whisper(at, 0.3 + 0.4 * p.t, g * 0.8, 900, 1400)];
}

/**
 * 단·랭크가 오를수록: 음량(0.55→1배), 꼬리 길이(0.85→1.3배), 잔향 보냄(0.08→0.38), 저음 무게(서브 사인, t≥0.15),
 * 겹수(갈래 재료 + 2·3·4단계마다 겹), 화음 두께(어긋난 겹·옥타브 아래·5도 위)가 는다. 1단 1랭크는 가볍고 짧다.
 */
export function intensify(d: Design, p: Pow, b: Branch, ult = false): Layer[] {
  const gm = 0.55 + 0.45 * p.t;
  const tail = 0.85 + 0.45 * p.t;
  const send = (ult ? 0.2 : 0.08) + 0.3 * p.t;
  const out: Layer[] = d.ls.map((l) => ({ ...l, gain: l.gain * gm, dur: l.env === "perc" && l.dur > 0.12 ? l.dur * tail : l.dur, verb: send }));
  // 화음 두께: 가장 큰 음 겹들(저음 쿵은 빼고)을 살짝 어긋나게 겹치고, 옥타브 아래 · 5도 위를 더한다
  const tonal = out.filter((l) => l.src === "osc" && (l.f0 ?? 0) >= 160).sort((a, c) => c.gain - a.gain);
  if (p.ly >= 3)
    for (const l of tonal.slice(0, 3)) {
      out.push({ ...l, det: (l.det ?? 0) + 9, gain: l.gain * 0.45, pan: -(l.pan ?? 0.2) });
      if ((l.f0 ?? 0) >= 220) out.push({ ...l, f0: (l.f0 ?? 0) / 2, f1: (l.f1 ?? 0) / 2, gain: l.gain * 0.3 });
    }
  if (p.ly >= 4) for (const l of tonal.slice(0, 2)) if ((l.f0 ?? 0) * 1.5 < 9000) out.push({ ...l, f0: (l.f0 ?? 0) * 1.5, f1: (l.f1 ?? 0) * 1.5, gain: l.gain * 0.22 });
  // 겹수: 갈래 재료
  if (p.ly >= 2) out.push(...texture(b, d.hit, p).map((l) => ({ ...l, verb: send })));
  // 저음 무게
  if (p.t >= 0.15) {
    const sb = Math.min(SUB[b], d.base);
    out.push({ ...osc("sine", d.hit, 0.25 + 0.5 * p.t, sb * 2.2, sb, (0.1 + 0.3 * p.t) * (ult ? 0.6 : 1), { glide: 0.15, atk: 0.003 }), verb: send * 0.3 });
  }
  return out;
}

// ════ 밖에서 쓰는 것 ════

/** 이 스킬에 이 소리가 있는지 */
export function hasSkillSound(id: SkillId, ev: SoundEv): boolean {
  if (isUlt(id)) return ev === "cast" || ev === "hit";
  return !!R[id][ev];
}

/**
 * 스킬 소리 한 번의 겹들 (없으면 빈 배열). k = skillPower.
 * 궁극기: cast = 기 모으기(o.ms = 첫 폭발까지 ms), hit = 박자 (o.i, o.last)
 */
export function skillSound(id: SkillId, ev: SoundEv, k: number, o: SoundOpt = {}): Layer[] {
  const p = soundPow(k);
  const b = branchOf(id);
  const rnd = rngOf(`${id}:${ev}:${o.i ?? 0}`);
  if (isUlt(id)) {
    if (ev === "cast") return intensify(ultCharge(b, Math.max(0.4, (o.ms ?? 820) / 1000)), p, b, true);
    if (ev === "hit") return intensify(ultBeat(b, o.i ?? 0, !!o.last, rnd), p, b, true);
    return [];
  }
  const r = R[id][ev];
  return r ? intensify(r(p, o, rnd), p, b) : [];
}

/** 궁극기 전체 시퀀스 (테스트·수치 확인용): 기 모으기 + hitAt 박자마다 타격 — 재생 쪽은 같은 조각을 박자에 맞춰 따로 낸다 */
export function ultimateSequence(id: UltId, k: number, hitAt: readonly number[]): Layer[] {
  const out = skillSound(id, "cast", k, { ms: hitAt[0] });
  hitAt.forEach((ms, i) => {
    for (const l of skillSound(id, "hit", k, { i, last: i === hitAt.length - 1 })) out.push({ ...l, at: l.at + ms / 1000 });
  });
  return out;
}

/** 겹들이 끝나는 시각 (초, 잔향 제외) */
export function soundEnd(ls: readonly Layer[]): number {
  return ls.reduce((m, l) => Math.max(m, l.at + l.dur), 0);
}

/** 소리 서명 (매개변수를 반올림해 이은 문자열) — 스킬마다 다른지 비교한다 */
export function soundSignature(ls: readonly Layer[]): string {
  const r = (v: number | undefined) => (v === undefined ? "" : Math.round(v * 1000) / 1000);
  return ls.map((l) => [l.src, l.wave ?? "", r(l.at), r(l.dur), r(l.gain), l.env, r(l.f0), r(l.f1), l.flt ? `${l.flt.type}${r(l.flt.f0)}-${r(l.flt.f1)}` : "", l.lfo ? `${l.lfo.on}${l.lfo.hz}` : ""].join(":")).join("|");
}

// ── 공용 버퍼 채우기 (재생 쪽은 한 번 만들어 재사용, 테스트 렌더도 같은 함수) ──

/** 흰 잡음 */
export function fillNoise(d: Float32Array, rnd: () => number): void {
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
}

/** 타닥 잡음: 드문드문 튀는 짧은 딱 소리 */
export function fillCrackle(d: Float32Array, sr: number, rnd: () => number): void {
  d.fill(0);
  const decay = Math.exp(-1 / (sr * 0.0015));
  for (let i = 0; i < d.length; i++) {
    if (rnd() > 90 / sr) continue;
    let a = (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.7);
    for (let j = i; j < Math.min(d.length, i + Math.floor(sr * 0.01)); j++) {
      d[j] += a * (rnd() * 2 - 1);
      a *= decay;
    }
  }
}

/** 잔향 임펄스 (지수로 사라지는 잡음, 에너지 1로 맞춤) */
export function fillImpulse(ch: Float32Array[], sr: number, rnd: () => number, secs: number): void {
  for (const d of ch) {
    let e = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const v = (rnd() * 2 - 1) * Math.exp((-6.9 * t) / secs) * Math.min(1, t / 0.01);
      d[i] = v;
      e += v * v;
    }
    const k = 1 / Math.sqrt(e || 1);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

/** 마지막 안전 리미터 곡선 (부드럽게 눌러 최대 ±ceiling을 넘지 않는다). 입력은 절반으로 줄여 넣는다 (±2까지 받는다) */
export const LIMIT_CEILING = 0.89;
export function limitCurve(n = 2048): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    c[i] = LIMIT_CEILING * Math.tanh(x / LIMIT_CEILING);
  }
  return c;
}
