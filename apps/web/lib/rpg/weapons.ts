import type { GearDef } from "./catalog";

// 40번 무기 특색: 무기마다 공격 방식(모양·범위·타이밍·피해 배율·소리)이 다르다.
// 게임(HuntScene)·장비창 설명·테스트가 같은 표를 쓴다. 서버 검증과는 상관없다 (처치 수·시간만 본다)
// — 다만 무기 사이 초당 피해가 크게 벌어지지 않게 dpsFactor로 묶어 두고 테스트로 지킨다.

export type WeaponStyleId = "swing" | "smash" | "thrust" | "combo" | "shot" | "magic" | "card";

export type WeaponStyle = {
  id: WeaponStyleId;
  /** 짧은 이름 (장비창 꼬리표) */
  name: string;
  /** 한 줄 설명 (장비창 툴팁) */
  desc: string;
  /**
   * 기본 범위. 근접(swing·smash·thrust·combo)은 바라보는 쪽 부채꼴,
   * 원거리(shot·card)는 사거리 + 자동 조준 각도, 마법(magic)은 시전 거리 + 대상 찾는 각도
   */
  area: { range: number; arcDeg: number };
  /** 한 번 공격에 몇 번 때리나 (연타) */
  hits: number;
  /** 연타 사이 ms */
  hitGapMs: number;
  /** 한 번 맞힐 때 공격력 배율 */
  mult: number;
  /** 공격 간격 배율 (1 = 공격 속도대로, 1.3 = 30% 느림) */
  cdMul: number;
  /** 누른 뒤 실제로 맞는 순간까지 (휘두르는 동작) ms */
  windupMs: number;
  /** 넉백 세기 배율 */
  kb: number;
  /** 맞은 몬스터 경직 추가 ms */
  stunMs: number;
  /** 원거리: 투사체 속도(px/s)·관통 수(0이면 첫 마리에서 멈춤) */
  projectile?: { speed: number; pierce: number };
  /** 마법: 목표 지점 폭발 반지름 */
  blast?: number;
  /** 세 번째 연속 공격(마무리)에 붙는 것 */
  finisher: { mult: number; label: string; range?: number; arcDeg?: number; hits?: number; spread?: number; blast?: number; shockwave?: number };
};

export const WEAPON_STYLES: Record<WeaponStyleId, WeaponStyle> = {
  swing: {
    id: "swing",
    name: "휘두르기",
    desc: "앞쪽 부채꼴을 넓게 벤다. 3번째 연속 공격은 더 넓고 세게.",
    area: { range: 26, arcDeg: 120 },
    hits: 1,
    hitGapMs: 0,
    mult: 1,
    cdMul: 1,
    windupMs: 0,
    kb: 1,
    stunMs: 0,
    finisher: { mult: 1.4, label: "회전 베기", range: 30, arcDeg: 200 },
  },
  smash: {
    id: "smash",
    name: "내려찍기",
    desc: "느리지만 묵직하다. 넓게 찍어 멀리 밀쳐 내고, 3번째는 바닥을 울려 사방을 친다.",
    area: { range: 25, arcDeg: 150 },
    hits: 1,
    hitGapMs: 0,
    mult: 1.3,
    cdMul: 1.3,
    windupMs: 90,
    kb: 1.7,
    stunMs: 120,
    finisher: { mult: 1.5, label: "땅 울리기", shockwave: 34 },
  },
  thrust: {
    id: "thrust",
    name: "찌르기",
    desc: "길고 좁게 찔러 앞에 줄 선 적을 모두 꿰뚫는다. 3번째는 더 멀리.",
    area: { range: 44, arcDeg: 22 },
    hits: 1,
    hitGapMs: 0,
    mult: 1,
    cdMul: 1.05,
    windupMs: 40,
    kb: 0.8,
    stunMs: 0,
    finisher: { mult: 1.4, label: "꿰뚫기", range: 58 },
  },
  combo: {
    id: "combo",
    name: "연타",
    desc: "가까이서 두 번 빠르게 때린다. 3번째는 세 번 연속.",
    area: { range: 22, arcDeg: 100 },
    hits: 2,
    hitGapMs: 90,
    mult: 0.5,
    cdMul: 1,
    windupMs: 0,
    kb: 0.5,
    stunMs: 0,
    finisher: { mult: 1.1, label: "난타", hits: 3 },
  },
  shot: {
    id: "shot",
    name: "쏘기",
    desc: "멀리 쏜다. 처음 맞은 적에서 멈춘다. 3번째는 세 갈래로.",
    area: { range: 120, arcDeg: 34 },
    hits: 1,
    hitGapMs: 0,
    mult: 0.95,
    cdMul: 1.1,
    windupMs: 0,
    kb: 0.6,
    stunMs: 0,
    projectile: { speed: 260, pierce: 0 },
    finisher: { mult: 1.1, label: "세 갈래", spread: 3 },
  },
  magic: {
    id: "magic",
    name: "범위 마법",
    desc: "앞쪽 적 발밑에 잉크를 터뜨려 둘레를 모두 친다. 3번째는 더 크게.",
    area: { range: 80, arcDeg: 70 },
    hits: 1,
    hitGapMs: 0,
    mult: 0.8,
    cdMul: 1.25,
    windupMs: 200,
    kb: 0.7,
    stunMs: 60,
    blast: 20,
    finisher: { mult: 1.3, label: "잉크 폭발", blast: 30 },
  },
  card: {
    id: "card",
    name: "던지기",
    desc: "카드를 날려 지나가는 적을 모두 긁는다. 3번째는 세 장.",
    area: { range: 100, arcDeg: 30 },
    hits: 1,
    hitGapMs: 0,
    mult: 1,
    cdMul: 1.15,
    windupMs: 0,
    kb: 0.6,
    stunMs: 0,
    projectile: { speed: 300, pierce: 99 },
    finisher: { mult: 1.2, label: "카드 세 장", spread: 3 },
  },
};

