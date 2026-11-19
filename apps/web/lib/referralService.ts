import { runAfter } from "./analyticsService";
import { notifyMe } from "./ban";
import { giftAccountCreatedAt, sendGift } from "./gifts";
import { HttpError } from "./http";
import {
  kstMonth,
  normalizeRefCode,
  randomRefCode,
  REF_ENTER_MS,
  REF_GIFT_FROM,
  REF_GIFT_NOTE_REFEREE,
  REF_GRAND_BUNDLE,
  REF_GRAND_ITEM,
  REF_GRAND_MONTH_CAP,
  refGiftNoteGrand,
  refGrandText,
  REF_MONTH_CAP,
  REF_DAY_MIN,
  REF_NEED_DAYS,
  REF_REWARD_BUNDLE,
  REF_REWARD_ITEM,
  refRewardText,
  refGiftNoteReferrer,
  type RefCheckResponse,
  type ReferralView,
  type RefDecision,
  type RefMode,
} from "./referralRules";
import { assessPair, memberLinks, type RequestSignals } from "./sameUser";
import { levelOfReasons, mergeReasons, parseReason, sameScore, type MemberLinks, type SameLevel } from "./sameUserRules";
import { isStaff } from "./staff";
import { getAccounts, NO_NAME } from "./store";
import { getReferrals, type GrandOpts, type ReferralRecord } from "./store/referrals";
import { getActivity } from "./store/userActivity";
import { STAY_TICK_MINUTES } from "./attendStay";
import { addDays } from "./gameDay";
import { kstDay } from "./store/accounts";
import { TITLES } from "./titles";
import { forgetTitles } from "./titlesServer";
import { grantRpgBundle } from "./rpgGift";
import { bundleText } from "./rewardText";
import type { GiftItem } from "./types";

// 추천 코드 판정·보상 (규칙은 lib/referralRules.ts, 같은 사람 판정은 lib/sameUser.ts). 조건 달성은 따로 도는 작업 없이 그때그때 본다:
// 새 이웃의 머무르기 기록(/api/me/presence)·내 정보 추천 칸(양쪽)·관리자 추천 탭에서. 달성 표시는 저장소가 한 번만 남긴다.
// 같은 사람 판정은 추천인을 정할 때 한 번, 조건 달성 때 다시 (그사이 쌓인 기기·IP·활동한 날·무리 신호까지) 본다

/** 칭호 (진행 수치 refs) 낮은 것부터 */
const REF_TITLES = TITLES.filter((t) => t.metric === "refs" && t.need !== undefined).sort((a, b) => a.need! - b.need!);
/** 무리 신호에서 같이 볼 추천인의 다른 이웃 수 (최근 먼저) */
const CLUSTER_LOOK = 30;

/** 이 계정의 공개 추천 코드 (없으면 만든다). 운영자는 null */
export async function ensureReferralCode(accountId: string): Promise<string | null> {
  if (await isStaff(accountId)) return null;
  const store = getReferrals();
  const had = await store.codeOf(accountId);
  if (had) return had;
  // 겹치면 다른 후보로 (31^6 ≈ 8.9억 칸이라 거의 한 번에 정해진다)
  for (let i = 0; i < 8; i++) {
    const code = await store.ensureCode(accountId, randomRefCode());
    if (code) return code;
  }
  throw new Error("[referral] 추천 코드를 만들지 못했어요.");
}

/** 입력 중 미리 확인: 있는 코드인지, 내 코드가 아닌지 (실제로 정할 때 다시 본다) */
export async function checkReferralCode(raw: unknown, viewerId: string | null): Promise<RefCheckResponse> {
  const code = normalizeRefCode(raw);
  if (!code) return { ok: false, reason: "코드는 영문과 숫자 6자예요." };
  const owner = await getReferrals().ownerOf(code);
  if (!owner || (await isStaff(owner))) return { ok: false, reason: "없는 추천 코드예요." };
  if (owner === viewerId) return { ok: false, reason: "내 코드는 넣을 수 없어요." };
  const [s] = await getAccounts().summaries([owner]);
  return { ok: true, code, name: s?.name ?? null };
}

