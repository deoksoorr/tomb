import { bundleText } from "./rewardText";
import type { RpgBundle } from "./rpgGift";

// 추천 코드 규칙 (화면·서버 공용 순수 정의). 저장은 lib/store/referrals.ts, 판정·보상은 lib/referralService.ts.
//  - 계정마다 공개 추천 코드 하나 (처음 볼 때 만든다). 비밀 개인 코드(로그인용)와는 전혀 다른 값이다
//  - 추천인은 가입할 때 한 번만 정한다 (11/19 뒤늦게 넣기는 없앴다 — 가입 직후 REF_ENTER_MIN분 안의 가입 화면 요청만). 바꿀 수 없고, 나·운영자·내가 데려온 이웃은 안 된다
//  - 데려온 이웃이 하루 REF_DAY_MIN분 넘게 머문 날이 REF_NEED_DAYS일이 되면 "조건 달성" (한 번만, 이어진 날일 필요 없다).
//    11/18 예전엔 「합쳐서 3시간 + 들어온 날 3일」. 그 전에 들어온 날은 너그럽게 1시간 머문 날로 친다 (referralService progressOf)
//  - 조건 달성 때 둘 다 추천 선물을 받는다 (11/19 포인트 대신 아이템: 마중 등불(영구)은 선물함, 물약·결재 서류는 사냥 가방).
//    추천한 쪽은 한 달(한국 시간 달력)에 REF_MONTH_CAP명까지만
//  - 보상 방식(RefMode): 기본은 「모두 확인」(관리자가 승인해야 보상 — 승인하면 등불·사냥 가방 몫이 한 번에). 11/19 「자동」이면 판정과 관계없이 바로 보낸다 (판정 이유는 표시만)

export const REF_CODE_LEN = 6;
/** 헷갈리는 글자(0·O·1·I·L)를 뺀 글자 */
export const REF_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** 11/19 추천 선물 (두 사람 모두): 친구 초대 한정 꾸미기(영구, 선물함) + 사냥 가방 꾸러미 */
export const REF_REWARD_ITEM = "inv_hand_lantern";
export const REF_REWARD_BUNDLE: RpgBundle = { potions: { p_coffee: 5, p_energy: 5 }, mats: { m_doc: 10 } };
export const REF_MONTH_CAP = 5;
/** 하루에 이만큼(분) 넘게 머문 날을 센다 */
export const REF_DAY_MIN = 60;
/** 그런 날이 이만큼이면 자리 잡기 */
export const REF_NEED_DAYS = 3;
/** 11/19 추천인은 가입할 때만: 가입 화면이 가입 직후 보내는 요청만 받는다 (이 분 안 — 뒤늦게 넣기 막이) */
export const REF_ENTER_MIN = 60;
/** 2단계 (추천인의 추천인, 그 위로는 없다): 데려온 친구가 또 데려온 이웃이 자리를 잡으면 받는 선물(작은 폭죽은 선물함, 결재 서류는 사냥 가방)과 한 달 상한 */
export const REF_GRAND_ITEM = "fw_small";
export const REF_GRAND_BUNDLE: RpgBundle = { mats: { m_doc: 5 } };
export const REF_GRAND_MONTH_CAP = 10;
/** 추천 선물 글귀 「마중 등불(영구), 커피 5개, 에너지드링크 5개, 결재 서류 10장」 */
export const refRewardText = () => `마중 등불(영구), ${bundleText(REF_REWARD_BUNDLE)}`;
/** 11/19 등불은 꾸미기라 한 사람에게 처음 한 번만 (두 번째 추천부터는 사냥 가방 몫만) */
export const REF_LANTERN_ONCE = "마중 등불은 처음 한 번만 받고, 그다음 추천부터는 사냥 가방 선물만 받아요.";
export const refGrandText = () => `작은 폭죽 1개, ${bundleText(REF_GRAND_BUNDLE)}`;
/** 2단계 보상을 건너뛴 이유 (기록의 gr = "skip:이유") */
export const GRAND_SKIP_TEXT: Record<string, string> = {
  staff: "운영자 계정이라 건너뛰었어요",
  self: "새 이웃이나 추천인과 같은 계정이라 건너뛰었어요",
  sameReferee: "새 이웃과 같은 사람 같아서 건너뛰었어요",
  sameReferrer: "추천인과 같은 사람 같아서 건너뛰었어요",
};
export const REF_ENTER_MS = REF_ENTER_MIN * 60_000;
/**
 * 추천 보상 방식 (관리자 추천 탭, ref:cfg mode). review = 모두 확인(기본, 조건을 넘긴 추천은 점수와 상관없이 관리자 승인 뒤 보상),
 * auto = 조건을 채우면 바로 보낸다 (11/19 같은 사람 판정은 표시만), off = 기록만
 */
export type RefMode = "review" | "auto" | "off";
export const REF_MODES: readonly RefMode[] = ["review", "auto", "off"];
export const REF_MODE_LABEL: Record<RefMode, string> = { review: "모두 확인", auto: "자동", off: "끔" };
export const isRefMode = (v: unknown): v is RefMode => typeof v === "string" && (REF_MODES as readonly string[]).includes(v);
/**
 * 관리자 승인·거절 결과: both = 두 사람 모두 받음, refereeOnly = 추천인이 이달 상한이라 새 이웃만, denied = 거절, reward = 한 사람이 받은 선물 글귀,
 * grand = 추천인의 추천인도 받은 수, grandReward = 그 선물 글귀
 */