/** 몇 번째 연속 공격이 마무리인가 (1, 2, 3 → 3번째) */
export const FINISHER_EVERY = 3;
/** 이 시간 안에 다음 공격을 해야 연속으로 친다 (공격 간격에 더하는 여유) */
export const CHAIN_GRACE_MS = 450;

export function weaponStyleOf(g: Pick<GearDef, "style"> | undefined): WeaponStyle {
  return WEAPON_STYLES[g?.style ?? "swing"];
}

/** 무기의 범위: 장비에 따로 적혀 있으면 그것, 아니면 공격 방식의 기본 */
export function weaponArea(g: Pick<GearDef, "style" | "area"> | undefined): { range: number; arcDeg: number } {
  return g?.area ?? weaponStyleOf(g).area;
}

/** 공격 간격 ms (공격 속도 aspd = 초당 횟수) */
export function attackCooldownMs(aspd: number, style: WeaponStyle): number {
  return (1000 / Math.max(0.1, aspd)) * style.cdMul;
}

/**
 * 한 마리 기준 초당 피해 배율 (기본 휘두르기 = 1, 마무리 포함 평균).
 * 범위가 넓은 무기(마법)는 낮게, 한 마리만 치는 무기는 비슷하게 둔다 → 테스트가 0.6~1.25 안에 있는지 본다.
 */
export function dpsFactor(style: WeaponStyle): number {
  const normal = style.mult * style.hits;
  const fin = style.mult * style.finisher.mult * (style.finisher.hits ?? style.hits);
  const avg = (normal * (FINISHER_EVERY - 1) + fin) / FINISHER_EVERY;
  return avg / style.cdMul;
}

/** 장비창 설명 한 줄: "찌르기 · 사거리 44 · 길고 좁게 찔러…" */
export function weaponStyleText(g: Pick<GearDef, "kind" | "style" | "area">): string | null {
  if (g.kind !== "weapon") return null;
  const st = weaponStyleOf(g);
  const a = weaponArea(g);
  const reach = st.projectile ? `사거리 ${a.range}` : st.blast ? `시전 ${a.range} · 폭발 ${st.blast}` : `범위 ${a.range} · ${a.arcDeg}°`;
  const speed = st.cdMul > 1.15 ? " · 느림" : st.cdMul < 1 ? " · 빠름" : "";
  return `${st.name} · ${reach}${st.hits > 1 ? ` · ${st.hits}연타` : ""}${speed} — ${st.desc}`;
}