/** 가입한 지 얼마나 됐는지 판정할 처음 입장 시각. 기록 전 옛 계정(시각 0인데 머문 기록·포인트가 있다)은 null = 너무 늦음 */
async function joinedAt(accountId: string, now: number): Promise<number | null> {
  const [s] = await getAccounts().summaries([accountId]);
  if (s && s.createdAt > 0) return s.createdAt;
  if (s && (s.stayMinutes > 0 || s.lifetimePoints > 0)) return null;
  return giftAccountCreatedAt(accountId, now);
}

/**
 * 무리 신호가 나왔으면 겹친 다른 이웃의 기록에도 같은 무리를 남긴다 (그 이웃이 나중에 조건을 넘기면 그 판정에 들어가고,
 * 이미 달성한 이웃은 관리자 화면에 보인다)
 */
async function spreadCluster(refereeId: string, reasons: readonly string[]): Promise<void> {
  const cl = reasons.map(parseReason).find((r) => r?.code === "cluster");
  if (!cl) return;
  const store = getReferrals();
  const members = [refereeId, ...cl.accounts];
  const recs = await store.getMany(cl.accounts);
  await Promise.all(
    recs.map((r) => {
      if (!r) return undefined;
      const others = members.filter((x) => x !== r.refereeId);
      return store.setReasons(r.refereeId, mergeReasons(r.reasons, [`cluster:${others.join(".")}`]));
    }),
  );
}

/**
 * 추천인 정하기 (가입할 때만 — 11/19 내 정보에서 뒤늦게 넣기(later)는 없앴다). 규칙에 안 맞으면 HttpError.
 * via는 화면이 보내는 값이라 시간으로도 막는다: 가입 뒤 REF_ENTER_MS(가입 화면이 바로 보내는 짧은 창) 안에서만
 * signals = 지금 요청의 IP·대역 해시 (lib/sameUser.ts requestSignals) — 같은 사람 판정의 가입 신호
 */
export async function enterReferral(
  refereeId: string,
  raw: unknown,
  signals: Pick<RequestSignals, "ip" | "net"> | null,
  via: "signup" | "later",
  now = Date.now(),
): Promise<void> {
  if (via !== "signup") throw new HttpError(409, "SIGNUP_ONLY", "추천 코드는 가입할 때만 넣을 수 있어요.");
  const code = normalizeRefCode(raw);
  if (!code) throw new HttpError(400, "BAD_CODE", "코드는 영문과 숫자 6자예요.");
  const store = getReferrals();
  if (await isStaff(refereeId)) throw new HttpError(403, "STAFF", "운영자 계정은 추천에 참여하지 않아요.");
  const referrerId = await store.ownerOf(code);
  if (!referrerId || (await isStaff(referrerId))) throw new HttpError(404, "NO_CODE", "없는 추천 코드예요.");
  if (referrerId === refereeId) throw new HttpError(409, "SELF", "내 코드는 넣을 수 없어요.");
  if (await store.get(refereeId)) throw new HttpError(409, "ALREADY", "추천인은 한 번만 정할 수 있어요.");
  const since = await joinedAt(refereeId, now);
  if (since === null || now - since > REF_ENTER_MS) throw new HttpError(409, "SIGNUP_ONLY", "추천 코드는 가입할 때만 넣을 수 있어요.");
  const siblings = await store.refereesOf(referrerId, CLUSTER_LOOK);
  // 판정에 실패해도 추천인은 정한다 (조건 달성 때 다시 본다)
  const reasons = await assessPair(refereeId, referrerId, now, { signup: signals, createdAt: since, siblings }).catch((e: unknown) => {
    console.error("[referral] 같은 사람 판정 실패", e);
    return [] as string[];
  });
  const r = await store.link({ refereeId, referrerId, at: now, via, ip: signals?.ip ?? null, same: levelOfReasons(reasons) === "same", reasons });
  if (r === "already") throw new HttpError(409, "ALREADY", "추천인은 한 번만 정할 수 있어요.");
  if (r === "cycle") throw new HttpError(409, "CYCLE", "나를 추천한 이웃의 추천인이 될 수는 없어요.");
  await spreadCluster(refereeId, reasons);
  presenceMemo().delete(refereeId);
}

