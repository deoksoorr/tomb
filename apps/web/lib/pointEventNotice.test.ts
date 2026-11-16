import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOSTABLE_SOURCES, POINT_EVENT_NOTICE_PREFIX, pointEventChanged, pointEventChangeNotice, pointEventEndNotice, pointEventStartNotice, type PointEvent } from "./pointEvent";
import { getMegaphone } from "./store";
import { cachedPointEvent, setPointEvent } from "./store/pointEvent";
import { announceChange, announceEndOnce, announceStart } from "./pointEventNotice";

// 실시간 서버로 보내는 부분만 가짜로 (확성기 기록은 메모리 저장소에 그대로 남는다)
vi.mock("./ban", async (importOriginal) => ({ ...(await importOriginal<typeof import("./ban")>()), sayAll: vi.fn(async () => 1) }));

const H = 3_600_000;
/** 2026-11-14(토) 한국 시간 낮 12시 */
const SAT_NOON = Date.UTC(2026, 10, 14, 3);
/** 2026-11-16(월) 한국 시간 새벽 5시 */
const MON_5 = Date.UTC(2026, 10, 15, 20);
const ev = (o: Partial<PointEvent> = {}): PointEvent => ({ startAt: SAT_NOON, endAt: MON_5, sources: [...BOOSTABLE_SOURCES], mult: 2, ...o });

describe("포인트 이벤트 공지 문구", () => {
  it("시작: 항목 수에 따라, 끝나는 시각이 없으면 다시 알린다고", () => {
    expect(pointEventStartNotice(ev({ sources: ["hunt", "stars"] }), SAT_NOON)).toBe(
      "🎉 포인트 2배 이벤트가 시작됐어요! 사냥터와 별자리 잇기 포인트가 2배예요. 월요일 새벽 5시까지예요.",
    );
    expect(pointEventStartNotice(ev(), SAT_NOON)).toBe("🎉 포인트 2배 이벤트가 시작됐어요! 모든 포인트가 2배예요. 월요일 새벽 5시까지예요.");
    expect(pointEventStartNotice(ev({ endAt: null, mult: 3, sources: ["hunt"] }), SAT_NOON)).toBe(
      "🎉 포인트 3배 이벤트가 시작됐어요! 사냥터 포인트가 3배예요. 끝날 때 다시 알려 드려요.",
    );
    expect(pointEventStartNotice(ev({ sources: ["hunt", "bugs", "stars", "fish"] }), SAT_NOON)).toBe(
      "🎉 포인트 2배 이벤트가 시작됐어요! 사냥터 포함 4가지 포인트가 2배예요. 월요일 새벽 5시까지예요.",
    );
  });

  it("바뀜·끝", () => {
    expect(pointEventChangeNotice(ev({ sources: ["fish"], endAt: SAT_NOON + 9 * H }), SAT_NOON)).toBe(
      "포인트 이벤트가 바뀌었어요. 물고기 팔기 포인트가 2배예요. 오늘 밤 9시까지예요.",
    );
    expect(pointEventEndNotice(ev())).toBe("포인트 2배 이벤트가 끝났어요. 함께해 줘서 고마워요.");
    expect(pointEventEndNotice(ev({ mult: 3 }))).toBe("포인트 3배 이벤트가 끝났어요. 함께해 줘서 고마워요.");
  });

  it("같은 설정이면 바뀐 게 아니다", () => {
    expect(pointEventChanged(ev(), ev())).toBe(false);
    expect(pointEventChanged(ev(), ev({ mult: 3 }))).toBe(true);
    expect(pointEventChanged(ev(), ev({ endAt: null }))).toBe(true);
    expect(pointEventChanged(ev(), ev({ sources: ["hunt"] }))).toBe(true);
  });
});

describe("포인트 이벤트 공지 보내기 (메모리 저장소)", () => {
  afterEach(async () => {
    await setPointEvent(null);
  });
  const mine = async (startAt: number) =>
    (await getMegaphone().recent(100)).filter((r) => r.id.startsWith(`${POINT_EVENT_NOTICE_PREFIX}${startAt}-`)).map((r) => r.text);

  it("시작·바뀜 공지는 마을 전체 확성기 기록에 이벤트 id로 남는다", async () => {
    const now = Date.now();
    const e = ev({ startAt: now - 1, endAt: null, sources: ["hunt"] });
    await announceStart(e, now);
    await announceChange({ ...e, mult: 3 }, now + 1);
    const rows = (await getMegaphone().recent(100)).filter((r) => r.id.startsWith(`${POINT_EVENT_NOTICE_PREFIX}${e.startAt}-`));
    expect(rows.every((r) => r.scope === "all")).toBe(true);
    expect(rows.map((r) => r.text).sort()).toEqual([pointEventChangeNotice({ ...e, mult: 3 }, now + 1), pointEventStartNotice(e, now)].sort());
  });

  it("끝 공지는 이벤트마다 한 번만 (관리자가 끈 뒤 정해 둔 시각이 지나도 다시 안 보낸다)", async () => {
    const now = Date.now();
    const e = ev({ startAt: now - 2 * H, endAt: now - 1000 });
    expect(await announceEndOnce(e, now)).toBe(true);
    expect(await announceEndOnce(e, now)).toBe(false);
    expect(await mine(e.startAt)).toEqual([pointEventEndNotice(e)]);
  });

  it("정해 둔 시각이 지나면 그 뒤 처음 읽는 요청이 끝 공지를 한 번 보낸다", async () => {
    const now = Date.now();
    const e = ev({ startAt: now - 3 * H, endAt: now - 2000, sources: ["hunt"] });
    await setPointEvent(e, now - 60_000); // 캐시는 1분 전 값 → 다음 읽기에서 저장소를 다시 읽는다
    await cachedPointEvent(now);
    await cachedPointEvent(now + 10_000);
    await cachedPointEvent(now + 20_000);
    expect(await mine(e.startAt)).toEqual([pointEventEndNotice(e)]);
  });

  it("오래전에 끝난 이벤트는 뒤늦게 알리지 않는다", async () => {
    const now = Date.now();
    const e = ev({ startAt: now - 30 * H, endAt: now - 24 * H });
    await setPointEvent(e, now - 60_000);
    await cachedPointEvent(now);
    expect(await mine(e.startAt)).toEqual([]);
  });
});
