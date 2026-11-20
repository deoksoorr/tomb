import { SEA_GARDEN_BENCHES, SEA_LOT_LANTERNS, SEA_LOT_MAILBOX, SEA_LOTS, SEA_WIDTH, SEA_ZONES, seaLotGate, type SeaLot } from "@tomb/protocol";
import type { PlotTierId } from "@/lib/housing/catalog";
import { ZOOM_MIN } from "../config";
import { COTTAGE_RISE, cottageBox } from "./seaCottageArt";
import { zoneLabelAt } from "./seaLayout";

// ── 11/20 맨 윗줄 오두막 문패 ── 지붕 위 문패는 마을과 같지만, 맵 위 끝에 붙은 터(2·4·8·9·10번)는 카메라가 위 끝에 멈추면
//  폰 위쪽 HUD(메뉴·채널 상자·물때 알림)에 문패가 가려요 → 그 오두막만 문패 세 줄을 집 아래 땅(출입구 앞)에 세워요 (운영자)
/** 폰 위쪽 HUD 높이 (화면 px) */
export const PHONE_HUD_PX = 130;
/** 문패 세 줄 높이 (화면 px — 줄 간격(글자 + worldLots LINE_GAP) × 3) */
const PLATE_BLOCK_PX = 3 * 18;
/** 지붕 위 문패 바닥(월드 y)이 이보다 위면 가장 작은 줌에서 맨 윗줄이 HUD 밑에 들어가요 */
export const ROOF_PLATE_MIN_Y = (PHONE_HUD_PX + PLATE_BLOCK_PX) / ZOOM_MIN;
/** 땅 문패 세 줄이 차지하는 높이 (월드, 가장 작은 줌) */
export const LOW_PLATE_H = Math.ceil(PLATE_BLOCK_PX / ZOOM_MIN) + 2;
/** 출입구 옆 땅 문패의 가장 좁은 폭 (월드 — 더 좁으면 아래로) */
export const LOW_PLATE_MIN_W = 90;

/** 땅 문패가 피할 맵 물건 (월드 사각형) — 오두막 단지 등불 기둥·정원 벤치와 그 옆 등불·우편함·구역 이름표(「별장」 등) (SeaMap이 세우는 자리) */
const LOW_PLATE_OBSTACLES: readonly { x0: number; x1: number; y0: number; y1: number }[] = [
  ...SEA_LOT_LANTERNS.map((p) => ({ x0: p.x - 6, x1: p.x + 6, y0: p.y - 42, y1: p.y + 2 })),
  ...SEA_GARDEN_BENCHES.flatMap((b) => [
    { x0: b.x - 16, x1: b.x + 16, y0: b.y - 12, y1: b.y + 4 },
    { x0: b.x + 20, x1: b.x + 32, y0: b.y - 44, y1: b.y },
  ]),
  { x0: SEA_LOT_MAILBOX.x - 8, x1: SEA_LOT_MAILBOX.x + 8, y0: SEA_LOT_MAILBOX.y - 16, y1: SEA_LOT_MAILBOX.y + 2 },
  // 구역 이름표 (SeaMap addLabels와 같은 자리 — 정류장·부동산은 이름표 대신 간판). 1/zoom 글씨라 가장 작은 줌의 크기로
  ...SEA_ZONES.filter((z) => z.id !== "busStop" && z.id !== "realty").map((z) => {
    const at = zoneLabelAt(z.name) ?? { x: z.x + z.w / 2, y: z.y + 10 };
    const half = Math.ceil((z.name.length * 12) / ZOOM_MIN / 2) + 4;
    return { x0: at.x - half, x1: at.x + half, y0: at.y - 14, y1: at.y + 2 };
  }),
];

/**
 * 11/20 맨 윗줄 오두막의 땅 문패 자리 (맨 윗줄 위 y 기준 — 아래로 세 줄). 다른 터(오두막·그 지붕 위 문패 자리)와 등불·벤치·우편함을 피해요:
 *  ① 동·서 출입구면 출입구 바깥 옆 (빈 폭이 좁으면 폭을 줄이고, LOW_PLATE_MIN_W보다 좁으면 ②로)
 *  ② 터 아래 (남쪽 출입구면 그 앞). 가로로 빈 구간 중 출입구에 가장 가까운 곳
 *  ③ 둘 다 자리가 없으면 (9번 터: 왼쪽 2번 터·아래 3번 터·오른쪽 「별장」 이름표와 벤치 등불) 제 터 앞마당 (집 앞벽과 앞 울타리 사이)
 */
export function lowPlateSpot(l: SeaLot, tier: PlotTierId): { cx: number; top: number; w: number; inLot?: true } {
  const busy = [
    ...SEA_LOTS.filter((o) => o.n !== l.n).map((o) => ({ x0: o.x - 4, x1: o.x + o.w + 4, y0: o.y - COTTAGE_RISE - LOW_PLATE_H, y1: o.y + o.h })),
    ...LOW_PLATE_OBSTACLES,
  ];
  /** y0~y0+LOW_PLATE_H 줄에서 [xMin, xMax] 안의 빈 구간 중 want에 가장 가까운 자리 (폭은 l.w까지, LOW_PLATE_MIN_W보다 좁은 구간은 버려요) */
  const fit = (y0: number, xMin: number, xMax: number, want: number) => {
    const blocks = busy
      .filter((b) => y0 < b.y1 && y0 + LOW_PLATE_H > b.y0)
      .map((b) => [b.x0, b.x1] as const)
      .sort((a, b) => a[0] - b[0]);
    let best: { cx: number; w: number; d: number } | null = null;
    let from = xMin;
    for (const [b0, b1] of [...blocks, [xMax, Infinity] as const]) {
      const to = Math.min(b0, xMax);
      const w = Math.min(l.w, to - from);
      if (w >= LOW_PLATE_MIN_W) {
        const cx = Math.max(from + w / 2, Math.min(to - w / 2, want));
        const d = Math.abs(cx - want);
        if (!best || d < best.d) best = { cx, w, d };
      }
      from = Math.max(from, b1);
      if (from >= xMax) break;
    }
    return best;
  };
  const g = seaLotGate(l);
  if (l.gate !== "s") {
    const top = g.y - 14;
    const edge = l.gate === "e" ? g.x + 6 : g.x - 6;
    const f = l.gate === "e" ? fit(top, edge, Math.min(SEA_WIDTH, edge + l.w), edge) : fit(top, Math.max(0, edge - l.w), edge, edge);
    if (f) return { cx: f.cx, top, w: f.w };
  }
  const top = l.y + l.h + 6;
  const want = l.gate === "s" ? g.x : l.x + l.w / 2;
  const f = fit(top, Math.max(0, l.x - 80), Math.min(SEA_WIDTH, l.x + l.w + 80), want);
  if (f) return { cx: f.cx, top, w: f.w };
  // 앞벽 바로 아래부터 (오두막 앞마당 깊이가 36~42라 가장 작은 줌에서도 세 줄이 앞 울타리 언저리에서 끝나요)
  return { cx: l.x + l.w / 2, top: l.y + cottageBox(tier, l).base + 2, w: l.w, inLot: true };
}
