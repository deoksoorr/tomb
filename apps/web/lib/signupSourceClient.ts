import { refDomain } from "./analytics";
import type { SrcInput } from "./signupSource";

// 11/26 가입 유입 경로 (브라우저). 탭 세션에서 한 번(아직 없을 때): 리퍼러 호스트만 + utm 세 값을
//  - sessionStorage(이번 접속 유입 — /api/join 첫 요청에 실린다)
//  - localStorage(처음 방문 유입 — 이미 있으면 그대로, 입장 기록 /api/me/attend에 실려 계정이 처음 만들어질 때만 저장된다)
// 에 둔다. 전체 주소·검색어는 남기지 않는다. 저장소가 막힌 브라우저면 보낼 때 지금 화면 것으로.

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

/** 지금 화면의 유입 (저장소를 못 쓸 때 대신) */
function here(): SrcInput | undefined {
  try {
    return currentSource(window.location.href, document.referrer);
  } catch {
    return undefined;
  }
}

/**
 * 화면을 열 때마다 부른다 (VisitTracker). 이번 탭에 유입이 아직 없을 때만 남긴다 — 탭 세션의 첫 화면 것이 이번 접속 유입.
 * 11/27 예전엔 「이 탭 첫 방문」(tomb.visit)일 때만 남겨, 기능 배포 전에 열어 둔 탭(새로고침해도 sessionStorage가 남는다)은
 * 유입 칸이 끝내 비어 입장 때 빈 값({})을 보냈고 관리자에 모두 「직접·알 수 없음」으로 보였다. 새로고침해도 document.referrer는 그대로라 지금 남겨도 맞다
 */
export function captureSource(): void {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    const src = JSON.stringify(currentSource(window.location.href, document.referrer));
    sessionStorage.setItem(SESSION_KEY, src);
    if (!localStorage.getItem(FIRST_KEY)) localStorage.setItem(FIRST_KEY, src);
  } catch {
    // 저장소가 막힌 브라우저 — 보낼 때 지금 화면 것으로 (here)
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

/** 이번 접속 유입 (입장 첫 요청). 저장소를 못 쓰면 지금 화면 것 */
export const sessionSource = (): SrcInput | undefined => read(() => sessionStorage, SESSION_KEY) ?? here();
/** 처음 방문 유입 (계정 만들 때). 없으면 이번 접속 것 */
export const firstSource = (): SrcInput | undefined => read(() => localStorage, FIRST_KEY) ?? sessionSource();
