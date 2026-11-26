import { refDomain } from "./analytics";
import type { SrcInput } from "./signupSource";

// 11/26 가입 유입 경로 (브라우저). 탭 세션의 첫 화면에서 한 번: 리퍼러 호스트만 + utm 세 값을
//  - sessionStorage(이번 접속 유입 — /api/join 첫 요청에 실린다)
//  - localStorage(처음 방문 유입 — 이미 있으면 그대로, 입장 기록 /api/me/attend에 실려 계정이 처음 만들어질 때만 저장된다)
// 에 둔다. 전체 주소·검색어는 남기지 않는다. 저장소가 막힌 브라우저면 그냥 없음.

const FIRST_KEY = "tomb.src";
const SESSION_KEY = "tomb.ssrc";

/** 지금 화면의 유입 (우리 사이트 안에서 넘어온 리퍼러는 빈칸) */
export function currentSource(href: string, referrer: string): SrcInput {
  const u = new URL(href);
  const q = u.searchParams;
  const host = refDomain(referrer);
  const self = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const r = host && host !== self && host !== "localhost" && !host.endsWith(".vercel.app") ? host : undefined;
  const pick = (k: string) => q.get(k)?.slice(0, 60) || undefined;
  const src: NonNullable<SrcInput> = {};
  if (r) src.r = r;
  const us = pick("utm_source");
  const um = pick("utm_medium");
  const uc = pick("utm_campaign");
  if (us) src.us = us;
  if (um) src.um = um;
  if (uc) src.uc = uc;
  return src;
}

/** 탭 세션의 첫 화면에서 부른다 (VisitTracker) */
export function captureSource(): void {
  try {
    const src = JSON.stringify(currentSource(window.location.href, document.referrer));
    sessionStorage.setItem(SESSION_KEY, src);
    if (!localStorage.getItem(FIRST_KEY)) localStorage.setItem(FIRST_KEY, src);
  } catch {
    // 저장소가 막힌 브라우저
  }
}

function read(store: () => Storage, key: string): SrcInput | undefined {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as SrcInput) : undefined;
  } catch {
    return undefined;
  }
}

/** 처음 방문 유입 (계정 만들 때) */
export const firstSource = (): SrcInput | undefined => read(() => localStorage, FIRST_KEY);
/** 이번 접속 유입 (입장 첫 요청) */
export const sessionSource = (): SrcInput | undefined => read(() => sessionStorage, SESSION_KEY);
