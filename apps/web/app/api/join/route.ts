import { NAME_TAKEN_MESSAGE, staffPublicName } from "@tomb/protocol";
import { assertNotBanned, recordSeen } from "@/lib/ban";
import { announceFriends } from "@/lib/friends";
import { dexBadgeOf } from "@/lib/forage/service";
import { handler, HttpError, json } from "@/lib/http";
import { issueJoin } from "@/lib/joinToken";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { getStyleStore } from "@/lib/store/style";
import { kstDay, lookOf } from "@/lib/store/accounts";
import { DORMANT_RENAME_MESSAGE, type JoinResponse } from "@/lib/types";
import { JoinRequestSchema, readBody } from "@/lib/validate";

/**
 * 입장 토큰(60초) 발급. 채널 상한은 Channel DO가 강제하고, 여기서는 채널만 고른다.
 * 전체 만석이면 대기열 주소(`{ mode: "queue" }`)를 준다. 토큰에는 몸 모양(요청에 없으면 계정 값)과 착용 중인 꾸미기가 들어간다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { channel, name, color, body } = await readBody(req, JoinRequestSchema);
  await rateLimit("join", req, visitorId);
  // 47번: 실시간 서버로 들어가는 문이라 캐시 없이 다시 판정하고, 계정의 접속 IP(해시)를 가볍게 남긴다
  await assertNotBanned(req, visitorId, true);
  const now = Date.now();
  await recordSeen(req, visitorId, now);
  const accounts = getAccounts();
  // 닉네임 중복 금지: 휴면(90일)에서 돌아왔으면 닉네임을 다시 정해야 들어온다 (입장 화면이 먼저 안내한다)
  const { renameRequired } = await accounts.visit(visitorId, now, true);
  if (renameRequired) throw new HttpError(409, "RENAME_REQUIRED", DORMANT_RENAME_MESSAGE);
  const [account, style, staff, dex] = await Promise.all([
    accounts.get(visitorId, kstDay(now), now),
    getStyleStore(accounts).get(visitorId),
    isStaff(visitorId),
    dexBadgeOf(visitorId),
  ]);
  // 머리 위 이름은 계정 이름이 정답. 계정에 아직 이름이 없으면 요청 이름을 이름 색인과 함께 등록한다 (다른 계정이 쓰면 거절)
  let shown = account.name;
  if (!shown) {
    const claimed = await accounts.claimName(visitorId, name, now);
    if (claimed === "taken") throw new HttpError(409, "NAME_TAKEN", NAME_TAKEN_MESSAGE);
    shown = claimed === "ok" ? name : ((await accounts.get(visitorId, kstDay(now), now)).name ?? name);
  }
  // 25번 외형 바꾸기: 계정에 몸 모양이 있으면 그것이 정답 (요청 값은 입장 화면에서 처음 고른 몸)
  // 31번: 운영자 표시는 여기(서버)에서만 넣는다. 운영자는 다른 사람에게 닉네임 대신 공개 이름("대장")로 보인다
  const claims = { visitorId, name: staffPublicName(shown, staff), color, body: account.body ?? body ?? "hood", look: lookOf(account), dye: style.dye, ...(staff ? { staff: true as const } : {}), ...(dex ? { dex } : {}) };
  // 친구: 들어오는 순간·나간 뒤 5초에 친구들에게 바로 알리도록 실시간 서버에 맡긴다 (친구가 없으면 아무것도 안 한다, 실패해도 입장은 그대로)
  await announceFriends(visitorId, now).catch(() => undefined);
  return json<JoinResponse>(await issueJoin(channel, claims));
});
