import type { LobbyInfo } from "@tomb/protocol";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { fetchLobbyServer } from "@/lib/joinToken";

/** 채널별 인원·용량 (실시간 서버 로비 프록시) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const lobby = await fetchLobbyServer(5000);
  if (!lobby) throw new HttpError(502, "LOBBY_UNAVAILABLE", "실시간 서버 로비에 연결할 수 없어요.");
  return json<LobbyInfo>(lobby);
});
