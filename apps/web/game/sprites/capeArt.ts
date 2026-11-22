import type { GearM, GearView } from "./avatarGear";
import type { Color, Grid } from "./pixel";

// 11/22 등(pack) 칸으로 옮긴 망토 5종 + 어깨 걸친 재킷 · 체크 담요 숄: 머리를 다 그린 뒤 덧그리는 「어깨 깃」.
// 망토 몸판은 머리보다 먼저 그려져 큰 두건 머리에 가려 뒷모습에서 밑단 띠만 보였다 → 뒷덜미(머리 아래 두 줄 + 목 줄)를
// 망토 윗자락이 감싸게 덮어 어깨부터 자락까지 한 장으로 이어 보이게 한다. 앞·옆은 머리·몸 둘레 빈칸에만 한 칸씩(어깨 너머로 살짝).
// 동글이·이불 유령(머그잔·튜브 포함)은 머리와 몸이 한 덩어리라 덧그리지 않는다 (예전 그림 그대로 — 털 깃도 각 그림 파일이 그린다).
// avatarCore drawFrame이 계절 꾸미기(모자·목·손)까지 그린 뒤 부른다 — 롱패딩 털 후드 위로 망토 깃이 덮인다.
// 염색: 천 색은 각 그림 파일의 망토 몸판과 같은 색을 써서 gearDye가 같은 묶음으로 옮긴다 (금테·털·레이스·걸쇠는 다른 색 계열 그대로)

type FB = string;
/** 뒷모습 어깨 깃 한 칸의 색 (k: 0 = 맨 윗줄(머리 아래 둘째 줄) · 1 · 2 = 목 줄, x·l·r = 그 줄 [왼쪽, 오른쪽]) */
type MantleColor = (k: 0 | 1 | 2, x: number, l: number, r: number) => Color;
type CapeOver = { back: MantleColor; peek: Color; peekLo: Color };

const HEADED = new Set(["hood", "cat", "bun", "tall"]);

/** 빛은 왼쪽 위: 왼쪽 끝 밝게 · 오른쪽 두 칸 그늘 */
const lit = (hi: Color, c: Color, lo: Color) => (x: number, l: number, r: number) => (x <= l ? hi : x >= r - 1 ? lo : c);

