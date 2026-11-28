import { campRaftOfSpot, RAFT_AUTO_EVERY_MS, RAFT_GEAR_TIER_NAME, type FishWater, type RaftGearTier } from "@tomb/protocol";
import { GRADE_LABEL, WATER_WHERES, type Species } from "./catalog";
import { BITE_MAX_MS, BITE_MIN_MS, candidates, conditionsAt, hash01, reelMinMs, rollSize10, sizeText, weightOf, type Cond } from "./rules";

// 자동 낚시 규칙 (순수 함수 — 서버가 쓰고 테스트한다).
// 클라이언트 프레임이 아니라 서버 시각으로 센다: 켤 때 세션(시작 시각·자리·채널·물 종류·시드)을 저장하고,
// "살아 있다"는 신호(정산 요청·머무르기 기록 /api/me/presence)가 올 때마다 직전 신호와의 간격을 접속 구간으로 쌓는다.
//  - 간격이 AUTO_BEAT_GAP_MS 이하면 그동안 접속해 있던 것으로 본다 (숨은 탭은 머무르기 기록이 30분마다 온다)
//  - 그보다 길면 끊겼던 것으로 보고 그 구간은 세지 않는다
// 접속 구간을 이어 붙인 시간 AUTO_FISH_EVERY_MS마다 찌를 한 번 올리고, 그때 AUTO_CATCH_CHANCE 확률로 한 마리가 걸린다.
// k번째 시도는 그 시간이 채워진 "그 시각"의 시간대·날씨·계절로 세션 시드 + 번호로 결정적으로 굴린다
// (걸렸는지도 시드 + 번호로) → 같은 정산을 다시 계산해도 결과가 같다.
// 11/19 「편하게 노는 게임」 개편: 하루 75마리 한도를 없앴다. 대신 시도마다 25%만 걸려 직접 낚시보다 확실히 느리다.

/** 직접 낚을 때 한 마리 평균 (입질 평균 + 보통 손맛(2)의 최소 감기 시간) */
export const DIRECT_FISH_AVG_MS = (BITE_MIN_MS + BITE_MAX_MS) / 2 + reelMinMs(2);
/** 자동 낚시는 직접 낚을 때 평균의 2.5배마다 찌를 한 번 올린다 (30초) */
export const AUTO_FISH_EVERY_MS = Math.round(DIRECT_FISH_AVG_MS * 2.5);
/**
 * 11/19 자동 낚시 한 번에 걸릴 확률. 직접 낚시는 입질이 늘 오고 손으로 감으면 거의 다 낚는다.
 * 자동은 30초마다 25% → 평균 2분에 한 마리 (한 시간 약 30마리, 직접 낚시 평균 12초의 약 1/10)
 */
export const AUTO_CATCH_CHANCE = 0.25;
/**
 * 11/22 운영자: 한 세션 6시간 제한(예전 AUTO_FISH_MAX_MS)을 없앴다. 끝나는 것은 끄기(움직임·일어남·탭 닫기 — AUTO_BEAT_GAP_MS)와
 * 바닷가 갯바위 물때(tide)뿐이고, 가방이 가득 차면 팔 때까지 쉰다. 저장 값 end는 그대로 두되(JSON에 Infinity를 못 넣는다) 물때가 아니면 이 값 —
 * 사실상 끝이 없다 (Date가 나타낼 수 있는 가장 먼 시각)
 */
export const AUTO_NO_END = 8.64e15;
/**
 * 신호 사이가 이보다 길면 끊긴 것으로 본다 (숨은 탭의 머무르기 기록 30분 간격 + 타이머 지연 여유.
 * 머무르기 몰아서 정산 창 PRESENCE_CATCHUP_WINDOW_MS와 같다. 탭을 닫으면 자동 낚시는 꺼진다)
 */
export const AUTO_BEAT_GAP_MS = 40 * 60_000;
/** 접속 구간 기록 개수 상한 (끊겼다 붙었다를 아주 많이 해도 세션 값이 커지지 않게) */
export const AUTO_SEGS_MAX = 64;
/** 보이는 동안 정산 주기 (클라이언트. 서버가 접속 시간으로 세므로 늦게 물어도 몫은 같다 — Redis 명령을 아끼려고 90초 → 3분) */
export const AUTO_SYNC_MS = 3 * 60_000;
/**
 * 11/27 운영자 「자동 낚시로 잡으면 일어나야 갱신되는 게 아니라 실시간으로」: 서버가 다음에 걸리는 찌까지 남은 시간(hitInMs)을 알려 주고,
 * 화면은 그 순간 바로 뒤에만 정산을 부른다 → 걸린 수만큼만 요청 (보통 자리 평균 2분, 내 좌대 평균 1분에 한 번). 그사이엔 AUTO_SYNC_MS 그대로
 */