/**
 * 11/18 새 이웃의 진행. days = 하루 1시간(REF_DAY_MIN) 넘게 머문 날 수 = 기록(act:hdays) + 옛 기준 날.
 *  - 옛 기준 날: 1시간 기록이 시작된 날(hourSince, 배포한 날) 전까지 들어온 날은 너그럽게 1시간 머문 날로 친다 (운영자가 확인하니까).
 *    다만 하루 기록(_stay — 2일 남는다)이 남은 오늘·어제는 실제 머문 분으로 본다
 *  - recent = 어제·오늘 머문 분 (관리자 점검용, 하루 기록이 남은 날만)
 */
export type RefProgress = {
  stayMinutes: number;
  days: number;
  hourDays: number;
  legacyDays: number;
  todayMin: number;
  recent: { day: string; min: number }[];
  name: string | null;
};
/** 옛 기준 날을 볼 때 거슬러 보는 최대 날 수 */
const LEGACY_LOOK_DAYS = 60;

async function progressOf(recs: readonly Pick<ReferralRecord, "refereeId" | "at">[], now = Date.now()): Promise<RefProgress[]> {
  if (!recs.length) return [];
  const ids = recs.map((r) => r.refereeId);
  const act = getActivity();
  const today = kstDay(now);
  const yesterday = addDays(today, -1);
  const [sums, hours, since, ticks] = await Promise.all([
    getAccounts().summaries(ids),
    act.hourDays(ids),
    act.hourSince(),
    getAccounts().stayTicksOn(ids, [yesterday, today]),
  ]);
  const start = since ?? today;
  return Promise.all(
    recs.map(async (r, i): Promise<RefProgress> => {
      const recent = [yesterday, today].map((day, j) => ({ day, min: (ticks[i]?.[j] ?? 0) * STAY_TICK_MINUTES }));
      let legacyDays = 0;
      // 11/19 가입한 날부터 센다 (추천 코드를 가입 뒤에 넣어도 그 사이 머문 날을 놓치지 않게). 가입 시각을 모르는 옛 계정은 추천 기록 시각
      const created = sums[i]?.createdAt ?? 0;
      const join = kstDay(created > 0 && created < r.at ? created : r.at);
      if (join <= start) {
        const days: string[] = [];
        for (let d = join; d <= start && days.length < LEGACY_LOOK_DAYS; d = addDays(d, 1)) days.push(d);
        const flags = await act.dayFlags(r.refereeId, days);
        for (let k = 0; k < days.length; k++) {
          if (flags[k].hour) continue; // 이미 기록(hourDays)에 들어 있다
          const known = recent.find((x) => x.day === days[k]);
          if (known ? known.min >= REF_DAY_MIN : flags[k].active) legacyDays++;
        }
      }
      const hourDays = hours[i] ?? 0;
      return {
        stayMinutes: sums[i]?.stayMinutes ?? 0,
        days: hourDays + legacyDays,
        hourDays,
        legacyDays,
        todayMin: recent[1].min,
        recent,
        name: sums[i]?.name ?? null,
      };
    }),
  );
}

export const isQualified = (p: { days: number }) => p.days >= REF_NEED_DAYS;

