import type { AvatarDye, DyePart } from "@tomb/protocol";
import type { Me } from "../types";
import type { DyeSession, FixedDyeDef, FixedDyeIssue } from "../store/style";

export type { DyeSession, FixedDyeDef, FixedDyeIssue };

// 46·25·30번 API 응답 (계약)

/** 진행 중인 무작위 염색 + 서버 시각 (남은 시간은 화면이 serverNow와 endsAt으로 계산한다) */
export type DyeSessionView = DyeSession & { serverNow: number };

/** GET /api/dye: 진행 중인 판 + 내 가방의 고정 색 염색권 정의. finalized = 시간이 지나 방금 정해진 색 */
export type DyeStateResponse = {
  session: DyeSessionView | null;
  tickets: Record<string, FixedDyeDef>;
  dye: AvatarDye;
  finalized?: { part: DyePart; color: string };
};
/** POST /api/dye/start { itemId, part } → 새 판(또는 진행 중인 판) */
export type DyeStartResponse = { me: Me; session: DyeSessionView; resumed: boolean };
/**
 * 바뀐 염색·몸 모양 + 착용 증서 (게임이 내 아바타에 입히고 실시간 서버로 보낸다).
 * finish: color = 서버가 좌표로 판정한 색, late = 시간이 지나 처음 조준점(판 가운데) 색으로 정해졌음
 */
export type StyleChangeResponse = { me: Me; lookGrant: string; color?: string; part?: DyePart; late?: boolean };
/** 관리자: 고정 색 염색권 정의·발급 기록 */
export type AdminDyeResponse = { defs: FixedDyeDef[]; issues: FixedDyeIssue[] };
export type AdminDyeIssueResponse = { def: FixedDyeDef; giftId: string };