export const AUTO_HIT_SLACK_MS = 1_500;
/** 다음 걸리는 찌를 이 횟수까지만 찾는다 (없으면 null — AUTO_SYNC_MS로) */
export const AUTO_HIT_LOOK = 40;

export type AutoSession = {
  v: 1;
  /** 결정적 난수 시드 */
  seed: number;
  spot: string;
  water: FishWater;
  /** 켤 때 있던 채널 (모르면 null) */
  ch: number | null;
  start: number;
  /** 이 시각 뒤로는 세지 않는다. 11/22부터 바닷가 물때(tide)일 때만 실제 시각, 아니면 AUTO_NO_END (예전 세션의 start + 6시간은 읽을 때 지운다) */
  end: number;
  /** 마지막 신호 시각 */
  beat: number;
  /** 접속해 있던 구간 [시작, 끝] (시각 오름차순) */
  segs: [number, number][];
  /** 정산까지 마친 시도 번호 (1부터, 놓친 것 포함) */
  done: number;
  /** 11/16 바닷가 갯바위: end가 물이 빠지는 때 (끝나면 ended "tide") */
  tide?: true;
  /** 11/27 찌 올리는 간격 (ms). 없으면 AUTO_FISH_EVERY_MS. 한 세션은 처음부터 끝까지 같은 간격 (번호·시각 계산이 안 꼬이게) */
  every?: number;
  /** 11/27 내 좌대(입장권) 세션: end가 입장권 끝 (끝나면 ended "raft", 연장하면 end를 늘린다) */
  raft?: { ch: number; n: number };
};

/** 그 세션의 찌 올리는 간격 */
export const everyOf = (s: Pick<AutoSession, "every">): number => (typeof s.every === "number" && s.every >= 5_000 ? s.every : AUTO_FISH_EVERY_MS);

export function newAutoSession(seed: number, spot: string, water: FishWater, ch: number | null, now: number): AutoSession {
  return { v: 1, seed, spot, water, ch, start: now, end: AUTO_NO_END, beat: now, segs: [], done: 0 };
}

/** 저장 문자열 → 세션 (형식이 이상하면 null) */
export function parseAutoSession(raw: string | null): AutoSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as AutoSession;
    if (s?.v !== 1 || !Number.isFinite(s.start) || !Number.isFinite(s.beat) || !Array.isArray(s.segs)) return null;
    // 11/22 시간 제한 없음: 물때로 끝나는 세션만 end를 지킨다 (6시간 제한 때 저장된 세션도 시간 때문에 끝나지 않게)
    // 11/27 좌대 입장권 세션도 end(입장권 끝)를 지킨다
    if ((!s.tide && !s.raft) || !Number.isFinite(s.end)) s.end = AUTO_NO_END;
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

/** 지금까지 찌를 올린 수 (정산 여부와 상관없이, 접속 시간 기준 — 놓친 것 포함) */
export const autoTriesTotal = (s: AutoSession) => Math.floor(autoAliveMs(s) / everyOf(s));

/** 다음 찌 올리기까지 남은 접속 시간 (ms) */
export const autoNextInMs = (s: AutoSession) => everyOf(s) - (autoAliveMs(s) % everyOf(s));

/** k번째(1부터) 시도에 걸렸는지 (시드 + 번호로 결정적 — 다시 정산해도 같다) */
export const autoHit = (seed: number, k: number) => hash01(`auto|${seed}|${k}|hit`) < AUTO_CATCH_CHANCE;

/** 11/27 다음에 걸리는 찌까지 남은 접속 시간 (ms). AUTO_HIT_LOOK번 안에 없으면 null (무엇이 걸리는지는 정산 때 굴린다) */
export function autoHitInMs(s: AutoSession): number | null {
  const every = everyOf(s);
  const alive = autoAliveMs(s);
  const total = Math.floor(alive / every);
  for (let k = total + 1; k <= total + AUTO_HIT_LOOK; k++) if (autoHit(s.seed, k)) return k * every - alive;
  return null;
}

