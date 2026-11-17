import { describe, expect, it } from "vitest";
import { TIDE_PERIOD_MS, tideOpen } from "@tomb/protocol";
import { ghostShipNight, keeperTideText, nextTideOpens } from "./seaKeeper";

// 11/16 등대지기: 다음 갯벌 열리는 때 셋 · 유령선이 보이는 밤
const KST_MIDNIGHT = Date.UTC(2026, 10, 15, 15, 0); // 11/16 0시 KST (물때 0분, 만조)

describe("등대지기 (seaKeeper)", () => {
  it("다음 갯벌 열림 셋은 한 바퀴(3시간) 간격이고 그때마다 갯벌이 열려 있어요", () => {
    const t = nextTideOpens(KST_MIDNIGHT);
    expect(t).toHaveLength(3);
    expect(t[0]).toBe(KST_MIDNIGHT + 60 * 60_000);
    expect(t[1] - t[0]).toBe(TIDE_PERIOD_MS);
    expect(t[2] - t[1]).toBe(TIDE_PERIOD_MS);
    for (const ms of t) expect(tideOpen(ms + 60_000)).toBe(true);
    expect(keeperTideText(KST_MIDNIGHT)).toBe("물이 빠지는 때는 01:00, 04:00, 07:00이에요. 그때 갯벌을 걸어 봐요.");
    expect(keeperTideText(KST_MIDNIGHT + 90 * 60_000)).toContain("지금 갯벌이 열려 있어요");
  });
  it("유령선은 토요일 밤 20시 ~ 일요일 새벽 2시에만", () => {
    const sat = Date.UTC(2026, 10, 21, 12, 0); // 토 21시 KST
    expect(ghostShipNight(sat, "")).toBe(true);
    expect(ghostShipNight(Date.UTC(2026, 10, 21, 8, 0), "")).toBe(false); // 토 17시
    expect(ghostShipNight(Date.UTC(2026, 10, 21, 16, 30), "")).toBe(true); // 일 01:30
    expect(ghostShipNight(Date.UTC(2026, 10, 18, 12, 0), "")).toBe(false); // 수 21시
    expect(ghostShipNight(Date.UTC(2026, 10, 18, 12, 0), "?ghost=1", "1")).toBe(true);
    // 11/17 실서버(NEXT_PUBLIC_QA_URL=0)는 주소로 부르지 못해요
    expect(ghostShipNight(Date.UTC(2026, 10, 18, 12, 0), "?ghost=1", "0")).toBe(false);
  });
});
