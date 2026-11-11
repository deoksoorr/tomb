import { spotSeatId, type Sid, type SpotKind } from "@tomb/protocol";

// 1인 자리(소품 자리) 규칙 — 한 자리에는 무조건 한 명 (NEXT.md 39).
// 나무 매달리기·그네는 의자처럼 서버 좌석 체계(sit → seat/seatDenied)로 점유한다. 자리 id는 종류 + 앵커 좌표(world.ts spotSeatId).
// 새 1인 자리(낚시 자리·채집 지점·집 안 가구 …)는 protocol SPOT_KINDS + 아래 SPOT_OF·문구에 한 줄씩 더하면 같은 흐름을 탄다.

/** 상호작용 오브젝트 종류 → 1인 자리 종류. 여럿이 함께 쓰는 오브젝트(종·우물·물가 등)는 없다 */
const SPOT_OF: Readonly<Record<string, SpotKind>> = { tree: "hang", swing: "swing" };

/** 누가 먼저 차지했을 때 안내 (E/탭을 눌렀을 때 토스트) */
export const SPOT_TAKEN_TOAST: Readonly<Record<SpotKind, string>> = {
  hang: "누가 먼저 매달려 있어요",
  swing: "누가 먼저 타고 있어요",
};
/** 누가 차지한 자리 앞의 회색 안내 (키 안내 대신) */
export const SPOT_TAKEN_HINT: Readonly<Record<SpotKind, string>> = {
  hang: "누가 매달려 있어요",
  swing: "누가 타고 있어요",
};

export type SpotTarget = { kind: string; ax: number; ay: number };

/** 이 오브젝트의 1인 자리 (없으면 null) */
export function spotOf(o: SpotTarget): { kind: SpotKind; id: string } | null {
  const kind = SPOT_OF[o.kind];
  return kind ? { kind, id: spotSeatId(kind, o.ax, o.ay) } : null;
}

/** 다른 사람이 차지한 자리인지 (내 자리·빈자리는 false) */
export function spotTaken(id: string, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null): boolean {
  const owner = occupied.get(id);
  return owner !== undefined && owner !== mySid;
}

