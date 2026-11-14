import { NextResponse } from "next/server";
import { googleConfig, redirectUri } from "@/lib/googleAuth";
import { handler, json } from "@/lib/http";
import { assertMock, issueMockCode } from "@/lib/googleMock";

// 개발 전용 모의 구글 동의 화면 (운영 404). 고유 번호(sub)를 직접 적어 여러 구글 계정을 흉내 낸다.
// 진짜 구글처럼 client_id·redirect_uri가 등록된 값과 다르면 거절한다 (열린 리디렉트 없음)

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const PASS = ["client_id", "redirect_uri", "response_type", "scope", "state", "nonce", "code_challenge", "code_challenge_method"] as const;

export const GET = handler(async (req) => {
  assertMock();
  const cfg = googleConfig()!;
  const sp = req.nextUrl.searchParams;
  const p = Object.fromEntries(PASS.map((k) => [k, sp.get(k) ?? ""])) as Record<(typeof PASS)[number], string>;
  if (p.client_id !== cfg.clientId || p.redirect_uri !== redirectUri() || p.response_type !== "code" || p.scope !== "openid")
    return json({ error: "invalid_request" }, { status: 400 });
  if (p.code_challenge_method !== "S256" || !p.code_challenge || !p.state || !p.nonce) return json({ error: "invalid_request" }, { status: 400 });

  const back = new URL(p.redirect_uri);
  if (sp.has("cancel")) {
    back.search = new URLSearchParams({ error: "access_denied", state: p.state }).toString();
    return NextResponse.redirect(back, 302);
  }
  const sub = sp.get("sub")?.trim();
  if (sp.has("approve") && sub && /^[\w.-]{1,64}$/.test(sub)) {
    const code = issueMockCode({ sub, nonce: p.nonce, challenge: p.code_challenge, clientId: p.client_id, redirectUri: p.redirect_uri });
    back.search = new URLSearchParams({ code, state: p.state }).toString();
    return NextResponse.redirect(back, 302);
  }

  const hidden = PASS.map((k) => `<input type="hidden" name="${k}" value="${esc(p[k])}">`).join("");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>모의 구글 로그인</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f3f4;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;padding:24px 28px;border-radius:12px;box-shadow:0 2px 10px #0002;width:min(360px,90vw)}
h1{font-size:20px;margin:0 0 4px}p{color:#555;font-size:14px}input[type=text]{width:100%;box-sizing:border-box;padding:10px;font-size:16px;margin:8px 0 16px}
button{padding:10px 16px;font-size:15px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer}button[name=approve]{background:#1a73e8;color:#fff;border-color:#1a73e8}</style></head>
<body><form method="get" action="/api/dev/google/authorize">${hidden}
<h1>모의 구글 (개발 전용)</h1><p>진짜 구글 대신 쓰는 시험 화면이에요. 구글 고유 번호를 적고 계속하세요.</p>
<label>고유 번호 (sub)<input type="text" name="sub" value="mock-user-1" autocomplete="off"></label>
<button type="submit" name="approve" value="1">계속</button> <button type="submit" name="cancel" value="1">취소</button>
</form></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});