/** 보상 선물 보내기 (달성 표시는 이미 남았다 → 실패하면 기록만, 관리자 추천 탭에서 보고 직접 보낼 수 있다) */
async function sendRewards(
  rec: Pick<ReferralRecord, "refereeId" | "referrerId" | "grandId">,
  paid: { refereePaid: boolean; referrerPaid: boolean; grandPaid: boolean },
  now: number,
): Promise<void> {
  const ids = [rec.refereeId, rec.referrerId, ...(paid.grandPaid && rec.grandId ? [rec.grandId] : [])];
  const [referee, referrer, grand] = await getAccounts().summaries(ids);
  // 11/19 포인트 대신 아이템: 친구 초대 한정 꾸미기(영구)·작은 폭죽은 선물함, 물약·결재 서류는 사냥 가방에 바로
  const lantern: GiftItem[] = [{ itemId: REF_REWARD_ITEM, count: 1, term: "perm" }];
  const bagNote = (b: typeof REF_REWARD_BUNDLE) => ` ${bundleText(b)}은 사냥 가방에 넣었어요.`;
  const gifts: Promise<unknown>[] = [];
  if (paid.refereePaid)
    gifts.push(
      sendGift({ target: rec.refereeId, targetName: referee?.name ?? null, from: REF_GIFT_FROM, note: REF_GIFT_NOTE_REFEREE + bagNote(REF_REWARD_BUNDLE), points: 0, items: lantern }, now),
      grantRpgBundle(rec.refereeId, REF_REWARD_BUNDLE),
    );
  if (paid.referrerPaid)
    gifts.push(
      sendGift(
        {
          target: rec.referrerId,
          targetName: referrer?.name ?? null,
          from: REF_GIFT_FROM,
          note: refGiftNoteReferrer(referee?.name ?? NO_NAME) + bagNote(REF_REWARD_BUNDLE),
          points: 0,
          items: lantern,
        },
        now,
      ),
      grantRpgBundle(rec.referrerId, REF_REWARD_BUNDLE),
    );
  if (paid.grandPaid && rec.grandId)
    gifts.push(
      sendGift(
        {
          target: rec.grandId,
          targetName: grand?.name ?? null,
          from: REF_GIFT_FROM,
          note: refGiftNoteGrand(referrer?.name ?? NO_NAME, referee?.name ?? NO_NAME) + bagNote(REF_GRAND_BUNDLE),
          points: 0,
          items: [{ itemId: REF_GRAND_ITEM, count: 1 }],
        },
        now,
      ),
      grantRpgBundle(rec.grandId, REF_GRAND_BUNDLE),
    );
  await Promise.all(gifts).catch((e: unknown) => console.error("[referral] 추천 보상 선물 실패", rec.refereeId, e));
  // 칭호 수가 바뀌었을 수 있다 → 이 인스턴스 칭호 기억을 비우고, 접속 중인 화면에 선물함·칭호를 새로 받게 한다
  forgetTitles(rec.referrerId);
  runAfter(() => notifyMe(ids));
}

/**
 * 조건을 넘었으면 같은 사람 판정을 다시 하고 달성으로 남긴 뒤(한 번만) 단계에 맞게 보상한다. 이번에 달성시켰으면 true.
 * progress를 주면 다시 읽지 않는다 (관리자 목록·내 정보가 이미 읽은 값)
 */
export async function maybeQualify(rec: ReferralRecord, now = Date.now(), progress?: { days: number }): Promise<boolean> {
  if (rec.qualifiedAt > 0) return false;
  const p = progress ?? (await progressOf([rec], now))[0];
  if (!p || !isQualified(p)) return false;
  const store = getReferrals();
  const siblings = await store.refereesOf(rec.referrerId, CLUSTER_LOOK);
  const reasons = await assessPair(rec.refereeId, rec.referrerId, now, { signup: { ip: rec.ip, net: null }, days: true, siblings, stored: rec.reasons }).catch(
    (e: unknown) => {
      console.error("[referral] 같은 사람 판정 실패 → 확인 필요로", e);
      return mergeReasons(rec.reasons, ["ip"]);
    },
  );
  // 11/19 「자동」이면 같은 사람 판정과 관계없이 조건만 채우면 보낸다 (같은 IP 회사·가족이 많다 — 사용자). 이유 코드는 그대로 남겨 관리자 화면에서 본다
  const level = (await store.mode()) === "auto" ? "clear" : levelOfReasons(reasons);
  const r = await store.qualify(rec.refereeId, now, kstMonth(now), level, reasons, REF_MONTH_CAP, await grandOpts(rec, now));
  if (!r) return false;
  await spreadCluster(rec.refereeId, reasons);
  await sendRewards(rec, r, now);
  return true;
}

/**
 * 2단계 보상을 건너뛸 이유 (보낼 수 있으면 ""): 추천인의 추천인이 운영자 · 새 이웃이나 추천인과 같은 계정 ·
 * 같은 사람 판정으로 새 이웃이나 추천인과 「같은 사람 같음」. 보상을 보낼 수 있는 때(조건 달성·승인)에만 본다
 */
async function grandOpts(rec: Pick<ReferralRecord, "refereeId" | "referrerId" | "grandId">, now: number): Promise<GrandOpts> {
  const g = rec.grandId;
  const opts = (skip: string): GrandOpts => ({ skip, cap: REF_GRAND_MONTH_CAP });
  if (!g) return opts("");
  if (g === rec.refereeId || g === rec.referrerId) return opts("self");
  if (await isStaff(g)) return opts("staff");
  const [withReferee, withReferrer] = await Promise.all([
    assessPair(rec.refereeId, g, now).catch(() => [] as string[]),
    assessPair(rec.referrerId, g, now).catch(() => [] as string[]),
  ]);
  if (levelOfReasons(withReferee) === "same") return opts("sameReferee");
  if (levelOfReasons(withReferrer) === "same") return opts("sameReferrer");
  return opts("");
}

