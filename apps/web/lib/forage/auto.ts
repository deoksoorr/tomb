import type { Species } from "./catalog";
import { BITE_MAX_MS, BITE_MIN_MS, candidates, conditionsAt, hash01, reelMinMs, rollSize10, sizeText, weightOf, type Cond } from "./rules";

// 자동 낚시 규칙 (순수 함수 — 서버가 쓰고 테스트한다).
// 클라이언트 프레임이 아니라 서버 시각으로 센다: 켤 때 세션(시작 시각·자리·채널·물 종류·시드)을 저장하고,
// "살아 있다"는 신호(정산 요청·머무르기 기록 /api/me/presence)가 올 때마다 직전 신호와의 간격을 접속 구간으로 쌓는다.
//  - 간격이 AUTO_BEAT_GAP_MS 이하면 그동안 접속해 있던 것으로 본다 (숨은 탭은 머무르기 기록이 10분마다 온다)
//  - 그보다 길면 끊겼던 것으로 보고 그 구간은 세지 않는다
// 접속 구간을 이어 붙인 시간 AUTO_FISH_EVERY_MS마다 한 마리. k번째 물고기는 그 시간이 채워진 "그 시각"의 시간대·날씨·계절로
// 세션 시드 + 번호로 결정적으로 굴린다 → 같은 정산을 다시 계산해도 결과가 같다.

/** 직접 낚을 때 한 마리 평균 (입질 평균 + 보통 손맛(2)의 최소 감기 시간) */
export const DIRECT_FISH_AVG_MS = (BITE_MIN_MS + BITE_MAX_MS) / 2 + reelMinMs(2);
/** 자동 낚시는 직접 낚을 때 평균의 2.5배마다 한 마리 */
export const AUTO_FISH_EVERY_MS = Math.round(DIRECT_FISH_AVG_MS * 2.5);
/** 자동 낚시 하루 한도 (한국 시간 새벽 5시 초기화, 하루 전체 낚시 한도 DAILY_CATCH_MAX.fish 안에서) */
export const AUTO_FISH_DAILY_MAX = 75;
/** 한 세션 최대 길이 (켠 시각부터) */
export const AUTO_FISH_MAX_MS = 6 * 3_600_000;
/** 신호 사이가 이보다 길면 끊긴 것으로 본다 (머무르기 기록 10분 간격 + 숨은 탭 타이머 지연 여유) */
export const AUTO_BEAT_GAP_MS = 13 * 60_000;
/** 접속 구간 기록 개수 상한 (끊겼다 붙었다를 아주 많이 해도 세션 값이 커지지 않게) */
export const AUTO_SEGS_MAX = 64;
/** 보이는 동안 정산 주기 (클라이언트) */
export const AUTO_SYNC_MS = 90_000;

export type AutoSession = {
  v: 1;
  /** 결정적 난수 시드 */
  seed: number;
  spot: string;
  water: "lake" | "river";
  /** 켤 때 있던 채널 (모르면 null) */
  ch: number | null;
  start: number;
  /** 이 시각 뒤로는 세지 않는다 (start + AUTO_FISH_MAX_MS) */
  end: number;
  /** 마지막 신호 시각 */
  beat: number;
  /** 접속해 있던 구간 [시작, 끝] (시각 오름차순) */
  segs: [number, number][];
  /** 정산까지 마친 물고기 번호 (1부터, 한도로 못 받은 것 포함) */
  done: number;
};

export function newAutoSession(seed: number, spot: string, water: "lake" | "river", ch: number | null, now: number): AutoSession {
  return { v: 1, seed, spot, water, ch, start: now, end: now + AUTO_FISH_MAX_MS, beat: now, segs: [], done: 0 };
}

/** 저장 문자열 → 세션 (형식이 이상하면 null) */
export function parseAutoSession(raw: string | null): AutoSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as AutoSession;
    if (s?.v !== 1 || !Number.isFinite(s.start) || !Number.isFinite(s.beat) || !Array.isArray(s.segs)) return null;
    return s;
  } catch {
    return null;
  }
}

/** 신호: 직전 신호부터 now(세션 끝에서 자름)까지가 간격 이하면 접속 구간으로 붙인다. 새 세션을 돌려준다 */
export function beatAuto(s: AutoSession, now: number): AutoSession {
  const t = Math.min(now, s.end);
  if (t <= s.beat) return s;
  const gap = t - s.beat;
  const segs = s.segs.map((x) => [x[0], x[1]] as [number, number]);
  if (gap <= AUTO_BEAT_GAP_MS) {
    const last = segs[segs.length - 1];
    if (last && last[1] === s.beat) last[1] = t;
    else segs.push([s.beat, t]);
    // 너무 많아지면 가장 앞 두 구간을 하나로 (앞 구간은 이미 정산된 번호라 시각이 조금 틀어져도 상관없다 — 길이 합은 그대로)
    while (segs.length > AUTO_SEGS_MAX) {
      const [a, b] = segs.splice(0, 2);
      segs.unshift([b[0] - (a[1] - a[0]), b[1]]);
    }
  }
  return { ...s, segs, beat: t };
}

