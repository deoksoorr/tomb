import { ageDays, parseYmd, suggestEpitaph } from "@/lib/epitaph";
import {
  LIFESPAN_PRESETS,
  type CauseTag,
  type GraveInput,
  type LifespanId,
  type PublicGrave,
  type QuickGraveInput,
} from "@/lib/types";

// 간단 묘비 세우기: 이름 · 얼마나 살았나 · (사인) · (묘비명). 글자 수는 서버와 같이 코드포인트 기준.

export const LIMITS = { name: 40, epitaph: 30 } as const;

export type QuickValues = { name: string; lived: LifespanId | null; cause: CauseTag | null; epitaph: string };
export type QuickErrors = Partial<Record<"name" | "lived" | "epitaph", string>>;

export const charCount = (s: string) => [...s].length;

export function livedDays(id: LifespanId): number {
  return LIFESPAN_PRESETS.find((p) => p.id === id)?.days ?? 1;
}

/** 기존 묘비의 향년에 가장 가까운 선택지 (수정할 때 미리 골라 둔다) */
export function nearestLifespan(age: number): LifespanId {
  return LIFESPAN_PRESETS.reduce((best, p) => (Math.abs(p.days - age) < Math.abs(best.days - age) ? p : best)).id;
}

export function validateQuick(v: QuickValues): QuickErrors {
  const name = v.name.trim();
  const errors: QuickErrors = {
    name: !name
      ? "프로젝트 이름을 적어 주세요."
      : charCount(name) > LIMITS.name
        ? `${LIMITS.name}자까지 적을 수 있어요.`
        : undefined,
    lived: v.lived ? undefined : "얼마나 살았는지 골라 주세요.",
    epitaph: charCount(v.epitaph.trim()) > LIMITS.epitaph ? `${LIMITS.epitaph}자까지 적을 수 있어요.` : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, m]) => m)) as QuickErrors;
}

/** 새 묘비: 묘비명을 비우면 서버가 `향년 N일, 조용히 별세`를 넣는다 */
export function toQuickInput(v: QuickValues & { lived: LifespanId }, mourner: string): QuickGraveInput {
  const epitaph = v.epitaph.trim();
  return {
    name: v.name.trim(),
    lived: v.lived,
    mourner,
    ...(v.cause && { cause: v.cause }),
    ...(epitaph && { epitaph }),
  };
}

const DAY = 86_400_000;
export const addDays = (ymd: string, days: number) => new Date(parseYmd(ymd) + days * DAY).toISOString().slice(0, 10);

/**
 * 수정(PATCH 전체 교체): 최소 폼 값만 바꾸고 나머지(링크·사진·상주…)는 기존 값을 그대로 보낸다.
 * 생존 기간을 바꾸지 않았으면 원래 날짜를, 바꿨으면 사망일은 두고 탄생일을 다시 셈한다.
 * 사인을 그대로 두면 원래 사인들(여러 개일 수 있음)을 지킨다.
 */
export function toEditInput(grave: PublicGrave, v: QuickValues): GraveInput {
  const original = nearestLifespan(grave.ageDays);
  const lived = v.lived ?? original;
  const bornAt = lived === original ? grave.bornAt : addDays(grave.diedAt, -(livedDays(lived) - 1));
  const causes = v.cause === (grave.causes[0] ?? null) ? grave.causes : [v.cause ?? "other"];
  return {
    name: v.name.trim(),
    epitaph: v.epitaph.trim() || suggestEpitaph(ageDays(bornAt, grave.diedAt), grave.lastTask),
    bornAt,
    diedAt: grave.diedAt,
    causes,
    mourner: grave.mourner,
    ...(grave.lastTask && { lastTask: grave.lastTask }),
    ...(grave.causeDetail && { causeDetail: grave.causeDetail }),
    ...(grave.links?.length && { links: grave.links }),
    ...(grave.stack?.length && { stack: grave.stack }),
    ...(grave.imageUrl && { imageUrl: grave.imageUrl }),
  };
}
