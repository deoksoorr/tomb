import type { MapId } from "@tomb/protocol";

// 11/22 채널 창 「같이 있는 사람」 (peers:ask 답). 실내(집 안·상점·사냥터)에 들어간 사람은 월드 방에 남아 있어도 이 맵 목록에서 뺀다
//  — 운영자 창에서 「집 안」에도 같은 이름이 나와 두 번 세이던 문제. 일반 유저는 그만큼 「이 맵이 아닌 곳에 N명」으로 센다

type Peer = { readonly name: string; readonly away: boolean; readonly view: { readonly staff?: boolean } };

/** 지금 맵에 보이는 사람 닉네임 (실내는 빼고) · 그중 운영자 수 */
export function peerList(remotes: Iterable<Peer>, map: MapId): { names: string[]; map: MapId; staff: number } {
  const here = [...remotes].filter((r) => !r.away);
  return { names: here.map((r) => r.name), map, staff: here.filter((r) => r.view.staff).length };
}
