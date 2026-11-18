import type { LobbyInfo } from "@tomb/protocol";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { fetchLobbyServer } from "@/lib/joinToken";

/** 채널별 인원·용량 (실시간 서버 로비 프록시) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  // 관리 화면은 인스턴스 기억 없이 늘 새로. 11/18 실시간 서버 배포 순간(운영 오류 11/17 08:01 2건)엔 한 번 더 묻는다
  const lobby = (await fetchLobbyServer(5000, 0)) ?? (await new Promise((r) => setTimeout(r, 400)).then(() => fetchLobbyServer(4000, 0)));
  if (!lobby) throw new HttpError(502, "LOBBY_UNAVAILABLE", "실시간 서버 로비에 연결할 수 없어요.");
  return json<LobbyInfo>(lobby);
});
