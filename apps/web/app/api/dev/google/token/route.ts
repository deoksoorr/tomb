import { googleConfig } from "@/lib/googleAuth";
import { handler, json } from "@/lib/http";
import { assertMock, redeemMockCode } from "@/lib/googleMock";

/** 개발 전용 모의 구글: 인가 코드 → id_token (운영 404). 진짜 구글처럼 form 본문을 받는다 */
export const POST = handler(async (req) => {
  assertMock();
  const cfg = googleConfig();
  const f = new URLSearchParams(await req.text());
  const idToken =
    cfg &&
    f.get("grant_type") === "authorization_code" &&
    redeemMockCode(
      {
        code: f.get("code") ?? "",
        verifier: f.get("code_verifier") ?? "",
        clientId: f.get("client_id") ?? "",
        clientSecret: f.get("client_secret") ?? "",
        redirectUri: f.get("redirect_uri") ?? "",
      },
      cfg,
    );
  if (!idToken) return json({ error: "invalid_grant" }, { status: 400 });
  return json({ id_token: idToken, access_token: "mock-access", token_type: "Bearer", expires_in: 3600, scope: "openid" });
});
