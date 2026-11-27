import { hmacSign, hmacVerify } from "./token";

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
 */
export type ConnLogWire = [string, "i" | "o", number, number, string, ConnWhy | ""];
/** 한 번에 넘기는 최대 줄 수 (8KB 서명 본문 안) */
export const CONN_LOG_BATCH = 60;
/** 로비가 모아 두었다가 넘기는 간격 */
export const CONN_LOG_FLUSH_MS = 60_000;

const VISITOR_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** 받은 한 줄 검사 (틀리면 null) */
export function parseConnWire(raw: unknown): ConnLogWire | null {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const [v, k, at, ch, dev, why] = raw as unknown[];
  if (typeof v !== "string" || !VISITOR_RE.test(v)) return null;
  if (k !== "i" && k !== "o") return null;
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return null;
  if (typeof ch !== "number" || !Number.isInteger(ch) || ch < 0 || ch > 1000) return null;
  if (typeof dev !== "string" || dev.length > 30) return null;
  if (why !== "" && !(CONN_WHYS as readonly unknown[]).includes(why)) return null;
  return [v, k, at, ch, dev, why as ConnWhy | ""];
}
