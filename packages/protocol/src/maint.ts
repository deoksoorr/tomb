import { hmacSign, hmacVerify } from "./token";
import type { MapId } from "./camp";

// 11/26 점검 모드 + 접속 기록 (웹 ↔ 실시간 서버 공용 약속).
//
// 점검 모드: 관리자 [점검 시작] → 웹이 /internal/maint로 실시간 서버(로비 DO)에 상태를 맡긴다 (Redis 안 씀).
//  - 실시간 서버: 운영자(토큰 staff)가 아닌 접속을 모두 CLOSE.MAINTENANCE(4013)로 끊고, 새 입장도 같은 코드로 거절한다
//  - 웹: 미들웨어(proxy.ts)가 GET {실시간}/maintenance를 약 15초 기억해 읽고, 사이트 전체를 503 + Retry-After로 막는다
//    (관리자 화면·관리자 API·점검 상태 API·서버끼리 경로·정적 파일은 열어 둔다). 운영자·관리자는 통과
//  - 화면: 「서버 점검 중이에요」 + 문구 + 예상 끝 시각, MAINT_POLL_MS마다 확인해 끝나면 저절로 다시 들어온다
//
// 접속 기록: 로비 DO가 들어옴·나감(+ 종료 종류·기기 종류)을 모았다가 /api/internal/conn-log로 웹에 한 번에 넘긴다 (IP는 없다).

/** 점검 문구 최대 길이 */
export const MAINT_MSG_MAX = 120;
/** 점검 화면이 상태를 다시 확인하는 간격 */
export const MAINT_POLL_MS = 30_000;
/** 웹 미들웨어·점검 상태 API가 실시간 서버 점검 상태를 기억하는 시간 */
export const MAINT_CACHE_MS = 15_000;

/** 점검 상태. skip = 점검 중에도 사이트를 열어 둘 계정(운영자) id의 해시 앞 16자 (sha256 hex) — 원래 id는 싣지 않는다 */
export type MaintState = { on: boolean; msg: string; until: number | null; at: number; skip?: string[] };
export const MAINT_OFF: MaintState = { on: false, msg: "", until: null, at: 0 };

/** 받은 값 → 점검 상태 (모양이 틀리면 꺼짐) */
export function parseMaint(raw: unknown): MaintState {
  if (!raw || typeof raw !== "object") return MAINT_OFF;
  const r = raw as Record<string, unknown>;
  const until = typeof r.until === "number" && Number.isFinite(r.until) && r.until > 0 ? r.until : null;
  const skip = Array.isArray(r.skip) ? r.skip.filter((s): s is string => typeof s === "string" && /^[0-9a-f]{16}$/.test(s)).slice(0, 8) : [];
  return {
    on: r.on === true,
    msg: typeof r.msg === "string" ? [...r.msg].slice(0, MAINT_MSG_MAX).join("") : "",
    until,
    at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
    ...(skip.length ? { skip } : {}),
  };
}

/** 점검 중 입장을 거절하는지 (운영자 토큰은 늘 통과) */
export function maintRejects(s: MaintState, staff: boolean): boolean {
  return s.on && !staff;
}

/** 브라우저에 보여 줄 모양 (통과 목록은 뺀다) */
export function publicMaint(s: MaintState): MaintState {
  return { on: s.on, msg: s.msg, until: s.until, at: s.at };
}

/**
 * 11/26 웹 서버가 GET {실시간}/maintenance로 통과 목록(skip)까지 받을 때 붙이는 머리글.
 * 값 = "{만료 초}.{HMAC(JOIN_SECRET, "maintRead:" + 만료)}" — 없거나 틀리거나 지났으면 실시간 서버는 공개 모양(publicMaint)만 준다
 * (예전에는 Origin이 없는 요청이면 누구에게나 skip을 줬다)
 */
export const MAINT_READ_HEADER = "X-Tomb-Maint";
export const MAINT_READ_TTL_SEC = 60;

export async function signMaintRead(secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const exp = nowSec + MAINT_READ_TTL_SEC;
  return `${exp}.${await hmacSign(secret, `maintRead:${exp}`)}`;
}

export async function verifyMaintRead(secret: string, value: string | null | undefined, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!secret || !value || value.length > 200) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const raw = value.slice(0, dot);
  if (!/^\d{1,12}$/.test(raw)) return false;
  const exp = Number(raw);
  // 지났거나, 너무 먼 만료(시계 차이 여유 5초 넘게)는 받지 않는다
  if (exp < nowSec || exp > nowSec + MAINT_READ_TTL_SEC + 5) return false;
  return hmacVerify(secret, `maintRead:${exp}`, value.slice(dot + 1));
}

