// 마을 색조(시간대·날씨 곱하기 색)를 캐릭터에는 절반만 (11/15). 순수 계산 — 셰이더(worldTint)가 이 값을 캐릭터 그림에 곱한다.
//  - 곱하기 색의 절반 = 채널마다 제곱근 (두 번 곱하면 원래 색조가 된다). 정오 맑음(흰색)은 그대로 흰색.
//  - 흐림·비·눈·안개의 옅은 막(haze)은 캐릭터 위에도 일반 섞기로 덮여서 색이 (1 - haze)배로 바래므로,
//    막도 절반만 먹은 것처럼 보이게 그만큼 밝혀 준다: × (1 - haze/2) / (1 - haze)
//  - 맵 색조보다 어두워지지는 않고, 원래 색(흰색)보다 밝아지지도 않는다.

/** 캐릭터 그림 표시 (AvatarView·꾸미기 연출·펫이 만든 그림). worldTint 파이프라인이 읽는다 */
export const CHAR_PROP = "tombCharTint";

/** 캐릭터 그림으로 표시: 마을 색조를 절반만 받는다 (worldTint 셰이더). 셰이더를 안 쓰면(Canvas·마을 밖 장면) 아무 일도 하지 않는다 */
export function markCharTint<T extends object>(go: T): T {
  (go as { [CHAR_PROP]?: boolean })[CHAR_PROP] = true;
  return go;
}

const ch = (v: number, s: number) => ((v >> s) & 255) / 255;

/** 맵 곱하기 색 tint(0xRRGGBB)와 막 세기 haze(0..1)에서 캐릭터에 곱할 색 (0xRRGGBB) */
export function charTintOf(tint: number, haze = 0): number {
  const h = Math.max(0, Math.min(0.9, haze));
  const lift = (1 - h / 2) / (1 - h);
  let out = 0;
  for (const s of [16, 8, 0]) {
    const c = ch(tint, s);
    const v = Math.max(c, Math.min(1, Math.sqrt(c) * lift));
    out |= Math.round(v * 255) << s;
  }
  return out >>> 0;
}
