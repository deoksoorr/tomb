// 같은 사람(여러 계정) 판정에 쓰는 기기 표시·브라우저 환경 (서버 lib/sameUser.ts가 비밀값 HMAC으로 바꿔 90일 보관한다).
//  - 기기 표시: 이 브라우저에 처음 만든 무작위 값. 「새로 시작」·로그아웃에도 지우지 않는다 (서버 쿠키 tdev와 같은 역할 — 둘 중 하나만 남아도 이어진다)
//  - 브라우저 환경: UA·플랫폼·언어·시간대·화면 크기·배율·코어 수를 묶은 SHA-256 (원래 값은 보내지 않는다)
// 세션 발급·입장·추천인 정하기 요청에 머리글로 붙인다 (그 밖의 요청에는 붙이지 않는다)

const DEVICE_KEY = "tomb.device";
const DEV_RE = /^[A-Za-z0-9_-]{16,64}$/;

function deviceId(): string | null {
  try {
    const had = localStorage.getItem(DEVICE_KEY);
    if (had && DEV_RE.test(had)) return had;
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return null;
  }
}

let fpCache: Promise<string | null> | null = null;

function fingerprint(): Promise<string | null> {
  fpCache ??= (async () => {
    try {
      const n = navigator as Navigator & { userAgentData?: { platform?: string } };
      const parts = [
        n.userAgent,
        n.userAgentData?.platform ?? n.platform ?? "",
        (n.languages ?? [n.language]).join(","),
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
        `${screen.width}x${screen.height}`,
        String(window.devicePixelRatio ?? 1),
        String(n.hardwareConcurrency ?? 0),
      ].join("|");
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return null;
    }
  })();
  return fpCache;
}

/** 세션·입장·추천인 정하기 요청에 붙일 머리글 (못 만들면 빈 값 — 요청은 그대로) */
export async function deviceHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const [dev, fp] = [deviceId(), await fingerprint()];
  return { ...(dev ? { "x-tomb-dev": dev } : {}), ...(fp ? { "x-tomb-fp": fp } : {}) };
}
