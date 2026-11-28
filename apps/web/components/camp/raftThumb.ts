import { CAMP_RAFTS, campRaftWalks } from "@tomb/protocol";
import { raft4Art } from "@/game/camp/valleyExtraArt";
import { makeCanvas } from "@/game/sprites/pixel";
import { snowRoof } from "@/game/sprites/winterArt";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";

// 11/28 좌대 매표소 카드 그림: 캠핑장 맵이 좌대를 그리는 그림 코드(game/camp/valleyExtraArt raft4Art)를 그대로 불러 1배로 굽는다
// (맵 텍스처 game/camp/campValleyTex raft${n}과 같은 인자 — 그림이 바뀌면 카드도 따라 바뀐다). 둘레는 저수지 물빛 한 겹.
// Phaser를 끌어오지 않으려고 campValleyTex 대신 그림 함수를 직접 부른다.

/** 카드 물빛 (저수지 좌대 둘레 — 크리스마스·기본 판 화면에서 뽑은 색) */
const WATER = { base: "#285365", deep: "#204656", hi: "#3a6e80" } as const;
const PAD_X = 6;
const PAD_Y = 4;

const cache = new Map<string, HTMLCanvasElement>();

/** 좌대 n번 그림 (물빛 바탕 포함, 1배). 판(concept)마다 따로 — 크리스마스 전구·눈 지붕까지 맵과 같다 */
export function raftThumbCanvas(n: number, concept: MapConcept): HTMLCanvasElement | null {
  const key = `${n}:${concept}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = CAMP_RAFTS.find((q) => q.n === n);
  if (!r) return null;
  const snowy = isSnowy(concept);
  const art = raft4Art(r.roof, concept === "christmas", r.link ? "left" : "front", { n: r.n, walks: campRaftWalks(r).map((w) => w.x - r.x + 36), snowy });
  const raw = art.grid.toCanvas();
  const pic = snowy ? snowRoof(raw, (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 181 + r.n }) : raw;
  // 잔교에 붙은 좌대(1~3)는 윗줄이 잔교로 이어지는 판자 다리 → 위 여백 없이 (다리가 카드 위 끝에서 들어온다).
  // 캔버스 높이는 여섯 다 같게 (폰 두 칸에서 3번·4번이 한 줄에 놓여도 글줄이 맞게) — 남는 물은 아래로
  const top = r.link ? 0 : PAD_Y;
  const { canvas, ctx } = makeCanvas(pic.width + PAD_X * 2, pic.height + PAD_Y * 2);
  ctx.fillStyle = WATER.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 잔물결 (가로 짧은 줄 — 맵 물결처럼 2~4칸)
  for (let i = 0; i < 18; i++) {
    const h = ((n * 131 + i * 977) % 1009) / 1009;
    const k = ((n * 71 + i * 613) % 997) / 997;
    ctx.fillStyle = i % 3 ? WATER.deep : WATER.hi;
    ctx.fillRect(Math.floor(h * (canvas.width - 4)), Math.floor(k * canvas.height), 2 + (i % 3), 1);
  }
  ctx.drawImage(pic, PAD_X, top);
  cache.set(key, canvas);
  return canvas;
}