// ── 접속 기록 ──

/** 나감 종류 (실시간 서버가 마지막으로 본 닫힘 코드로 정한다) */
export const CONN_WHYS = ["normal", "closed", "drop", "timeout", "error", "outdated", "kicked", "maint", "replaced"] as const;
export type ConnWhy = (typeof CONN_WHYS)[number];
export const CONN_WHY_LABEL: Record<ConnWhy, string> = {
  normal: "정상 종료",
  closed: "창 닫음",
  drop: "연결 끊김",
  timeout: "응답 없음",
  error: "오류",
  outdated: "새 버전",
  kicked: "강제 퇴장",
  maint: "점검",
  replaced: "다른 곳에서 접속",
};
/** 비정상 종료로 세는 종류 (대시보드 24시간 비율) */
export const CONN_ABNORMAL: readonly ConnWhy[] = ["drop", "timeout", "error"];

/** 닫힘 코드 → 나감 종류. 1000 = 게임이 직접 끊음, 1001 = 브라우저가 창·탭을 닫음(going away), 1006 = 닫힘 프레임 없이 끊김 */
export function connWhyOf(code: number | undefined): ConnWhy {
  switch (code) {
    case 1000:
      return "normal";
    case 1001:
      return "closed";
    case 4000:
      return "timeout"; // 핑 응답이 없어 클라이언트·서버가 끊은 것 (CLOSE_STALE·CLOSE_CLIENT_DROP)
    case 1011:
      return "error";
    case 4010:
      return "outdated";
    case 4011:
    case 4012:
      return "kicked";
    case 4013:
      return "maint";
    case 4002:
      return "replaced";
    default:
      return "drop";
  }
}

