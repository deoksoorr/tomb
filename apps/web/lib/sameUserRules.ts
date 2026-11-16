// 같은 사람(여러 계정) 판정 규칙 (화면·서버 공용 순수 정의). 신호를 모으는 쪽은 lib/sameUser.ts.
// 신호마다 점수를 더해 0~100으로 매기고, 30점부터 「확인 필요」, 70점부터 「같은 사람 같음」.
// 이유는 코드 문자열로 저장한다 ("dev", "cluster:계정.계정" 처럼 묶음 신호는 함께 걸린 계정 id를 단다)

export type SameCode = "dev" | "ipSignup" | "ip" | "net" | "fpNet" | "fp" | "time" | "days" | "cluster";
export type SameLevel = "clear" | "review" | "same";

/**
 * 신호 점수. 같은 기기는 혼자로도 같은 사람, 같은 IP는 혼자면 확인 필요 (가족·회사 와이파이).
 * 같은 IP + 가입 시간(65)도 확인 필요에 머문다 (집에서 가족을 데려온 경우), 같은 IP + 같은 브라우저 환경(85)이면 같은 사람
 */
export const SAME_WEIGHTS: Record<SameCode, number> = {
  dev: 90,
  ipSignup: 50,
  ip: 50,
  net: 20,
  fpNet: 35,
  fp: 10,
  time: 15,
  days: 15,
  cluster: 30,
};
export const SAME_REVIEW_AT = 30;
export const SAME_SAME_AT = 70;
/** 추천인이 같은 대역에서 접속한 뒤 이 시간 안에 가입하면 「time」 */
export const SAME_TIME_WINDOW_MS = 3 * 3_600_000;
/** 다른 이웃 몇 명과 겹치면 무리(cluster)로 보나 */
export const SAME_CLUSTER_MIN = 2;

export const SAME_LEVEL_LABEL: Record<SameLevel, string> = { clear: "의심 없음", review: "확인 필요", same: "같은 사람 같음" };

const REASON_TEXT: Record<SameCode, string> = {
  dev: "같은 기기에서 두 계정을 썼어요",
  ipSignup: "가입 IP가 추천인 최근 IP와 같아요",
  ip: "두 계정이 같은 IP에서 접속한 적이 있어요",
  net: "같은 인터넷 대역에서 접속했어요",
  fpNet: "같은 대역에서 브라우저 환경까지 같아요",
  fp: "브라우저 환경이 같아요",
  time: "추천인이 같은 대역에서 접속한 지 3시간 안에 가입했어요",
  days: "추천인이 접속한 날에만 들어왔어요",
  cluster: "추천인이 데려온 다른 이웃과 기기나 대역이 겹쳐요",
};

const isCode = (v: string): v is SameCode => v in SAME_WEIGHTS;

/** 이유 하나 = 코드 + 함께 걸린 계정 id (cluster만) */
export type SameReason = { code: SameCode; text: string; accounts: string[] };

export function parseReason(raw: string): SameReason | null {
  const [code, list] = raw.split(":");
  if (!isCode(code)) return null;
  return { code, text: REASON_TEXT[code], accounts: list ? list.split(".").filter(Boolean) : [] };
}

/** 이유 목록을 합친다 (같은 코드는 하나로, cluster의 계정은 모아서). 같은 IP·가입 IP는 하나만, 브라우저 환경은 대역과 함께인 쪽만 */
export function mergeReasons(...lists: readonly (readonly string[])[]): string[] {
  const codes = new Set<SameCode>();
  const cluster = new Set<string>();
  for (const list of lists)
    for (const raw of list) {
      const r = parseReason(raw);
      if (!r) continue;
      codes.add(r.code);
      if (r.code === "cluster") for (const a of r.accounts) cluster.add(a);
    }
  if (codes.has("ipSignup")) codes.delete("ip");
  if (codes.has("ipSignup") || codes.has("ip")) codes.delete("net");
  if (codes.has("fpNet")) codes.delete("fp");
  const order = Object.keys(SAME_WEIGHTS) as SameCode[];
  return order.filter((c) => codes.has(c)).map((c) => (c === "cluster" && cluster.size ? `cluster:${[...cluster].sort().join(".")}` : c));
}

export function sameScore(reasons: readonly string[]): number {
  return Math.min(
    100,
    mergeReasons(reasons).reduce((s, raw) => s + (SAME_WEIGHTS[parseReason(raw)!.code] ?? 0), 0),
  );
}

export function sameLevel(score: number): SameLevel {
  return score >= SAME_SAME_AT ? "same" : score >= SAME_REVIEW_AT ? "review" : "clear";
}

export const levelOfReasons = (reasons: readonly string[]): SameLevel => sameLevel(sameScore(reasons));

/** 회원 목록 줄 아래 「같은 IP 접속」·「같은 기기」 계정 (staff = 운영자 계정) */
export type LinkedAccount = { accountId: string; name: string | null; staff?: true };
export type MemberLinks = { ip: LinkedAccount[]; device: LinkedAccount[] };
