// 귀신의집 귀신 종류 (순수 데이터·함수 — 테스트한다). 그림은 ghostArt.ts, 움직임은 HauntScene.ts, 소리는 hauntSound.ts.
// 이 게임의 픽셀 그림체로 따로 지은 귀신들이다 (특정 영화·게임 캐릭터를 본뜨지 않는다).
//  - 숨는 귀신(lurk): 한자리에 숨어 있다가 가까이 오면 저마다의 방식으로 나타난다
//  - 돌아다니는 귀신(patrol): 정해진 길을 오가다 나를 알아채면 저마다의 방식으로 다가온다
//  - tier(1..4): 무서운 정도. 미로 안에서 입구에서 멀수록(출구 쪽일수록) 더 무서운 귀신이 나온다
//  - 한 판 안에서는 같은 귀신이 두 번 나오지 않는다 (숨는 자리·도는 길 수가 종류 수를 넘지 않는다)

export type GhostLook =
  | "hanger" // 천장에서 거꾸로 내려오는 긴 머리 여자
  | "hands" // 벽에서 튀어나오는 창백한 손들
  | "mirror" // 따로 움직이는 거울 속 그림자
  | "eye" // 벽 틈으로 따라 보는 눈
  | "dollhead" // 굴러오는 인형 머리
  | "crawler" // 네 발로 기어 오는 아이
  | "broken" // 목이 꺾인 채 끊기듯 다가오는 형체
  | "sobok" // 순간이동하며 가까워지는 흰 소복
  | "shadow" // 촛불 빛 밖에서만 움직이는 검은 그림자
  | "mannequin"; // 눈을 깜빡일(어두워질) 때마다 가까워지는 마네킹

export type GhostMode = "patrol" | "lurk";

export type GhostInfo = {
  look: GhostLook;
  mode: GhostMode;
  /** 무서운 정도 1..4 */
  tier: number;
  /** 이름 (주석·디버그용) */
  name: string;
};

export const GHOST_INFO: Record<GhostLook, GhostInfo> = {
  eye: { look: "eye", mode: "lurk", tier: 1, name: "문틈의 눈" },
  dollhead: { look: "dollhead", mode: "lurk", tier: 2, name: "굴러오는 인형 머리" },
  hands: { look: "hands", mode: "lurk", tier: 2, name: "벽 속의 손" },
  mirror: { look: "mirror", mode: "lurk", tier: 3, name: "거울 속 그것" },
  hanger: { look: "hanger", mode: "lurk", tier: 4, name: "천장의 여자" },
  shadow: { look: "shadow", mode: "patrol", tier: 1, name: "빛 밖의 그림자" },
  sobok: { look: "sobok", mode: "patrol", tier: 2, name: "흰 소복" },
  mannequin: { look: "mannequin", mode: "patrol", tier: 3, name: "마네킹" },
  crawler: { look: "crawler", mode: "patrol", tier: 3, name: "기어 오는 아이" },
  broken: { look: "broken", mode: "patrol", tier: 4, name: "목 꺾인 것" },
};

export const GHOST_LOOKS = Object.keys(GHOST_INFO) as GhostLook[];
export const LURK_LOOKS = GHOST_LOOKS.filter((l) => GHOST_INFO[l].mode === "lurk");
export const PATROL_LOOKS = GHOST_LOOKS.filter((l) => GHOST_INFO[l].mode === "patrol");

/**
 * 귀신마다 종류를 정한다. progress[i] = i번째 귀신이 입구에서 떨어진 걸음 수 (클수록 안쪽).
 * 숨음·순찰을 따로: 그 무리 종류 중 몇 개를 무작위로 고른 뒤 무서운 순(같은 단계끼리는 무작위)으로,
 * 입구에서 가까운 귀신부터 차례로 붙인다 → 판마다 섞이고, 깊이 들어갈수록 무서워진다.
 * 종류보다 귀신이 많으면 한 바퀴 더 돌되 바로 앞과 같은 종류는 피한다.
 */
export function assignLooks(modes: readonly GhostMode[], progress: readonly number[], r: () => number): GhostLook[] {
  const out: GhostLook[] = new Array(modes.length);
  for (const mode of ["lurk", "patrol"] as const) {
    const idx = modes.map((m, i) => (m === mode ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const pool = shuffled(mode === "lurk" ? LURK_LOOKS : PATROL_LOOKS, r);
    // 한 바퀴(종류 수만큼)씩 무서운 순으로 (같은 단계는 섞인 순서 그대로 = 무작위).
    // 종류보다 귀신이 많을 때만 두 바퀴째가 생기고, 바퀴 사이는 가장 무서운 것 → 가장 덜 무서운 것이라 같은 종류가 붙지 않는다
    const order: GhostLook[] = [];
    for (let k = 0; k < idx.length; k += pool.length) {
      const n = Math.min(pool.length, idx.length - k);
      // 모자란 바퀴는 바로 앞 것을 빼고 고른다
      const round = n < pool.length ? pool.filter((l) => l !== order[order.length - 1]).slice(0, n) : pool.slice();
      round.sort((a, b) => GHOST_INFO[a].tier - GHOST_INFO[b].tier || pool.indexOf(a) - pool.indexOf(b));
      if (order.length && order[order.length - 1] === round[0]) round.push(round.shift() as GhostLook);
      order.push(...round);
    }
    // 입구에서 가까운 귀신부터
    idx.sort((a, b) => progress[a] - progress[b] || a - b);
    idx.forEach((gi, k) => (out[gi] = order[k]));
  }
  return out;
}

function shuffled<T>(a: readonly T[], r: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