/** 기기 종류 (User-Agent에서. 문자열 자체는 남기지 않는다) */
export type ConnDevice = "pc" | "phone" | "tablet";
/** 앱 안 브라우저 이름 (카카오톡 등). 없으면 null. 11/27 텔레그램·X·틱톡 더함, 스레드는 인스타그램보다 먼저 (스레드 앱 UA에 Instagram이 같이 붙는 일이 있다) */
export function inAppOf(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const rules: [RegExp, string][] = [
    [/KAKAOTALK/i, "카카오톡"],
    [/Barcelona|Threads/i, "스레드"],
    [/Instagram/i, "인스타그램"],
    [/FBAN|FBAV|FB_IAB|FB4A/i, "페이스북"],
    [/NAVER\(inapp|NAVER\//i, "네이버 앱"],
    [/DaumApps/i, "다음 앱"],
    [/\bLine\//, "라인"],
    [/everytimeApp/i, "에브리타임"],
    [/BAND\//, "밴드"],
    [/Discord\//i, "디스코드"],
    [/Telegram/i, "텔레그램"],
    [/Twitter for|TwitterAndroid/i, "X(트위터)"],
    [/musical_ly|BytedanceWebview|TikTok/i, "틱톡"],
  ];
  for (const [re, name] of rules) if (re.test(ua)) return name;
  return null;
}
/** 앱 이름 → 「○○ 앱」 (이미 「앱」으로 끝나면 그대로 — 「네이버 앱 앱」이 되지 않게) */
export const inAppLabel = (app: string): string => (app.endsWith("앱") ? app : `${app} 앱`);
export function deviceOf(ua: string | null | undefined): ConnDevice {
  if (!ua) return "pc";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "phone";
  return "pc";
}
/** 접속 기록에 남기는 기기 한 줄 (예: "phone", "phone·카카오톡") — 30자 */
export function connDeviceOf(ua: string | null | undefined): string {
  const app = inAppOf(ua);
  return (app ? `${deviceOf(ua)}·${app}` : deviceOf(ua)).slice(0, 30);
}

/**
 * 실시간 서버 → 웹 한 줄: [방문자 id, "i"(들어옴)|"o"(나감), 시각(ms), 채널, 기기, 나감 종류]
 * (본문 상한 8KB 안에 많이 싣게 배열로)
 * 11/27 일곱 칸 줄: "m" = 서버가 맵을 옮김 (x.f → x.t, 까닭 x.c), "t" = 다시 접속·다른 탭 (x.m = 서버가 지킨 맵, x.a = 화면이 보낸 다른 맵,
 * x.tab·x.pt = 이번·이전 탭 id, x.pc = 이전 채널(다른 채널 탭), x.live = 이전 탭 연결이 살아 있어 끊음)
 */
export type ConnLogWire =
  | [string, "i" | "o", number, number, string, ConnWhy | ""]
  | [string, "m" | "t", number, number, string, "", ConnLogExtra]
  | [string, "r", number, number, string, "", ConnActExtra];
/** 11/27 서버가 맵을 옮긴 까닭: mapReq = 맵 옮기기 요청(버스·친구한테 가기·집 문), staffTp = 운영자 순간이동, permLost = 허락이 없어져 마을로 */
export const MAP_CAUSES = ["mapReq", "staffTp", "permLost"] as const;
export type MapCause = (typeof MAP_CAUSES)[number];
export type ConnLogExtra = { f?: MapId; t?: MapId; c?: MapCause; m?: MapId; a?: MapId; tab?: string; pt?: string; pc?: number; live?: 1 };
/** 11/27 탭 id (화면이 sessionStorage에 만들어 접속 주소 &tab=로 보낸다 — 기록에만 쓴다) */
export const TAB_ID_RE = /^[A-Za-z0-9]{4,12}$/;
const isMap = (v: unknown): v is MapId => v === "village" || v === "camp" || v === "sea";
function parseExtra(raw: unknown): ConnLogExtra | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: ConnLogExtra = {};
  for (const k of ["f", "t", "m", "a"] as const) {
    if (o[k] === undefined) continue;
    if (!isMap(o[k])) return null;
    out[k] = o[k] as MapId;
  }
  if (o.c !== undefined) {
    if (!(MAP_CAUSES as readonly unknown[]).includes(o.c)) return null;
    out.c = o.c as MapCause;
  }
  for (const k of ["tab", "pt"] as const) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== "string" || !TAB_ID_RE.test(o[k] as string)) return null;
    out[k] = o[k] as string;
  }
  if (o.pc !== undefined) {
    if (typeof o.pc !== "number" || !Number.isInteger(o.pc) || o.pc < 1 || o.pc > 1000) return null;
    out.pc = o.pc;
  }
  if (o.live !== undefined) {
    if (o.live !== 1) return null;
    out.live = 1;
  }
  return out;
}

// ── 11/28 "r" 줄: 실시간 서버 안에서만 일어나는 동작 (탈것 타고 내림 · 좌대에서 내려보냄) ──
// [방문자 id, "r", 시각, 채널, 기기, "", x]. x.g = 무엇:
//  - 탈것 (RIDE_GEARS): x.m = 맵, x.on = 1이면 탐(없으면 내림), x.n = 몇 번(1부터), x.k = 2인승 자리(0 앞·1 뒤 — 1인승은 없음),
//    x.d = 내림: 탄 시간(초, 모르면 없음), x.w = 내림 까닭(RIDE_OFF_WHYS, 직접 내리면 없음), x.b = 1이면 「탔다가 바로 내림」 한 줄로 접음 (시각 = 탄 때)
//  - 좌대 ("raft"): x.n = 좌대 번호, x.w = 내려보낸 까닭 (raft.ts RaftOutWhy)
//  - x.s = 그 사이 너무 잦아 실시간 서버가 건너뛴 줄 수
// 옛 웹은 이 줄을 모른다 → 실시간 서버는 "r" 줄을 다른 줄과 한 묶음에 섞지 않는다 (connLog.ts take — 옛 웹이 묶음째 404로 버려도 들어옴·나감은 남게)
/** 탈것: tube 튜브 · jetski 제트스키 · kayak 카약 (바닷가), rowboat 나룻배 (캠핑장), boat 조각배 · duck 오리배 (마을) */
export const RIDE_GEARS = ["tube", "jetski", "kayak", "rowboat", "boat", "duck"] as const;
export type RideGear = (typeof RIDE_GEARS)[number];
/** 내린 까닭: quit = 접속이 끊김(유예가 끝남), map = 맵을 옮김, big = 몸이 커짐 */
export const RIDE_OFF_WHYS = ["quit", "map", "big"] as const;
export type RideOffWhy = (typeof RIDE_OFF_WHYS)[number];
export const RAFT_OUT_WHYS = ["ticket", "end", "sold"] as const;
/** 탈것을 타고 이 안에 내리거나, 내리고 이 안에 다시 타면 한 줄로 접는다 (실시간 서버 connLog.ts·rideLog.ts) */
export const RIDE_TOGGLE_MS = 3_000;
export type ConnRideExtra = { g: RideGear; m: MapId; on?: 1; n?: number; k?: 0 | 1; d?: number; w?: RideOffWhy; b?: 1; s?: number };
export type ConnRaftExtra = { g: "raft"; n: number; w: (typeof RAFT_OUT_WHYS)[number]; s?: number };
export type ConnActExtra = ConnRideExtra | ConnRaftExtra;
/** 탄 시간 상한 (초) — 하루 */
const RIDE_SEC_MAX = 86_400;
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
function parseAct(raw: unknown): ConnActExtra | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const s = o.s === undefined ? {} : isInt(o.s, 1, 100_000) ? { s: o.s } : null;
  if (!s) return null;
  if (o.g === "raft") {
    if (!isInt(o.n, 1, 6) || !(RAFT_OUT_WHYS as readonly unknown[]).includes(o.w)) return null;
    return { g: "raft", n: o.n, w: o.w as ConnRaftExtra["w"], ...s };
  }
  if (!(RIDE_GEARS as readonly unknown[]).includes(o.g) || !isMap(o.m)) return null;
  const out: ConnRideExtra = { g: o.g as RideGear, m: o.m, ...s };
  if (o.on !== undefined) {
    if (o.on !== 1) return null;
    out.on = 1;
  }
  if (o.n !== undefined) {
    if (!isInt(o.n, 1, 99)) return null;
    out.n = o.n;
  }
  if (o.k !== undefined) {
    if (o.k !== 0 && o.k !== 1) return null;
    out.k = o.k;
  }
  // 탄 시간·까닭·접음은 내림 줄에만
  if (o.d !== undefined) {
    if (out.on || !isInt(o.d, 0, RIDE_SEC_MAX)) return null;
    out.d = o.d;
  }
  if (o.w !== undefined) {
    if (out.on || !(RIDE_OFF_WHYS as readonly unknown[]).includes(o.w)) return null;
    out.w = o.w as RideOffWhy;
  }
  if (o.b !== undefined) {
    if (out.on || o.b !== 1) return null;
    out.b = 1;
  }
  return out;
}
/** 지금 아는 줄 종류. 이 밖의 종류(앞으로 더할 것)는 웹이 그 줄만 버린다 (internal.ts connLog) */
export const CONN_KINDS = ["i", "o", "m", "t", "r"] as const;
/** 모양은 줄 같은데(배열 6·7칸, 방문자 id, 종류 글자) 모르는 종류 — 묶음을 버리지 않고 그 줄만 건너뛴다 */
export function isUnknownConnKind(raw: unknown): boolean {
  if (!Array.isArray(raw) || (raw.length !== 6 && raw.length !== 7)) return false;
  const [v, k] = raw as unknown[];
  return typeof v === "string" && VISITOR_RE.test(v) && typeof k === "string" && /^[a-z]{1,4}$/.test(k) && !(CONN_KINDS as readonly string[]).includes(k);
}

/** 한 번에 넘기는 최대 줄 수 (8KB 서명 본문 안) */
export const CONN_LOG_BATCH = 60;
/** 11/28 한 묶음 줄들의 JSON 글자 수 상한 (서명 본문 8,000자 — verifyInternal — 에서 머리·꼬리 몫을 뺀 것). 긴 줄(다른 탭 등)이 60줄 모이면 넘던 것 */
export const CONN_LOG_BODY_MAX = 7_600;
/** 로비가 모아 두었다가 넘기는 간격 */
export const CONN_LOG_FLUSH_MS = 60_000;

const VISITOR_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** 받은 한 줄 검사 (틀리면 null) */
export function parseConnWire(raw: unknown): ConnLogWire | null {
  if (!Array.isArray(raw) || (raw.length !== 6 && raw.length !== 7)) return null;
  const [v, k, at, ch, dev, why, extra] = raw as unknown[];
  if (typeof v !== "string" || !VISITOR_RE.test(v)) return null;
  // 11/27 맵 옮김·다시 접속 줄 (일곱 칸) · 11/28 실시간 서버 동작 줄 "r"
  if (k === "m" || k === "t" || k === "r") {
    if (raw.length !== 7 || why !== "") return null;
    if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return null;
    if (typeof ch !== "number" || !Number.isInteger(ch) || ch < 0 || ch > 1000) return null;
    if (typeof dev !== "string" || dev.length > 30) return null;
    if (k === "r") {
      const a = parseAct(extra);
      return a ? [v, "r", at, ch, dev, "", a] : null;
    }
    const x = parseExtra(extra);
    return x ? [v, k, at, ch, dev, "", x] : null;
  }
  if (raw.length !== 6) return null;
  if (k !== "i" && k !== "o") return null;
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return null;
  if (typeof ch !== "number" || !Number.isInteger(ch) || ch < 0 || ch > 1000) return null;
  if (typeof dev !== "string" || dev.length > 30) return null;
  if (why !== "" && !(CONN_WHYS as readonly unknown[]).includes(why)) return null;
  return [v, k, at, ch, dev, why as ConnWhy | ""];
}
