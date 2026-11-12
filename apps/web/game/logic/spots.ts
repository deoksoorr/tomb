import { spotSeatId, type Sid, type SpotKind } from "@tomb/protocol";

// 1인 자리(소품 자리) 규칙 — 한 자리에는 무조건 한 명 (NEXT.md 39).
// 나무 매달리기·그네는 의자처럼 서버 좌석 체계(sit → seat/seatDenied)로 점유한다. 자리 id는 종류 + 앵커 좌표(world.ts spotSeatId).
// 새 1인 자리(낚시 자리·채집 지점·집 안 가구 …)는 protocol SPOT_KINDS + 아래 SPOT_OF·문구에 한 줄씩 더하면 같은 흐름을 탄다.

/** 상호작용 오브젝트 종류 → 1인 자리 종류. 여럿이 함께 쓰는 오브젝트(종·우물·물가 등)는 없다 */
const SPOT_OF: Readonly<Record<string, SpotKind>> = { tree: "hang", swing: "swing", hammock: "hammock", telescope: "telescope", mat: "mat", seesaw: "seesaw", trampoline: "trampoline" };

/** 누가 먼저 차지했을 때 안내 (E/탭을 눌렀을 때 토스트) */
export const SPOT_TAKEN_TOAST: Readonly<Record<SpotKind, string>> = {
  hang: "누가 먼저 매달려 있어요",
  swing: "누가 먼저 타고 있어요",
  hammock: "누가 먼저 누워 있어요",
  // 50번 조각배·광장 놀거리
  boat: "그 배는 누가 타고 있어요",
  seesaw: "누가 먼저 앉아 있어요",
  trampoline: "누가 먼저 뛰고 있어요",
  carousel: "누가 먼저 타고 있어요",
  telescope: "누가 먼저 망원경을 보고 있어요",
  mat: "누가 먼저 앉아 있어요",
  fish: "누가 먼저 낚시하고 있어요",
  // 놀이기구 2
  ferris: "그 칸에는 누가 먼저 탔어요",
  balloon: "열기구가 막 떠났거나 자리가 찼어요. 다음 기구를 기다려 주세요",
  // 3번 집 안 가구
  chair: "누가 먼저 앉아 있어요",
  bed: "누가 먼저 누워 있어요",
  book: "누가 먼저 책을 읽고 있어요",
  tub: "누가 먼저 들어가 있어요",
};
/** 누가 차지한 자리 앞의 회색 안내 (키 안내 대신) */
export const SPOT_TAKEN_HINT: Readonly<Record<SpotKind, string>> = {
  hang: "누가 매달려 있어요",
  swing: "누가 타고 있어요",
  hammock: "누가 누워 있어요",
  boat: "누가 타고 있어요",
  seesaw: "누가 앉아 있어요",
  trampoline: "누가 뛰고 있어요",
  carousel: "목마가 모두 찼어요",
  telescope: "누가 별을 보고 있어요",
  mat: "누가 앉아 있어요",
  fish: "누가 낚시하고 있어요",
  ferris: "칸이 다 찼어요",
  balloon: "열기구가 다 찼어요",
  chair: "누가 앉아 있어요",
  bed: "누가 누워 있어요",
  book: "누가 읽고 있어요",
  tub: "누가 들어가 있어요",
};

/** forage = 4번 낚시 자리면 "fish:{자리 id}" (game/world/forage가 붙인 상호작용) */
export type SpotTarget = { kind: string; ax: number; ay: number; forage?: string };

/** 이 오브젝트의 1인 자리 (없으면 null) */
export function spotOf(o: SpotTarget): { kind: SpotKind; id: string } | null {
  if (o.forage?.startsWith("fish:")) return { kind: "fish", id: o.forage.slice(5) };
  const kind = SPOT_OF[o.kind];
  return kind ? { kind, id: spotSeatId(kind, o.ax, o.ay) } : null;
}

/** 다른 사람이 차지한 자리인지 (내 자리·빈자리는 false) */
export function spotTaken(id: string, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null): boolean {
  const owner = occupied.get(id);
  return owner !== undefined && owner !== mySid;
}