/** 11/19 관리자: 추천 사냥 가방 몫(물약·결재 서류)만 이 계정들에 넣는다 (자동 판정에서 빠졌던 추천을 손으로 채울 때 — 등불은 선물로 따로). 넣은 수 */
export async function grantRefBag(ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of new Set(ids)) {
    await grantRpgBundle(id, REF_REWARD_BUNDLE);
    n++;
  }
  return n;
}

/** 관리자: 확인 기다리는 추천을 승인(보상을 보낸다)·거절. 여러 개면 기다림이 아닌 것은 건너뛴다 (하나만 줬는데 기다림이 아니면 409) */
export async function decideReferrals(refereeIds: readonly string[], approve: boolean, now = Date.now()): Promise<RefDecision> {
  const out: RefDecision = { decided: 0, both: 0, refereeOnly: 0, denied: 0, reward: refRewardText(), grand: 0, grandReward: refGrandText() };
  const store = getReferrals();
  for (const id of new Set(refereeIds)) {
    const rec = await store.get(id);
    if (!rec || rec.hold !== 1) continue;
    const r = await store.decide(id, approve, kstMonth(now), REF_MONTH_CAP, approve ? await grandOpts(rec, now) : { skip: "", cap: REF_GRAND_MONTH_CAP });
    if (!r) continue;
    out.decided++;
    if (!r.approved) out.denied++;
    else if (r.referrerPaid) out.both++;
    else out.refereeOnly++;
    if (r.grandPaid) out.grand++;
    if (r.approved) await sendRewards(rec, r, now);
  }
  return out;
}

export async function decideReferral(refereeId: string, approve: boolean, now = Date.now()): Promise<RefDecision> {
  const d = await decideReferrals([refereeId], approve, now);
  if (!d.decided) throw new HttpError(409, "NOT_HELD", "확인을 기다리는 추천이 아니에요.");
  return d;
}

// ── 머무르기 기록에서 (새 이웃만, 인스턴스 메모리로 Redis 명령을 아낀다) ──

/** 추천 기록이 없거나 이미 달성한 계정은 이만큼 다시 보지 않는다 (내 정보에서 추천인을 정하면 같은 인스턴스는 바로 지운다) */
const PRESENCE_SKIP_MS = 30 * 60_000;
const gm = globalThis as typeof globalThis & { __tombRefPresence?: Map<string, number> };
const presenceMemo = () => (gm.__tombRefPresence ??= new Map());

/** 머무르기 기록마다 (응답 뒤에): 달성 전 새 이웃이면 조건을 본다 */
export async function referralOnPresence(accountId: string, now = Date.now()): Promise<void> {
  const memo = presenceMemo();
  if ((memo.get(accountId) ?? 0) > now) return;
  const rec = await getReferrals().get(accountId);
  if (!rec || rec.qualifiedAt > 0 || (await maybeQualify(rec, now))) memo.set(accountId, now + PRESENCE_SKIP_MS);
  if (memo.size > 5000) for (const [k, until] of memo) if (until <= now) memo.delete(k);
}

// ── 내 정보 ──

