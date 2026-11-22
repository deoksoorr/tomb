import { dyeItemColor, GEAR_DYE_REGIONS, itemRefOf, type ItemRef } from "./gearDye";
import { Grid, type Color } from "./pixel";

// 11/22 날개 염색 (운영자 「날개까지 염색 가능하게 되면 안 돼? 어차피 등이잖아」): 날개는 아바타 시트 밖에 따로 그리는 그림(cosmeticFx)이라
// 시트 염색(avatarCore drawFrame)이 닿지 않는다. 대신 날개 그림 자체를 같은 규칙(gearDye — 아이템별 묶음 GEAR_DYE_REGIONS)으로 다시 칠한다.
// 외곽선·흰 반짝 점은 묶음 밖이라 그대로. 특수 색 연출용 가면은 묶음 픽셀만 거의 흰색으로 칠한 그림 (dyeFx buildPartMask와 같은 뜻)

const refs = new Map<string, ItemRef | null>();

/** 날개 그림의 색 기준 (그림은 늘 같아 아이템마다 한 번만 센다) */
function refOf(itemId: string, src: Grid): ItemRef | null {
  const key = `${itemId}|${src.w}x${src.h}`;
  if (refs.has(key)) return refs.get(key)!;
  const hist = new Map<Color, number>();
  for (const v of src.px) if (v & 255) hist.set(v >>> 8, (hist.get(v >>> 8) ?? 0) + 1);
  const ref = itemRefOf(hist, GEAR_DYE_REGIONS[itemId]);
  refs.set(key, ref);
  return ref;
}

function mapGrid(src: Grid, fn: (c: Color, a: number) => number): Grid {
  const out = new Grid(src.w, src.h);
  const memo = new Map<number, number>();
  for (let i = 0; i < src.px.length; i++) {
    const v = src.px[i];
    if (!(v & 255)) continue;
    let o = memo.get(v);
    if (o === undefined) memo.set(v, (o = fn(v >>> 8, v & 255)));
    out.px[i] = o;
  }
  return out;
}

/** 염색한 날개 그림: 묶음 안의 색만 color로 (명암·하이라이트는 gearDye 규칙대로 옮긴다) */
export function dyeWingGrid(src: Grid, itemId: string, color: Color): Grid {
  const ref = refOf(itemId, src);
  if (!ref) return src;
  return mapGrid(src, (c, a) => ((dyeItemColor(c, ref, color) << 8) | a) >>> 0);
}

/** PROBE: 가면을 칠할 거의 흰색 (dyeFx PROBE_HI와 같은 값) */
const PROBE_HI = 0xfefefe;

/** 특수 색 가면: 묶음 픽셀만 남기고 거의 흰색 명암으로 (덮개가 이것에 색을 곱한다) */
export function wingMaskGrid(src: Grid, itemId: string): Grid {
  const ref = refOf(itemId, src);
  return mapGrid(src, (c, a) => (ref?.group.has(c) ? ((dyeItemColor(c, ref, PROBE_HI) << 8) | a) >>> 0 : 0));
}
