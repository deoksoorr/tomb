import { PEER_SYNC_MS } from "@tomb/protocol";

// 자가 복구(sync) 빈도. 가만히 있는 사람이 서버(DO)를 깨우지 않도록 최소로:
//  - 탭이 보이는 동안에만, PEER_SYNC_MS의 3배(3분)마다
//  - 탭이 다시 보일 때 1회, 이상 징후(모르는 sid의 스냅샷, 인원 수 불일치)일 때만 바로
//  - 어떤 경우에도 SYNC_MIN_GAP_MS 안에 두 번 보내지 않는다
//  - 숨겨진 탭에서는 보내지 않는다 (핑만 남는다)

export const SYNC_EVERY_MS = PEER_SYNC_MS * 3;
export const SYNC_MIN_GAP_MS = 10_000;

export class SyncPolicy {
  private last = -Infinity;

  /** welcome·peers 수신 = 서버 기준 목록을 막 받았다 */
  mark(now: number): void {
    this.last = now;
  }

  /** 주기 확인 (타이머에서): 보이는 탭이고 3분이 지났으면 true */
  periodic(now: number, hidden: boolean): boolean {
    return !hidden && now - this.last >= SYNC_EVERY_MS;
  }

  /** 이상 징후·탭 복귀: 최소 간격만 지키면 true */
  urgent(now: number, hidden: boolean): boolean {
    return !hidden && now - this.last >= SYNC_MIN_GAP_MS;
  }
}

/** 입장 URL(?t=토큰)에서 아바타 몸 모양을 읽는다 (토큰 = base64url(JSON).서명). 없거나 이상하면 null */
export function bodyFromWsUrl(wsUrl: string): string | null {
  try {
    const t = new URL(wsUrl).searchParams.get("t");
    if (!t) return null;
    const payload = t.split(".")[0];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((payload.length + 3) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const c = JSON.parse(new TextDecoder().decode(bytes)) as { body?: unknown };
    return typeof c.body === "string" ? c.body : null;
  } catch {
    return null;
  }
}
