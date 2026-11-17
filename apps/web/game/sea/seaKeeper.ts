import { nextTideOpenAt, TIDE_PERIOD_MS, tideOpen } from "@tomb/protocol";
import { qaSearch } from "@/lib/qaUrl";

// 11/16 등대지기 (등대 옆 사람): 다음 갯벌이 열리는 때 셋을 알려줘요 · 유령선이 보이는 밤 (토요일 밤 — 다음 차수에 진짜 배가 들어와요)

const KST = 9 * 3_600_000;
const hhmm = (ms: number) => {
  const d = new Date(ms + KST);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** 다음 갯벌 열리는 때 셋 (epoch ms) */
export function nextTideOpens(nowMs: number, n = 3): number[] {
  const first = nextTideOpenAt(nowMs);
  return Array.from({ length: n }, (_, i) => first + i * TIDE_PERIOD_MS);
}

/** 등대지기 말 (해요체, 한 줄) */
export function keeperTideText(nowMs: number): string {
  const [a, b, c] = nextTideOpens(nowMs).map(hhmm);
  return tideOpen(nowMs) ? `지금 갯벌이 열려 있어요. 다음엔 ${a}, ${b}, ${c}에 물이 빠져요.` : `물이 빠지는 때는 ${a}, ${b}, ${c}이에요. 그때 갯벌을 걸어 봐요.`;
}

/** 유령선이 보이는 밤 (등대 꼭대기 먼바다 풍경): 토요일 밤 20시 ~ 일요일 새벽 2시 (한국 시각). ?ghost=1이면 늘 — 11/17 실서버는 주소 시험 값을 막아요 (lib/qaUrl) */
export function ghostShipNight(nowMs: number, search = typeof window !== "undefined" ? window.location.search : "", qaFlag?: string): boolean {
  if (/[?&]ghost=1\b/.test(qaSearch(search, qaFlag))) return true;
  const d = new Date(nowMs + KST);
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  return (day === 6 && h >= 20) || (day === 0 && h < 2);
}
