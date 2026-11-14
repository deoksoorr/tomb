import { env } from "./env";
import { HttpError } from "./http";
import { INQUIRY_CATEGORIES, type InquiryCategory } from "./types";

// 문의 → 운영자의 GitHub 저장소 이슈. 토큰과 이슈 주소는 클라이언트에 주지 않는다.

const API = "https://api.github.com";
const TIMEOUT_MS = 8_000;
const VISIBILITY_TTL_MS = 10 * 60_000;

type GitHub = { token: string; repo: string };

function gh(conf: GitHub, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${conf.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "hanttae-inquiry",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

let visibility: { repo: string; public: boolean; at: number } | null = null;

/**
 * 저장소가 공개인지 (공개면 문의 내용이 누구에게나 보인다 → UI가 안내한다). 10분 캐시.
 * 조회에 실패하면 공개로 본다 (공개인데 비공개라고 안내하는 쪽이 더 위험하다).
 */
export async function inquiryInfo(now = Date.now()): Promise<{ enabled: boolean; public: boolean }> {
  const conf = env.github();
  if (!conf) return { enabled: false, public: false };
  if (visibility?.repo === conf.repo && now - visibility.at < VISIBILITY_TTL_MS) return { enabled: true, public: visibility.public };
  let isPublic = true;
  try {
    const res = await gh(conf, `/repos/${conf.repo}`);
    if (res.ok) isPublic = !((await res.json()) as { private?: boolean }).private;
  } catch {
    // 네트워크 실패: 공개로 본다
  }
  visibility = { repo: conf.repo, public: isPublic, at: now };
  return { enabled: true, public: isPublic };
}

/** 사용자 글을 코드 블록에 넣는다. 본문 안의 어떤 백틱 줄보다 긴 펜스를 써서 블록을 빠져나올 수 없다 → 링크·멘션·마크다운이 작동하지 않는다 */
export function fenced(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

/** 제목은 마크다운이 아니지만 @멘션·#참조가 걸리지 않게 전각 문자로 바꾸고 한 줄로 */
const safeTitle = (s: string) => s.replace(/\s+/g, " ").replace(/@/g, "＠").replace(/#/g, "＃").trim();

export type InquiryIssue = {
  category: InquiryCategory;
  message: string;
  contact?: string;
  accountId: string;
  /** 보낸 사람의 지금 닉네임 (없으면 이름 없는 계정) */
  name?: string | null;
  /** 문의 저장소가 비공개일 때만 계정 id를 전부 적는다 (공개 저장소면 앞 6자만) */
  fullId?: boolean;
  channel?: number;
  userAgent: string | null;
};

export function buildIssue(i: InquiryIssue): { title: string; body: string; labels: string[] } {
  const label = INQUIRY_CATEGORIES.find((c) => c.id === i.category)!.label;
  const head = [...i.message.replace(/\s+/g, " ")].slice(0, 40).join("");
  const meta = [
    `카테고리: ${label}`,
    // 관리자 회원 탭에서 바로 찾아 코드 재발급할 수 있게 계정 id 전체 (비공개 저장소일 때만. id는 로그인 열쇠가 아니고, 로그인 코드는 해시로만 저장돼 넣을 수 없다)
    `계정: ${i.fullId ? i.accountId : `${i.accountId.slice(0, 6)}… (문의 저장소가 공개라 앞부분만)`}`,
    `닉네임: ${i.name ?? "(이름 없음)"}`,
    `채널: ${i.channel ?? "알 수 없음"}`,
    `User-Agent: ${(i.userAgent ?? "알 수 없음").slice(0, 300)}`,
  ].join("\n");
  const body = [
    "### 내용",
    fenced(i.message),
    "### 연락처",
    i.contact ? fenced(i.contact) : "_없음_",
    "### 보낸 곳",
    fenced(meta),
  ].join("\n\n");
  return { title: safeTitle(`[문의·${label}] ${head}`), body, labels: ["문의", label] };
}

/** 설정(토큰·저장소)이 없으면 503 */
export function inquiryConfig(): GitHub {
  const conf = env.github();
  if (!conf) throw new HttpError(503, "INQUIRY_DISABLED", "문의 기능을 준비하고 있어요. 조금 뒤에 다시 찾아와 주세요.");
  return conf;
}

/**
 * 이슈 만들기. 라벨을 못 붙이면(라벨이 없고 만들 권한도 없는 등 422) 라벨 없이 한 번 더 시도한다.
 * 설정이 없으면 503, GitHub이 실패하면 502.
 */
export async function createInquiryIssue(i: InquiryIssue): Promise<void> {
  const conf = inquiryConfig();
  const issue = buildIssue(i);
  const post = (payload: object) => gh(conf, `/repos/${conf.repo}/issues`, { method: "POST", body: JSON.stringify(payload) });
  let res: Response;
  try {
    res = await post(issue);
    if (res.status === 422) res = await post({ title: issue.title, body: issue.body });
  } catch (e) {
    console.error("[inquiry] GitHub 요청 실패", e);
    throw new HttpError(502, "INQUIRY_FAILED", "문의를 전하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
  }
  if (!res.ok) {
    console.error("[inquiry] GitHub 이슈 생성 실패", res.status);
    throw new HttpError(502, "INQUIRY_FAILED", "문의를 전하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
  }
}