/** k번째(1부터) 시도 시각: 접속 구간을 이어 붙여 k × AUTO_FISH_EVERY_MS가 채워지는 순간 */
export function autoCatchTimes(s: AutoSession, from: number, to: number): number[] {
  const out: number[] = [];
  const every = everyOf(s);
  let cum = 0;
  let k = from;
  for (const [a, b] of s.segs) {
    const len = b - a;
    while (k <= to && k * every <= cum + len) {
      out.push(a + (k * every - cum));
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
 * k번째 시도에 걸린 물고기: 그 시각의 조건으로, 시드 + 번호로 결정적으로 (같은 입력 → 같은 결과). 걸렸는지는 autoHit.
 * 크기는 직접 낚을 때와 같은 분포(rollSize10). 내 도감 최대 기록에는 들어가고, 최대어 순위에는 넣지 않는다
 */
/** 11/26 자동 낚시로 낚일 수 있는 것 (그 물·조건에서 — 캠핑장 희귀 이상 새 물고기 directOnly는 빼요) */
export const autoCandidates = (water: FishWater, cond: Cond): Species[] => candidates("fish", WATER_WHERES[water], cond, (s) => !s.directOnly);

export function rollAutoCatch(seed: number, k: number, water: FishWater, at: number, cond: Cond = conditionsAt(at)) {
  const s = pickAuto(autoCandidates(water, cond), hash01(`auto|${seed}|${k}|sp`));
  if (!s) return null;
  return { id: s.id, size: rollSize10(s, hash01(`auto|${seed}|${k}|sz`)), at };
}

/**
 * 11/22 터치 화면 위쪽 자동 낚시 칩 글귀 (낚시 창을 접어 둔 동안): 「자동 낚시 중 · 3마리」.
 * 가방이 가득 차면 쉰다고. 11/28 운영자 「설명이 1분으로 돼 있다」: 다음 찌까지 남은 시간(30초 주기)을 분으로 반올림해 「다음 약 1분」으로 보였다 → 빼고 낚은 수만
 */
export function autoChipText(today: number, nextMs: number | null, full: boolean, raftEvery?: number): { head: string; count: string; next: string } {
  if (full) return { head: raftEvery ? "좌대 자동 낚시" : "자동 낚시", count: "가방 가득", next: `쉬는 중 · ${today}마리` };
  // 11/27 내 좌대: 보통 자리보다 빠르다는 걸 보여 준다 (운영자 「좌대에서 속도 개편된 거 맞아?」).
  // 11/28 운영자 「15초마다 찌를 올려요 어색함」 → 표준 용어 「속도 2배」 (간격 숫자는 protocol RAFT_AUTO_EVERY_MS — 화면엔 안 쓴다). 좁은 화면에서도 낚은 수가 보이게 head에 붙인다
  if (raftEvery) return { head: `좌대 자동 낚시 중 · ${RAFT_SPEED_TEXT}`, count: `${today}마리`, next: "" };
  void nextMs;
  return { head: "자동 낚시 중", count: `${today}마리`, next: "" };
}

/** 자동 낚시 안내. 11/28 운영자 「구구절절 계속 나온다」: 알림에서는 빼고 낚시 창 [자동 낚시 켜기] 도움말(autoTip) 한 곳에만 */
export const AUTO_RANK_NOTE = "자동으로 낚은 물고기는 최대어 순위에 안 올라가요.";
/** 11/26 캠핑장 물인지 (자동 낚시 안내) */
export const isCampWater = (w: FishWater): boolean => w === "valley" || w === "pool" || w === "reservoir" || w === "rowboat";
/** 11/28 좌대 자동 낚시 빠르기 (표준 용어 — 실제 간격은 protocol RAFT_AUTO_EVERY_MS 15초 = 보통 AUTO_FISH_EVERY_MS 30초의 절반) */
export const RAFT_SPEED_TEXT = `속도 ${Math.round(AUTO_FISH_EVERY_MS / RAFT_AUTO_EVERY_MS)}배`;
/** 11/28 운영자: 자동 낚시가 끝날 때(일어남·끄기·물때·입장권 끝) 한 줄 — 「자동 낚시 끝. 12마리 낚았어요.」, 못 낚았으면 「자동 낚시 끝」 */
export const autoEndText = (caught: number): string => (caught > 0 ? `자동 낚시 끝. ${caught}마리 낚았어요.` : "자동 낚시 끝");

/**
 * 11/28 [자동 낚시 켜기] 도움말 (운영자: 짧게, 초 숫자 없이). 캠핑장 물이면 희귀 물고기 안내를 최대어 안내와 한 문장으로 묶는다
 * (11/26 캠핑장 희귀 이상 새 물고기는 직접 낚시로만 — catalog directOnly)
 */
export function autoTip(water: FishWater, raft: boolean): string {
  const head = `자리를 비워도 접속해 있는 동안 자동으로 낚아요.${raft ? ` 좌대에서는 ${RAFT_SPEED_TEXT}예요.` : ""}`;
  if (!isCampWater(water)) return `${head} ${AUTO_RANK_NOTE}`;
  return `${head} 최대어 순위와 캠핑장 희귀 물고기는 ${raft ? "좌대 밖에서 " : ""}직접 낚아야 해요.`;
}
/** 11/28 좌대 낚시 자리는 자동 낚시만 (운영자 「좌대에서는 자동낚시만 가능하게」) — 서버 castLine·reelIn이 막고, 낚시 창은 찌 던지기를 뺀다 */
export const RAFT_AUTO_ONLY_MSG = "좌대에서는 자동 낚시만 할 수 있어요.";
/** 좌대 낚시 창 안내 한 줄 (자동 낚시를 켜기 전 — 11/28 운영자 문구 그대로) */
export const RAFT_AUTO_ONLY_LINE = "좌대에서는 자동 낚시만 할 수 있고, 속도는 일반 자리의 2배예요.";
/** 그 낚시 자리가 좌대 자리인지 (직접 낚시 막기 — 입장권 판매가 꺼진 서버에서도 좌대는 자동 낚시만) */
export const isRaftAutoOnly = (spotId: string): boolean => campRaftOfSpot(spotId) !== null;
/** 11/28 낚시 창 모양 (FishingPanel): 좌대 자리면 [찌 던지기]·던지는 조작 안내를 빼고 「자동 낚시만」 한 줄. 보통 자리면 그대로 */
export const fishPanelOf = (spotId: string): { cast: boolean; note: string | null } =>
  isRaftAutoOnly(spotId) ? { cast: false, note: RAFT_AUTO_ONLY_LINE } : { cast: true, note: null };

/**
 * 11/28 자동 낚시 알림 한 줄 (운영자 「안내문이 너무 길다」): 한 마리면 「블루길 9.7cm」, 여러 마리면 「3마리 · 블루길 외 2」,
 * 새로 도감에 올랐으면 「 · 새 도감 +3P」. 대물·월척은 붙어 있을 때만 (자동 낚시엔 없다). 없으면 빈 문자열 (알림 없음).
 * 앞에 세울 한 마리 = 새 도감 → 새 기록 → 큰 것 순. dex = 이번 정산의 도감 처음 등록 보상 (받은 P · 지갑이 꽉 차 못 받은 P)
 */
export function autoCatchLine(
  items: readonly { id: string; isNew: boolean; size?: number; record?: boolean; grade?: 0 | 1 | 2 }[],
  nameOf: (id: string) => string,
  dex?: { earned: number; pending: number },
): string {
  if (!items.length) return "";
  const first = [...items].sort((a, b) => Number(b.isNew) - Number(a.isNew) || Number(!!b.record) - Number(!!a.record) || (b.size ?? 0) - (a.size ?? 0))[0];
  const head =
    items.length === 1
      ? [nameOf(first.id), sizeText(first.size ?? 0), first.grade ? GRADE_LABEL[first.grade] : ""].filter(Boolean).join(" ")
      : `${items.length}마리 · ${nameOf(first.id)} 외 ${items.length - 1}`;
  if (!items.some((i) => i.isNew)) return head;
  const earned = dex?.earned ?? 0;
  return `${head} · 새 도감${earned > 0 ? ` +${earned}P` : dex?.pending ? " (보상은 도감 창에서)" : ""}`;
}

/** 11/28 좌대 코디 알림 (따로 띄운다): 「좌대 코디 「붕어 털모자」 7일 획득」 */
export const raftGearText = (g: { name: string; tier: RaftGearTier }): string => `좌대 코디 「${g.name}」 ${RAFT_GEAR_TIER_NAME[g.tier]} 획득`;

/** 11/28 이 응답으로 꾸미기를 새로 받았는지 (물에 빠진 꾸미기 kept · 좌대 코디) → 내 정보를 새로 받아 가방 [꾸미기]·[지금 모습]에 바로 보이게 */
export function gotCosmetic(r: { gear?: readonly { kept: boolean }[] | { kept: boolean } | null; raftGear?: readonly unknown[] | null }): boolean {
  const gear = r.gear ? (Array.isArray(r.gear) ? r.gear : [r.gear]) : [];
  return gear.some((g: { kept: boolean }) => g.kept) || (r.raftGear?.length ?? 0) > 0;
}

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