/** 내 정보 추천 칸 (나를 데려온 이웃 진행과, 내가 데려온 이웃 중 달성 전 최근 몇 명의 조건도 여기서 본다) */
export async function referralView(accountId: string, now = Date.now()): Promise<ReferralView> {
  const store = getReferrals();
  const code = await ensureReferralCode(accountId);
  const month = kstMonth(now);
  const [mineRec, pending] = await Promise.all([store.get(accountId), code ? store.refereesOf(accountId, 10) : Promise.resolve([])]);

  let mine: ReferralView["mine"] = null;
  if (mineRec) {
    const [p] = await progressOf([mineRec], now);
    if (await maybeQualify(mineRec, now, p)) Object.assign(mineRec, (await store.get(accountId)) ?? {});
    const [ref] = await getAccounts().summaries([mineRec.referrerId]);
    mine = {
      referrerName: ref?.name ?? null,
      at: mineRec.at,
      stayMinutes: p.stayMinutes,
      days: p.days,
      todayMin: p.todayMin,
      qualified: mineRec.qualifiedAt > 0,
      rewarded: mineRec.refereePaid,
      held: mineRec.hold === 1,
    };
  }
  if (pending.length) {
    const recs = (await store.getMany(pending)).filter((r): r is ReferralRecord => !!r && r.qualifiedAt === 0);
    const ps = await progressOf(recs, now);
    for (let i = 0; i < recs.length; i++) await maybeQualify(recs[i], now, ps[i]);
  }

  const st = code ? await store.stats(accountId, month) : { joined: 0, qualified: 0, credited: 0, paid: 0, month: 0, gJoined: 0, gPaid: 0 };
  const nextTitle = REF_TITLES.find((t) => st.credited < t.need!);
  return {
    code,
    joined: st.joined,
    qualified: st.qualified,
    rewarded: st.paid,
    monthRewarded: st.month,
    giftsGot: st.paid + (mine?.rewarded ? 1 : 0),
    second: { joined: st.gJoined, rewarded: st.gPaid },
    next: nextTitle ? { title: nextTitle.name, need: nextTitle.need!, count: st.credited } : null,
    mine,
  };
}

// ── 관리자 ──

export type AdminReferralRow = {
  refereeId: string;
  refereeName: string | null;
  referrerId: string;
  referrerName: string | null;
  at: number;
  via: "signup" | "later";
  qualifiedAt: number;
  stayMinutes: number;
  /** 11/18 하루 1시간 넘게 머문 날 수 (= hourDays + legacyDays), 기록된 날, 옛 기준으로 쳐 준 날, 어제·오늘 머문 분, 새 기준 달성 여부 */
  days: number;
  hourDays: number;
  legacyDays: number;
  recent: { day: string; min: number }[];
  meetsRule: boolean;
  /** 같은 사람 판정 (점수 0~100·단계·이유 코드 — 화면은 lib/sameUserRules로 글자로 바꾼다) */
  score: number;
  level: SameLevel;
  reasons: string[];
  /** 0 없음, 1 확인 기다림, 2 승인, 3 거절 */
  hold: 0 | 1 | 2 | 3;
  /** 추천인이 이번 달(KST) 보상을 상한만큼 받았다 → 지금 승인하면 새 이웃만 받는다 */
  referrerCapped: boolean;
  refereePaid: boolean;
  referrerPaid: boolean;
  /** 새 이웃과 같은 IP·같은 기기로 들어온 계정 전부 */
  links: MemberLinks;
  /** 추천인의 추천인 (2단계)과 그 보상 상태: "" 아직, paid, cap, skip:이유 */
  grandId: string | null;
  grandName: string | null;
  grand: string;
};
export type AdminReferrerRow = { accountId: string; name: string | null; joined: number; qualified: number; paid: number; month: number };
export type AdminReferralResponse = {
  mode: RefMode;
  month: string;
  totals: { entered: number; qualified: number; paidReferrer: number; paidReferee: number; paidGrand: number; same: number; held: number; denied: number };
  /** 확인 기다리는 추천 전부 (조건 달성이 오래된 것 먼저, 최대 HELD_LIST개) */
  held: AdminReferralRow[];
  top: AdminReferrerRow[];
  recent: AdminReferralRow[];
  /** 이유에 나오는 계정(무리)의 이름 */
  names: Record<string, string | null>;
  /** dayMin = 하루에 넘겨야 하는 분, needDays = 그런 날 수 */
  rules: { reward: string; monthCap: number; dayMin: number; needDays: number; enterMin: number; grandReward: string; grandMonthCap: number };
  /** 방금 승인·거절한 결과 (알림 문구용) */
  decision?: RefDecision;
};

/** 관리자 확인 목록에 한 번에 싣는 수 */
export const HELD_LIST = 200;

