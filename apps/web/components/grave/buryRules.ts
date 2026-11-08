import { parseYmd } from "@/lib/epitaph";
import type { CauseTag, GraveInput } from "@/lib/types";

// 묘비 세우기 폼 규칙. 서버(lib/validate.ts)와 같은 기준(글자 수는 코드포인트)으로 미리 알려 준다.

export const LIMITS = { name: 40, lastTask: 20, causeDetail: 200, epitaph: 30, links: 3, stack: 5, stackTag: 20 } as const;

export type BuryValues = {
  name: string;
  bornAt: string;
  diedAt: string;
  lastTask: string;
  causes: CauseTag[];
  causeDetail: string;
  epitaph: string;
  /** 빈 칸 포함 (입력칸 그대로) */
  links: string[];
  stack: string[];
};

export type BuryErrors = Partial<Record<keyof BuryValues, string>>;

export const charCount = (s: string) => [...s].length;

function isHttpUrl(s: string): boolean {
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function dateError(value: string, today: string, label: string): string | undefined {
  if (!value) return `${label}을 골라 주세요.`;
  if (Number.isNaN(parseYmd(value))) return "날짜 형식이 올바르지 않아요.";
  if (value > today) return "미래 날짜는 고를 수 없어요.";
  return undefined;
}

/** today: KST 기준 YYYY-MM-DD */
export function validateBury(v: BuryValues, today: string): BuryErrors {
  const name = v.name.trim();
  const epitaph = v.epitaph.trim();
  const links = filledLinks(v.links);
  const bornError = dateError(v.bornAt, today, "탄생일");
  const errors: BuryErrors = {
    name: !name
      ? "프로젝트 이름을 적어 주세요."
      : charCount(name) > LIMITS.name
        ? `${LIMITS.name}자까지 적을 수 있어요.`
        : undefined,
    bornAt: bornError,
    diedAt:
      dateError(v.diedAt, today, "사망일") ??
      (!bornError && v.diedAt < v.bornAt ? "사망일은 탄생일보다 빠를 수 없어요." : undefined),
    lastTask: charCount(v.lastTask.trim()) > LIMITS.lastTask ? `${LIMITS.lastTask}자까지 적을 수 있어요.` : undefined,
    causes: v.causes.length === 0 ? "사인을 하나 이상 골라 주세요." : undefined,
    causeDetail:
      charCount(v.causeDetail.trim()) > LIMITS.causeDetail ? `${LIMITS.causeDetail}자까지 적을 수 있어요.` : undefined,
    epitaph: !epitaph
      ? "묘비명을 적어 주세요."
      : charCount(epitaph) > LIMITS.epitaph
        ? `${LIMITS.epitaph}자까지 적을 수 있어요.`
        : undefined,
    links: links.some((l) => !isHttpUrl(l))
      ? "http:// 또는 https:// 로 시작하는 주소만 쓸 수 있어요."
      : links.length > LIMITS.links
        ? `링크는 ${LIMITS.links}개까지예요.`
        : undefined,
    stack: v.stack.length > LIMITS.stack ? `기술 스택은 ${LIMITS.stack}개까지예요.` : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as BuryErrors;
}

/** 태그 하나를 다듬는다. 쓸 수 없으면 null */
export function normalizeTag(raw: string, existing: readonly string[]): string | null {
  const tag = raw.trim().replace(/^#/, "").replace(/\s+/g, " ");
  if (!tag || charCount(tag) > LIMITS.stackTag || existing.length >= LIMITS.stack) return null;
  if (existing.some((t) => t.toLowerCase() === tag.toLowerCase())) return null;
  return tag;
}

const filledLinks = (links: readonly string[]) => links.map((l) => l.trim()).filter(Boolean);

/** PATCH도 전체 덮어쓰기라 비운 칸은 빼고 보낸다 */
export function toGraveInput(v: BuryValues, mourner: string, imageUrl: string | undefined): GraveInput {
  const lastTask = v.lastTask.trim();
  const causeDetail = v.causeDetail.trim();
  const links = filledLinks(v.links);
  return {
    name: v.name.trim(),
    epitaph: v.epitaph.trim(),
    bornAt: v.bornAt,
    diedAt: v.diedAt,
    causes: v.causes,
    mourner,
    ...(lastTask && { lastTask }),
    ...(causeDetail && { causeDetail }),
    ...(links.length > 0 && { links }),
    ...(v.stack.length > 0 && { stack: v.stack }),
    ...(imageUrl && { imageUrl }),
  };
}