const OVERS: Record<string, CapeOver> = {
  // 퇴근 망토: 빨강 (avatarGear back_cape와 같은 색 — 접힌 깃 윗줄 밝게, 목 줄은 깃 그늘)
  back_cape: {
    back: (k, x, l, r) => (k === 2 ? (x >= r - 1 ? 0x6a1e2a : 0x8a2a38) : lit(0xd85a68, 0xb83a4a, 0x8a2a38)(x, l, r)),
    peek: 0xb83a4a,
    peekLo: 0x8a2a38,
  },
  // 채집왕 망토: 금테 깃 + 보랏빛 비단
  q_back_cape: {
    back: (k, x, l, r) => (k === 0 ? (x >= r - 1 ? 0xb8841a : 0xf2c43a) : k === 1 ? lit(0x7e5cc8, 0x5a3a9e, 0x3c2672)(x, l, r) : x >= r - 1 ? 0x2a1a54 : 0x3c2672),
    peek: 0x5a3a9e,
    peekLo: 0x3c2672,
  },
  // 딸기우유 망토: 흰 레이스 깃(한 칸 걸러) + 분홍
  back_milkcape: {
    back: (k, x, l, r) => (k === 0 ? ((x + 20) % 2 ? 0xffffff : 0xfff6f8) : k === 1 ? lit(0xffcad6, 0xf6a8bc, 0xd8849c)(x, l, r) : x >= r - 1 ? 0xb8687e : 0xd8849c),
    peek: 0xf6a8bc,
    peekLo: 0xd8849c,
  },
  // 털 달린 빨간 망토: 두 줄 흰 털 깃 + 빨간 벨벳
  xm_cape: {
    back: (k, x, l, r) => (k < 2 ? ((x + k + 20) % 3 === 0 ? 0xd8dce6 : 0xfbf8f2) : lit(0xf0505a, 0xd42c3c, 0x9a1c2c)(x, l, r)),
    peek: 0xfbf8f2,
    peekLo: 0xd8dce6,
  },
  // 서리꽃 망토: 서리 털 깃 + 새벽빛 망토 (seasonSetGear3 CLOAK 색)
  fr_cloak: {
    back: (k, x, l, r) => (k === 0 ? ((x + 20) % 2 ? 0xf6f9ff : 0xc8d4ec) : k === 1 ? lit(0xd0dcf6, 0xa8b8e4, 0x7c8cc0)(x, l, r) : x >= r - 1 ? 0x5a6aa0 : 0x7c8cc0),
    peek: 0xc8e8fa,
    peekLo: 0x7c8cc0,
  },
  // 어깨 걸친 재킷: 짙은 회색 깃 (윗줄 접힌 깃 밝게, 목 줄 가운데 트임 그늘)
  back_jacket: {
    back: (k, x, l, r) => (k === 0 ? (x >= r - 1 ? 0x4a4e5a : 0x6a6e7c) : k === 1 ? lit(0x6a6e7c, 0x4a4e5a, 0x2e3038)(x, l, r) : x === Math.round((l + r) / 2) ? 0x2e3038 : lit(0x6a6e7c, 0x4a4e5a, 0x2e3038)(x, l, r)),
    peek: 0x4a4e5a,
    peekLo: 0x2e3038,
  },
  // 체크 담요 숄: 빨강·남색 타탄이 어깨를 감싼다 (노란 선은 그대로)
  back_shawl: {
    back: (k, x) => ((x + 40) % 4 === 0 || k === 1 ? 0x2a3a6a : (x + k) % 8 === 0 ? 0xf2d27a : 0xc0392b),
    peek: 0xc0392b,
    peekLo: 0x2a3a6a,
  },
};

/** 어깨 깃을 덧그리는 꾸미기인지 */
export const hasCapeOver = (id: string | null | undefined): id is string => !!id && id in OVERS;

/** 머리를 다 그린 뒤 부른다 (avatarCore drawFrame) */
export function drawCapeOver(g: Grid, view: GearView, id: string, m: GearM, fb: FB, body: string): void {
  const o = OVERS[id];
  if (!o || !HEADED.has(fb)) return;
  void body;
  const { neck, shL, shR } = m;
  const c0 = Math.floor((shL + shR + 1) / 2);
  const shHalf = Math.max(3, Math.floor((shR - shL + 1) / 2));
  if (view === "up") {
    // 뒷모습: 머리 아래 두 줄 + 목 줄을 망토 윗자락이 감싼다 (아래 몸판 shL..shR과 폭이 이어진다)
    for (const k of [0, 1, 2] as const) {
      const y = neck - 2 + k;
      const h = k === 0 ? shHalf - 1 : shHalf;
      const l = c0 - h;
      const r = c0 + h - 1;
      for (let x = l; x <= r; x++) g.set(x, y, o.back(k, x, l, r));
    }
    return;
  }
  // 앞·옆: 머리 아래 어깨 둘레의 빈칸에만 한 칸 (몸 뒤로 늘어진 자락과 이어져 어깨 너머로 망토가 보인다)
  for (let y = neck - 2; y <= neck; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < 20; x++)
      if (g.filled(x, y)) {
        if (l < 0) l = x;
        r = x;
      }
    if (l < 0) continue;
    const col = y === neck ? o.peekLo : o.peek;
    if (view === "side") {
      // 옆모습은 등 쪽(왼쪽)만
      if (!g.filled(l - 1, y)) g.set(l - 1, y, col);
    } else {
      if (!g.filled(l - 1, y)) g.set(l - 1, y, col);
      if (!g.filled(r + 1, y)) g.set(r + 1, y, o.peekLo);
    }
  }
}
