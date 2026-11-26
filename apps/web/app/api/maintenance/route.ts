import { handler, json } from "@/lib/http";
import { maintForClient, readMaint } from "@/lib/maintenance";
import type { MaintState } from "@tomb/protocol";

/**
 * 11/26 점검 상태 (세션 없어도 됨, 점검 중에도 열려 있다 — proxy.ts). 점검 화면이 30초마다 묻는다.
 * 실시간 서버 값을 이 인스턴스가 15초 기억한 것 (Redis 안 씀)
 */
export const GET = handler(async () => {
  return json<MaintState>(maintForClient(await readMaint()), { headers: { "Cache-Control": "no-store" } });
});