/** 접속해 있던 시간 합 (ms) */
export const autoAliveMs = (s: AutoSession) => s.segs.reduce((n, [a, b]) => n + (b - a), 0);

/** 지금까지 낚은 수 (정산 여부와 상관없이, 접속 시간 기준) */
export const autoCaughtTotal = (s: AutoSession) => Math.floor(autoAliveMs(s) / AUTO_FISH_EVERY_MS);

/** 다음 한 마리까지 남은 접속 시간 (ms) */
export const autoNextInMs = (s: AutoSession) => AUTO_FISH_EVERY_MS - (autoAliveMs(s) % AUTO_FISH_EVERY_MS);

/** k번째(1부터) 물고기가 낚인 시각: 접속 구간을 이어 붙여 k × AUTO_FISH_EVERY_MS가 채워지는 순간 */
export function autoCatchTimes(s: AutoSession, from: number, to: number): number[] {
  const out: number[] = [];
  let cum = 0;
  let k = from;
  for (const [a, b] of s.segs) {
    const len = b - a;
    while (k <= to && k * AUTO_FISH_EVERY_MS <= cum + len) {
      out.push(a + (k * AUTO_FISH_EVERY_MS - cum));
      k++;
    }
    cum += len;
    if (k > to) break;
  }
  return out;
}

/** 자동 낚시의 희귀(★3 이상) 무게 배율: 희귀·전설이 나올 확률이 직접 낚을 때의 정확히 절반이 되게 */
export function autoRareFactor(list: readonly Species[]): number {
  let common = 0;
  let rare = 0;
  for (const s of list) {
    if (s.rarity >= 3) rare += weightOf(s);
    else common += weightOf(s);
  }
  // 흔한 것이 하나도 없으면 줄일 수 없다 (희귀만 사는 곳이면 그대로)
  if (rare <= 0 || common <= 0) return 1;
  // f·R / (C + f·R) = R / (2(C + R))  →  f = C / (2C + R)
  return common / (2 * common + rare);
}

/** 자동 낚시용 무게 뽑기 (rand: [0,1)) */
export function pickAuto(list: readonly Species[], rand: number): Species | null {
  if (!list.length) return null;
  const f = autoRareFactor(list);
  const w = (s: Species) => weightOf(s) * (s.rarity >= 3 ? f : 1);
  const total = list.reduce((n, s) => n + w(s), 0);
  let x = rand * total;
  for (const s of list) if ((x -= w(s)) < 0) return s;
  return list[list.length - 1];
}

/**
 * k번째 물고기: 그 시각의 조건으로, 시드 + 번호로 결정적으로 (같은 입력 → 같은 결과).
 * 크기는 직접 낚을 때와 같은 분포(rollSize10). 내 도감 최대 기록에는 들어가고, 최대어 순위에는 넣지 않는다
 */
export function rollAutoCatch(seed: number, k: number, water: "lake" | "river", at: number, cond: Cond = conditionsAt(at)) {
  const s = pickAuto(candidates("fish", water, cond), hash01(`auto|${seed}|${k}|sp`));
  if (!s) return null;
  return { id: s.id, size: rollSize10(s, hash01(`auto|${seed}|${k}|sz`)), at };
}

/** "약 n분" / "곧" */
export function autoNextLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min >= 1 ? `약 ${min}분` : "곧";
}

/** 자동 낚시 안내 (낚시 창·결과 알림이 같이 쓴다) */
export const AUTO_RANK_NOTE = "자동 낚시로 낚은 물고기는 최대어 순위에 오르지 않아요(크기는 도감에 기록돼요)";

/**
 * 종류별 마릿수 요약: "월요병 붕어 5(최대 42.3cm), 야근 메기 1(새 도감·61.0cm) 외 2종".
 * 새로 등록한 것·도감 최대 기록을 새로 세운 것을 앞에, 그다음 많이 낚은 순. 크기가 있으면 그 종류에서 가장 큰 것을 붙인다
 */
export function autoSummary(
  items: readonly { id: string; isNew: boolean; size?: number; record?: boolean }[],
  nameOf: (id: string) => string,
  maxKinds = 5,
): string {
  const by = new Map<string, { n: number; isNew: boolean; max: number; record: boolean }>();
  for (const it of items) {
    const e = by.get(it.id) ?? { n: 0, isNew: false, max: 0, record: false };
    e.n++;
    e.isNew ||= it.isNew;
    e.record ||= !!it.record;
    e.max = Math.max(e.max, it.size ?? 0);
    by.set(it.id, e);
  }
  const rows = [...by].sort((a, b) => Number(b[1].isNew) - Number(a[1].isNew) || Number(b[1].record) - Number(a[1].record) || b[1].n - a[1].n);
  const head = rows.slice(0, maxKinds).map(([id, e]) => {
    const tags = [e.isNew && "새 도감", e.max > 0 && `${e.n > 1 ? "최대 " : ""}${sizeText(e.max)}`, e.record && "새 기록"].filter(Boolean);
    return `${nameOf(id)} ${e.n}${tags.length ? `(${tags.join("·")})` : ""}`;
  });
  const rest = rows.length - maxKinds;
  return head.join(", ") + (rest > 0 ? ` 외 ${rest}종` : "");
}
