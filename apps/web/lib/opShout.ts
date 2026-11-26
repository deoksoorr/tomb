// 11/26 운영자 외치기: 관리자 화면 [운영자 외치기] 칸과 게임 채팅 「/외치기 할 말」(운영자 계정만)이 같은 검사·중계(lib/opShoutSend)를 쓴다.
// 모든 채널(마을·바닷가·캠핑장, 집·사냥터 안에 있어도 월드 채널 소켓이 받는다)에 확성기와 같은 가운데 알림으로 뜨고, 어디에도 남기지 않는다
// (확성기 기록·채팅 기록·신고·계정 기록·분석 모두 아님 — 늦게 들어온 사람은 못 본다. 남는 건 5초 간격 표시뿐).
// 실시간 서버는 마을 공지(/internal/say)와 같은 길로 보낸다 → 실시간 서버 배포 없이 된다.
// 줄 id가 OP_SHOUT_PREFIX로 시작하면 새 화면은 「운영자」 알림으로 그리고 소식 기록에 넣지 않는다.
// 이 화면보다 옛 화면은 같은 줄을 「마을 소식」 알림(종 아이콘·글만)으로 그린다 — 오류 없이 보이고 새로고침하면 사라진다.

/** 운영자 외치기 줄 id 앞부분 (실시간 서버 say의 id 규칙 [A-Za-z0-9_-]에 맞게) */
export const OP_SHOUT_PREFIX = "ops-";
/** 보낸 이 이름 (계정 닉네임은 내보내지 않는다) */
export const OP_SHOUT_NAME = "운영자";
/** 두 번 외치는 사이 최소 간격 (관리자 화면·게임 운영자 계정 모두 합쳐 한 번) */
export const OP_SHOUT_GAP_MS = 5_000;

/** 운영자 외치기 줄인지 (실시간으로 온 확성기 줄의 id로) */
export const isOpShout = (e: { id: string }) => e.id.startsWith(OP_SHOUT_PREFIX);

/** 채팅 명령: 「/외치기 할 말」 */
export const SHOUT_COMMAND = "/외치기";
const COMMAND_RE = /^\/외치기(?=\s|$)/;

/** 채팅 입력이 외치기 명령으로 시작하는지 (일반 채팅으로 내보내지 않는다) */
export function isShoutCommand(raw: string): boolean {
  return COMMAND_RE.test(raw.normalize("NFC").trimStart());
}

/** 명령 뒤 할 말 (앞뒤 공백 정리, 비었으면 ""). 명령이 아니면 null */
export function shoutCommandText(raw: string): string | null {
  const s = raw.normalize("NFC").trimStart();
  if (!COMMAND_RE.test(s)) return null;
  return s.replace(COMMAND_RE, "").replace(/\s+/g, " ").trim();
}

/** POST /api/admin/shout · /api/staff/shout 응답: 띄운 채널 수와 실제로 띄운 글(한 줄로 고른 것) */
export type OpShoutResponse = { sent: number; text: string };
