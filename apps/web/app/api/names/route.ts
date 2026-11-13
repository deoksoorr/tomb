import { checkName, NAME_TAKEN_MESSAGE, nameKey } from "@tomb/protocol";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId, requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { NameCheckResponse, NameClaimResponse } from "@/lib/types";
import { NameChangeSchema, readBody } from "@/lib/validate";

/**
 * 닉네임 미리 확인 `?name=` (입력 중 디바운스로 부른다). 이름 규칙(@tomb/protocol checkName)과 중복을 함께 본다.
 * 중복은 비교 키(nameKey: 공백·_ 제거 + 소문자)로 보므로 "홍길동"과 "홍 길동"은 같은 이름이다. 내 계정이 쓰는 이름이면 ok.
 * 미리 확인일 뿐이고, 실제 등록·변경(POST 여기 · /api/me/name · /api/join)이 원자적으로 다시 판정한다
 */
export const GET = handler(async (req) => {
  await rateLimit("detail", req);
  const check = checkName(req.nextUrl.searchParams.get("name") ?? "");
  if (!check.ok) return json<NameCheckResponse>({ ok: false, reason: check.reason });
  const [owner, me] = await Promise.all([getAccounts().nameOwner(nameKey(check.name), Date.now()), getVisitorId(req)]);
  if (owner && owner !== me) return json<NameCheckResponse>({ ok: false, reason: NAME_TAKEN_MESSAGE });
  return json<NameCheckResponse>({ ok: true, name: check.name });
});

/**
 * 이 계정 이름 등록 `{ name }`: 계정에 이름이 아직 없을 때(처음 시작·이름 없는 계정으로 코드 입장) 또는
 * 휴면에서 돌아와 닉네임을 다시 정할 때. 무료이고 대기 기간을 만들지 않는다 (바꾸기는 /api/me/name).
 * 다른 계정이 쓰는 이름이면 409 NAME_TAKEN (휴면 계정이 차지한 이름은 가져온다)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { name } = await readBody(req, NameChangeSchema);
  await rateLimit("join", req, visitorId);
  const accounts = getAccounts();
  const now = Date.now();
  // 휴면 판정을 먼저 한다 (계정 확인 없이 바로 부른 경우에도 재설정 대상이 되게)
  await accounts.visit(visitorId, now, false);
  const r = await accounts.claimName(visitorId, name, now);
  if (r === "taken") throw new HttpError(409, "NAME_TAKEN", NAME_TAKEN_MESSAGE);
  if (r === "has") throw new HttpError(409, "NAME_ALREADY_SET", "이미 이름이 있어요. 닉네임은 내 정보에서 바꿀 수 있어요.");
  return json<NameClaimResponse>({ me: await loadMe(accounts, visitorId, now) });
});
