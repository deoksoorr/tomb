import { describe, expect, it } from "vitest";
import { CAMP_FISHING_SPOTS, CONN_WHYS, CONN_WHY_LABEL, FISHING_SPOTS, campRaftOfSpot } from "@tomb/protocol";
import { describeLog, dropListText, dropName, fishSpotText, HUNT_TAG, MAP_NAME, MOVE_TAG, NO_LABEL, UNKNOWN_VIA, VIA_LABEL } from "./logText";
import { MOVE_KINDS, MOVE_NOS, MOVE_VIAS, type MoveLogEntry } from "./moveLog";
import { capMoves, huntDropList, MOVE_CAP, resetMoveCap } from "./opsLog";
import { encodeSg, itemOfSpec } from "./rpg/setGear";
import { HUNT_DROP_LIST_MAX, type HuntLogEntry, type HuntLogKind, type LogEntry } from "./store/opsLog";

// 11/28 관리자 접속 기록·사냥터 기록 문장 (lib/logText). 표가 모든 코드를 덮는지, 옛 줄이 깨지지 않는지, 드롭 목록, 쓰기 상한

const mv = (o: Partial<MoveLogEntry> & Pick<MoveLogEntry, "m">): LogEntry => ({ a: "acc", k: "mv", at: 1, src: "s", ...o }) as MoveLogEntry;
const hunt = (o: Partial<HuntLogEntry> & Pick<HuntLogEntry, "k">): LogEntry => ({ a: "acc", at: 1, ...o }) as HuntLogEntry;
const conn = (e: LogEntry) => describeLog("conn", e);
const BAD = /undefined|null|NaN|\[object/;

describe("표가 모든 코드를 덮는다", () => {
  it("동작 종류·버튼·못 들어간 까닭·사냥 종류·나감 종류마다 말이 있다", () => {
    for (const m of MOVE_KINDS) expect(MOVE_TAG[m]?.tag, m).toBeTruthy();
    for (const v of MOVE_VIAS) expect(VIA_LABEL[v]?.label, v).toBeTruthy();
    for (const n of MOVE_NOS) expect(NO_LABEL[n], n).toBeTruthy();
    for (const k of ["start", "leave", "drop", "die", "reward", "reject"] satisfies HuntLogKind[]) expect(HUNT_TAG[k]?.tag, k).toBeTruthy();
    for (const w of CONN_WHYS) expect(CONN_WHY_LABEL[w], w).toBeTruthy();
    expect(Object.keys(MAP_NAME).sort()).toEqual(["camp", "sea", "village"]);
  });

  it("자동 낚시를 끄는 까닭(fish…)은 해제 문구, 맵 옮긴 까닭은 맵 이동 문구, 집 버튼은 집 들어감 문구가 있다", () => {
    for (const v of MOVE_VIAS.filter((x) => x.startsWith("fish"))) expect(VIA_LABEL[v].fish, v).toBeTruthy();
    for (const v of ["bus", "mapReq", "permLost", "follow", "friend", "staffTp", "bail", "houseExit"] as const) expect(VIA_LABEL[v].map, v).toBeTruthy();
    for (const v of ["mine", "friendWin", "list", "door", "friend"] as const) expect(VIA_LABEL[v].house, v).toBeTruthy();
  });

  it("모든 종류 × 모든 버튼 조합이 던지지 않고 빈 말·undefined 없이 한 문장", () => {
    for (const m of MOVE_KINDS)
      for (const via of [undefined, ...MOVE_VIAS]) {
        const l = conn(mv({ m, ...(via ? { via } : {}) }));
        expect(l.text, `${m}/${via}`).not.toMatch(BAD);
        expect(l.text.length).toBeGreaterThan(3);
        expect(l.tag).toBe(m === "tab" ? "다시 접속" : MOVE_TAG[m].tag);
      }
  });
});

describe("새 줄 문장", () => {
  const raft = CAMP_FISHING_SPOTS.find((s) => campRaftOfSpot(s.id) === 4)!;
  const until = Date.UTC(2026, 10, 28, 5, 30); // 한국 14:30

  it("자동 낚시 시작·해제 짝", () => {
    expect(conn(mv({ m: "fishStart", spot: raft.id, ch: 1, n: 4, until })).text).toBe("자동 낚시 시작 (캠핑장 윤슬 낚시터 좌대 4번 · 1채널 · 입장권 14:30까지)");
    expect(conn(mv({ m: "fishStart", spot: FISHING_SPOTS[1].id, ch: 3 })).text).toBe("자동 낚시 시작 (마을 호수 2번 자리 · 3채널)");
    expect(conn(mv({ m: "fishStop", via: "fishSelf", spot: raft.id, n: 4, fish: 12 })).text).toBe("자동 낚시 해제 (직접 끔 · 움직이거나 일어남 · 캠핑장 윤슬 낚시터 좌대 4번 · 12마리 정산)");
    expect(conn(mv({ m: "fishStop", via: "fishRaftEnd", spot: raft.id, n: 4, fish: 0 })).text).toBe("자동 낚시 해제 (좌대 입장권 시간 끝남 · 캠핑장 윤슬 낚시터 좌대 4번 · 잡은 것 없음)");
    expect(conn(mv({ m: "fishStop", via: "fishHouse", fish: 3 })).text).toBe("자동 낚시 해제 (자리 떠남 · 집 들어감 · 3마리 정산)");
  });

  it("좌대 입장권 구매·연장", () => {
    expect(conn(mv({ m: "raftBuy", ch: 1, n: 4, min: 120, pts: 3000, until })).text).toBe("좌대 입장권 구매 (1채널 4번 좌대 · 120분 · 3,000P · 14:30까지)");
    expect(conn(mv({ m: "raftRenew", ch: 1, n: 4, min: 60, pts: 1500, until: until + 3_600_000 })).text).toBe("좌대 입장권 연장 (1채널 4번 좌대 · +60분 · 1,500P · 15:30까지)");
  });

  it("맵·집·채널·다시 접속", () => {
    expect(conn(mv({ m: "map", from: "village", to: "sea", via: "bus", src: "c" }))).toEqual({ tag: "맵 이동", tone: "info", text: "바닷가행 버스 탐 → 바닷가 (마을에서)", note: "화면 보고" });
    expect(conn(mv({ m: "map", from: "village", to: "sea", via: "mapReq", dev: "phone·카카오톡" }))).toEqual(expect.objectContaining({ text: "서버가 맵 옮김 → 바닷가 (마을에서)", note: "폰 · 카카오톡" }));
    expect(conn(mv({ m: "houseIn", via: "friendWin", tgt: "GBT의 카라반 · 1채널 캠핑장 7번" })).text).toBe("친구 집 방문 (GBT의 카라반 · 1채널 캠핑장 7번)");
    expect(conn(mv({ m: "houseIn", via: "door", mine: true, tgt: "나의 카라반" })).text).toBe("내 집 들어감 (나의 카라반 · 집 문(E))");
    expect(conn(mv({ m: "houseOut", from: "other", to: "sea", via: "exitDoor", src: "c" })).text).toBe("남의 집에서 나옴 → 바닷가 (원래 맵으로 · 집 문으로)");
    expect(conn(mv({ m: "channel", from: "1", to: "2", via: "channelWin", src: "c" })).text).toBe("채널 옮김 1채널 → 2채널 (채널 창)");
    const tab = conn(mv({ m: "tab", to: "sea", ch: 1, tab: "tabA1", ptab: "tabB1", ask: "village", live: true, dev: "pc" }));
    expect(tab).toEqual({ tag: "다른 탭", tone: "warn", text: "다른 탭에서 다시 접속, 이전 탭 끊음 (1채널 바닷가 · 서버 맵 유지 · 화면이 보낸 맵: 마을)", note: "탭 tabA1 ← tabB1 · PC" });
  });

  it("접속·나감·오류", () => {
    expect(conn({ a: "acc", k: "in", at: 1, ch: 1, dev: "phone·카카오톡" })).toEqual({ tag: "접속", tone: "ok", text: "게임 접속 (1채널 · 폰 · 카카오톡)" });
    expect(conn({ a: "acc", k: "out", at: 1, ch: 2, dev: "pc", why: "drop" })).toEqual({ tag: "나감", tone: "warn", text: "게임 나감: 연결 끊김 (2채널 · PC)" });
    expect(conn({ a: "acc", k: "out", at: 1, why: "closed" }).tone).toBe("plain");
    expect(conn({ a: "acc", k: "err", at: 1, msg: "API: 500" }).text).toBe("API: 500");
  });

  it("배 위 자리·모르는 자리", () => {
    expect(fishSpotText("boat:reservoir")).toBe("캠핑장 윤슬 나룻배 위");
    expect(fishSpotText("boat:lake")).toBe("마을 호수 배 위");
    expect(fishSpotText("f_1_2")).toBe("f_1_2");
    expect(fishSpotText(undefined)).toBe("자리 모름");
  });
});

describe("옛 줄 (운영 Redis에 이미 있는 모양)", () => {
  it("11/27 자동 낚시 멈춤(tgt 「3마리 정산」)·버튼 없는 맵 이동·mine 없는 집 들어감·모르는 코드", () => {
    expect(conn(mv({ m: "fishStop", via: "fishHouse", tgt: "3마리 정산" })).text).toBe("자동 낚시 해제 (자리 떠남 · 집 들어감 · 3마리 정산)");
    expect(conn(mv({ m: "map", from: "sea", to: "camp", src: "c" })).text).toBe(`맵 이동 → 캠핑장 (바닷가에서 · ${UNKNOWN_VIA})`);
    expect(conn(mv({ m: "houseIn", via: "list", tgt: "GBT의 집 · 1채널 7번지" })).text).toBe("분양 사무소에서 집 구경 (GBT의 집 · 1채널 7번지)");
    expect(conn(mv({ m: "houseIn" })).text).toBe("집 들어감");
    expect(conn(mv({ m: "houseNo" })).text).toBe("집 못 들어감: 까닭 모름");
    expect(conn(mv({ m: "map", via: "teleport" as never })).text).toBe("맵 이동 → ? (?에서 · teleport)");
    expect(conn(mv({ m: "warp" as never })).text).toBe("warp");
    expect(conn(mv({ m: "tab", to: "sea" })).text).toBe("다시 접속 (바닷가 · 서버 맵 유지)");
  });

  it("사냥 옛 줄은 드롭 수만 「아이템 드롭 N개」, 필드가 빠져도 문장", () => {
    const l = describeLog("hunt", hunt({ k: "reward", zone: "meeting-room", d: "easy", exp: 120, pts: 30, drops: 3, sec: 200 }));
    expect(l).toEqual({ tag: "보상", tone: "ok", text: "사냥 마치고 보상 받음 (월요일 회의실 · 쉬움 · 3분 20초)", more: "EXP 120 · 30P · 아이템 드롭 3개" });
    expect(describeLog("hunt", hunt({ k: "die" })).more).toBe("EXP 0 · 0P · 아이템 드롭 없음");
    expect(describeLog("hunt", hunt({ k: "start", zone: "meeting-room", d: "easy" })).text).toBe("사냥터 입장 (월요일 회의실 · 쉬움)");
    expect(describeLog("hunt", hunt({ k: "start", tw: 12, d: "normal" })).text).toBe("야근 빌딩 입장 (12층부터)");
    expect(describeLog("hunt", hunt({ k: "drop", msg: "앞 판을 끝내지 못하고 새 판을 시작" })).text).toBe("사냥 판이 끊김 (앞 판을 끝내지 못하고 새 판을 시작)");
    expect(describeLog("hunt", hunt({ k: "reject", tw: 3, code: "BAD", msg: "이상해요" })).text).toBe("서버가 사냥 결과를 거절함: 이상해요 (야근 빌딩 3층부터 · BAD)");
    // 모르는 사냥터·깨진 드롭 목록
    expect(describeLog("hunt", hunt({ k: "leave", zone: "old-zone", dl: "junk" as never, drops: 2 })).text).toBe("사냥터에서 그만두고 나옴 (old-zone)");
    expect(describeLog("hunt", hunt({ k: "leave", dl: "junk" as never, drops: 2 })).more).toBe("EXP 0 · 0P · 아이템 드롭 2개");
    expect(describeLog("hunt", hunt({ k: "weird" as never })).tag).toBe("weird");
  });
});

describe("사냥 드롭 목록", () => {
  const sg = encodeSg(itemOfSpec("s003.a7c5d18", 5)!); // 야근 세트 · 첫 부위 · 임원급

  it("이름: 세트 장비는 부위(세트 · 직급), 재료·물약·코디(일수), 모르는 id는 그대로", () => {
    expect(dropName("set", sg)).toMatch(/^.+\(야근 세트 · 임원급\)$/);
    expect(dropName("set", "s003.a7c5d18")).toMatch(/\(야근 세트 · 임원급\)$/);
    expect(dropName("mat", "m_doc")).toBe("결재 서류");
    expect(dropName("potion", "p_coffee")).toBe("커피");
    expect(dropName("cosmetic", "hat_straw", 7)).toBe("코디 밀짚모자(7일)");
    expect(dropName("gear", "nope")).toBe("nope");
    expect(dropName("set", "zzz")).toBe("zzz");
  });

  it("「아이템 드롭: 이름 수, …」 · 넘친 칸은 「외 N가지」", () => {
    const { dl, more } = huntDropList([
      { kind: "set", id: sg, qty: 1 },
      { kind: "mat", id: "m_doc", qty: 10 },
      { kind: "mat", id: "m_doc", qty: 4 },
      { kind: "potion", id: "p_coffee", qty: 2 },
    ]);
    expect(more).toBe(0);
    expect(dl).toEqual([
      ["set", sg, 1],
      ["mat", "m_doc", 14],
      ["potion", "p_coffee", 2],
    ]);
    expect(dropListText(dl, 4)).toMatch(/^아이템 드롭: .+\(야근 세트 · 임원급\) 1, 결재 서류 14, 커피 2$/);
    const l = describeLog("hunt", hunt({ k: "reward", tw: 12, d: "hell", exp: 1200, pts: 300, drops: 4, floors: 3, sec: 800, dl }));
    expect(l.text).toBe("야근 빌딩 마치고 보상 받음 (12층부터 · 3층 깸 · 13분 20초)");
    expect(l.more).toMatch(/^EXP 1,200 · 300P · 아이템 드롭: /);
  });

  it(`같은 것은 합치고 ${HUNT_DROP_LIST_MAX}칸까지, id는 48자까지`, () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: "gear", id: `g_${i}`, qty: 1 }));
    const { dl, more } = huntDropList([...many, { kind: "gear", id: "g_0", qty: 2 }, { kind: "mat", id: "x".repeat(80), qty: 1 }]);
    expect(dl).toHaveLength(HUNT_DROP_LIST_MAX);
    expect(dl[0]).toEqual(["gear", "g_0", 3]);
    expect(more).toBe(11);
    expect(dropListText(dl, 32, more)).toMatch(/외 11가지$/);
    expect(huntDropList([{ kind: "mat", id: "y".repeat(80), qty: 0 }]).dl[0]).toEqual(["mat", "y".repeat(48), 1]);
  });
});

