import { INTERNAL_SIG_HEADER, INTERNAL_TTL_SEC, signInternal } from "@tomb/protocol";
import type { Env } from "./config";

// 11/21 행운권 정각 추첨: wrangler.toml [triggers] 토요일 20:00 KST(11:00 UTC)와 몇 분 뒤 재시도.
// 웹 /api/internal/lottery-draw를 서명해서 부른다. 웹은 이미 끝난 회차면 아무것도 안 하므로 여러 번 불러도 된다.
// 실패해도 입장·행운권 창·머무르기 기록이 예전처럼 추첨을 시작한다 (예약 작업은 정각을 맞추는 덧붙임).

export const LOTTERY_DRAW_PATH = "/api/internal/lottery-draw";

/** 부른 결과 (로그용). WEB_ORIGIN·JOIN_SECRET이 없으면 skip */
export async function drawLottery(env: Pick<Env, "WEB_ORIGIN" | "JOIN_SECRET">, fetcher: typeof fetch = fetch, nowMs = Date.now()): Promise<string> {
  const origin = env.WEB_ORIGIN?.trim().replace(/\/+$/, "");
  if (!origin || !env.JOIN_SECRET) return "skip";
  const { body, sig } = await signInternal(env.JOIN_SECRET, { op: "lotteryDraw", exp: Math.floor(nowMs / 1000) + INTERNAL_TTL_SEC });
  try {
    const res = await fetcher(origin + LOTTERY_DRAW_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_SIG_HEADER]: sig },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const text = (await res.text()).slice(0, 200);
    if (!res.ok) console.error("[lottery] 정각 추첨 응답", res.status, text);
    return `${res.status} ${text}`;
  } catch (e) {
    console.error("[lottery] 정각 추첨 실패", e);
    return "error";
  }
}