export type RefDecision = { decided: number; both: number; refereeOnly: number; denied: number; reward: string; grand: number; grandReward: string };

/** 승인·거절 뒤 관리자 알림: 실제로 누구에게 얼마를 보냈는지 (한 번에 승인이나 거절 한쪽만 한다) */
export function decisionText(d: RefDecision | undefined): string {
  if (!d || !d.decided) return "처리할 추천이 없었어요.";
  const n = (v: number) => v.toLocaleString("ko-KR");
  const p = d.reward;
  if (d.denied) return d.decided === 1 ? "보상을 거절했어요." : `${n(d.denied)}건의 보상을 거절했어요.`;
  const g = d.grandReward;
  if (d.decided === 1) {
    const main = d.both ? `두 사람에게 ${p}을 보냈어요.` : `새 이웃에게만 ${p}을 보냈어요. 추천인은 이번 달 보상을 다 받았어요.`;
    return d.grand ? `${main} 추천인의 추천인에게도 ${g}을 보냈어요.` : main;
  }
  const parts = [d.both ? `${n(d.both)}건은 두 사람에게` : "", d.refereeOnly ? `${n(d.refereeOnly)}건은 새 이웃에게만` : ""].filter(Boolean);
  const grand = d.grand ? ` 추천인의 추천인 ${n(d.grand)}명에게도 ${g}을 보냈어요.` : "";
  return `${n(d.decided)}건을 승인했어요. ${parts.join(", ")} ${p}을 보냈어요.${grand}`;
}

/** 보상 선물을 보내는 이름 */
export const REF_GIFT_FROM = "마을 안내소";
export const REF_GIFT_NOTE_REFEREE = "추천으로 온 이웃 환영 선물이에요.";
export const refGiftNoteReferrer = (name: string) => `${name}님이 마을에 자리를 잡았어요. 데려와 줘서 고마워요.`;
export const refGiftNoteGrand = (referrer: string, referee: string) => `${referrer}님이 데려온 이웃 ${referee}님이 마을에 자리를 잡았어요.`;

const CODE_RE = new RegExp(`^[${REF_CODE_ALPHABET}]{${REF_CODE_LEN}}$`);

/** 입력값을 코드 모양으로 (공백·하이픈 빼고 대문자). 규칙에 안 맞으면 null */
export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/[\s-]/g, "").toUpperCase();
  return CODE_RE.test(v) ? v : null;
}

/** 새 코드 하나 (rand는 0 이상 1 미만, 테스트에서 바꿔 끼운다) */
export function randomRefCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < REF_CODE_LEN; i++) s += REF_CODE_ALPHABET[Math.floor(rand() * REF_CODE_ALPHABET.length)];
  return s;
}

/** 한국 시간 달력의 달 YYYYMM (추천 보상 한 달 상한) */
export function kstMonth(now: number): string {
  const d = new Date(now + 9 * 3_600_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 공유 주소 */
export const refLink = (origin: string, code: string) => `${origin.replace(/\/$/, "")}/?ref=${code}`;

// ── 응답 모양 ──

/** GET /api/referral/check?code= */
export type RefCheckResponse = { ok: true; code: string; name: string | null } | { ok: false; reason: string };

/** 내가 데려온 이웃이 아닌, 나를 데려온 쪽에서 본 내 진행 */
export type RefMyProgress = {
  referrerName: string | null;
  at: number;
  stayMinutes: number;
  /** 11/18 하루 1시간(REF_DAY_MIN) 넘게 머문 날 수 (옛 기준 날 포함) */
  days: number;
  /** 오늘 머문 분 */
  todayMin: number;
  qualified: boolean;
  /** 환영 선물을 받았는지 (같은 사람 같음·자동 보상 꺼짐·확인 중이면 false) */
  rewarded: boolean;
  /** 관리자 확인을 기다리는 중 (보상 보류) */
  held: boolean;
};

/** GET /api/referral (내 정보) */
export type ReferralView = {
  /** 운영자 계정은 null (추천에 참여하지 않는다) */
  code: string | null;
  joined: number;
  qualified: number;
  /** 추천 보상을 받은 수 (이번 달 상한을 넘으면 세기만 한다) */
  rewarded: number;
  monthRewarded: number;
  /** 추천 선물을 받은 수 (데려온 보상 + 내 환영 선물) */
  giftsGot: number;
  /** 2단계: 내가 데려온 친구가 또 데려온 이웃 수와 그 선물을 받은 수 (칭호에는 세지 않는다) */
  second: { joined: number; rewarded: number };
  /** 다음 칭호까지 (다 얻었으면 null). count = 칭호에 세는 수 */
  next: { title: string; need: number; count: number } | null;
  /** 나를 데려온 이웃이 있으면 내 진행 */
  mine: RefMyProgress | null;
};