describe("쓰기 상한 (계정마다 1분에 MOVE_CAP.max줄)", () => {
  it("넘은 줄은 버리고, 다음 창의 첫 줄에 건너뛴 수를 붙인다. 다른 계정은 따로 센다", () => {
    resetMoveCap();
    const row = (a: string, i: number) => ({ a, k: "mv" as const, at: i, m: "fishStart" as const, src: "s" as const });
    const t = 1_000_000;
    const first = capMoves(Array.from({ length: MOVE_CAP.max + 5 }, (_, i) => row("spam", i)), t);
    expect(first).toHaveLength(MOVE_CAP.max);
    expect(capMoves([row("spam", 99)], t + 1_000)).toEqual([]);
    expect(capMoves([row("other", 1)], t + 1_000)).toHaveLength(1);
    const next = capMoves([row("spam", 100), row("spam", 101)], t + MOVE_CAP.windowMs);
    expect(next).toEqual([{ ...row("spam", 100), skip: 6 }, row("spam", 101)]);
    expect(conn(next[0]).note).toBe("앞서 6줄 건너뜀(너무 잦음)");
    resetMoveCap();
  });
});

describe("11/28 탈것·좌대 줄 (실시간 서버 「r」 줄)", () => {
  it("탈것 탐·내림 짝, 2인승 자리, 탄 시간, 서버가 내리게 한 까닭", () => {
    expect(conn(mv({ m: "rideOn", ride: "kayak", map: "sea", n: 2, dev: "phone" })).text).toBe("카약 탐 (바닷가 · 2번 카약)");
    expect(conn(mv({ m: "rideOn", ride: "kayak", map: "sea", n: 2, dev: "phone" })).note).toBe("폰");
    expect(conn(mv({ m: "rideOff", ride: "kayak", map: "sea", n: 2, sec: 192 })).text).toBe("카약에서 내림 (바닷가 · 2번 카약 · 3분 12초 탐)");
    expect(conn(mv({ m: "rideOn", ride: "rowboat", map: "camp", n: 1, seat: 1 })).text).toBe("나룻배 탐 (캠핑장 · 1번 나룻배 · 2인 중 뒷자리)");
    expect(conn(mv({ m: "rideOn", ride: "duck", map: "village", n: 3, seat: 0 })).text).toBe("오리배 탐 (마을 · 3번 오리배 · 2인 중 조종석)");
    expect(conn(mv({ m: "rideOff", ride: "tube", map: "sea", n: 1, sec: 0, off: "quit" })).text).toBe("튜브에서 내림 (바닷가 · 1번 튜브 · 0초 탐 · 게임을 나감·접속 끊김)");
    expect(conn(mv({ m: "rideOff", ride: "jetski", map: "sea", n: 2, off: "map" })).text).toBe("제트스키에서 내림 (바닷가 · 2번 제트스키 · 맵을 옮김)");
    expect(conn(mv({ m: "rideOff", ride: "boat", map: "village", off: "big" })).text).toBe("조각배에서 내림 (마을 · 몸이 커짐)");
    expect(conn(mv({ m: "rideOff", ride: "kayak", map: "sea", n: 2, brief: true, sec: 2 })).text).toBe("카약 탔다가 바로 내림 (바닷가 · 2번 카약 · 2초)");
    expect(conn(mv({ m: "rideOn", ride: "kayak", map: "sea", skip: 3 })).note).toBe("앞서 3줄 건너뜀(너무 잦음)");
    expect(conn(mv({ m: "rideOn", ride: "kayak" })).tag).toBe("탈것");
  });

  it("좌대에서 내려옴·내려보내짐", () => {
    expect(conn(mv({ m: "raftOut", ch: 1, n: 4, out: "end" })).text).toBe("좌대에서 내려옴 (1채널 4번 좌대 · 입장권 시간 끝남)");
    expect(conn(mv({ m: "raftOut", ch: 2, n: 1, out: "sold" })).text).toBe("좌대에서 내려옴 (2채널 1번 좌대 · 다른 사람이 그 좌대 입장권을 삼)");
    const t = conn(mv({ m: "raftOut", ch: 1, n: 5, out: "ticket" }));
    expect(t).toMatchObject({ tag: "좌대", tone: "warn", text: "좌대에서 내려보내짐 (1채널 5번 좌대 · 입장권 없이 올라가려 함)" });
  });

  it("모르는 탈것·까닭이 와도 문장 (던지지 않음)", () => {
    expect(conn(mv({ m: "rideOn", ride: "ufo" as never, map: "sea" })).text).toBe("탈것 탐 (바닷가)");
    expect(conn(mv({ m: "raftOut", out: "zzz" as never })).text).toBe("좌대에서 내려옴 (?채널 ?번 좌대 · zzz)");
  });
});