/** 관리자 추천 탭: 합계·확인 기다림·많이 데려온 추천인·최근 추천 (목록을 보면서 조건을 넘은 이웃은 달성 처리한다) */
export async function adminReferrals(now = Date.now(), limit = 100): Promise<AdminReferralResponse> {
  const store = getReferrals();
  const month = kstMonth(now);
  const recentIds = await store.recent(limit);
  let recs = (await store.getMany(recentIds)).filter((r): r is ReferralRecord => !!r);
  let ps = await progressOf(recs, now);
  for (let i = 0; i < recs.length; i++) {
    if (recs[i].qualifiedAt > 0 || !isQualified(ps[i])) continue;
    await maybeQualify(recs[i], now, ps[i]);
  }
  // 달성 처리·무리 퍼뜨리기로 바뀐 기록과 확인 목록을 함께 다시 읽는다 (파이프라인 한 번)
  const heldIds = await store.heldList(HELD_LIST);
  const ids = [...new Set([...recentIds, ...heldIds])];
  recs = (await store.getMany(ids)).filter((r): r is ReferralRecord => !!r);
  ps = await progressOf(recs, now);
  const topIds = await store.topReferrers(30);
  const clusterIds = recs.flatMap((r) => r.reasons.flatMap((x) => parseReason(x)?.accounts ?? []));
  const grandIds = recs.flatMap((r) => (r.grandId ? [r.grandId] : []));
  const nameIds = [...new Set([...recs.map((r) => r.referrerId), ...topIds, ...clusterIds, ...grandIds])];
  const referrerIds = [...new Set(recs.map((r) => r.referrerId))];
  const [mode, totals, topStats, sums, refStats] = await Promise.all([
    store.mode(),
    store.totals(),
    store.statsMany(topIds, month),
    getAccounts().summaries(nameIds),
    store.statsMany(referrerIds, month),
  ]);
  const capped = new Set(referrerIds.filter((_, i) => refStats[i].month >= REF_MONTH_CAP));
  const names = new Map(nameIds.map((id, i) => [id, sums[i]?.name ?? null]));
  for (let i = 0; i < recs.length; i++) names.set(recs[i].refereeId, ps[i]?.name ?? null);
  const links = await memberLinks(
    recs.map((r) => r.refereeId),
    now,
    names,
  );
  const rows = new Map(
    recs.map((r, i): [string, AdminReferralRow] => [
      r.refereeId,
      {
        refereeId: r.refereeId,
        refereeName: ps[i]?.name ?? null,
        referrerId: r.referrerId,
        referrerName: names.get(r.referrerId) ?? null,
        at: r.at,
        via: r.via,
        qualifiedAt: r.qualifiedAt,
        stayMinutes: ps[i]?.stayMinutes ?? 0,
        days: ps[i]?.days ?? 0,
        hourDays: ps[i]?.hourDays ?? 0,
        legacyDays: ps[i]?.legacyDays ?? 0,
        recent: ps[i]?.recent ?? [],
        meetsRule: !!ps[i] && isQualified(ps[i]),
        score: sameScore(r.reasons),
        level: r.same ? "same" : levelOfReasons(r.reasons),
        reasons: r.reasons,
        hold: r.hold,
        referrerCapped: capped.has(r.referrerId),
        refereePaid: r.refereePaid,
        referrerPaid: r.referrerPaid,
        links: links.get(r.refereeId) ?? { ip: [], device: [] },
        grandId: r.grandId,
        grandName: r.grandId ? (names.get(r.grandId) ?? null) : null,
        grand: r.grand,
      },
    ]),
  );
  const top = topIds
    .map((id, i) => ({ accountId: id, name: names.get(id) ?? null, ...topStats[i] }))
    .sort((a, b) => b.qualified - a.qualified || b.joined - a.joined)
    .map(({ accountId, name, joined, qualified, paid, month: m }) => ({ accountId, name, joined, qualified, paid, month: m }));
  const pick = (list: readonly string[]) => list.flatMap((id) => rows.get(id) ?? []);
  return {
    mode,
    month,
    totals,
    held: pick(heldIds).filter((r) => r.hold === 1),
    top,
    recent: pick(recentIds),
    names: Object.fromEntries([...names].filter(([id]) => clusterIds.includes(id))),
    rules: {
      reward: refRewardText(),
      monthCap: REF_MONTH_CAP,
      dayMin: REF_DAY_MIN,
      needDays: REF_NEED_DAYS,
      enterMin: REF_ENTER_MS / 60_000,
      grandReward: refGrandText(),
      grandMonthCap: REF_GRAND_MONTH_CAP,
    },
  };
}
