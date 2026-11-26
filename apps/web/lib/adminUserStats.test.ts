import { describe, expect, it } from "vitest";
import { buildUserStats, clock, type UserStatsRaw } from "./adminUserStats";
import { newCharacter } from "./rpg/character";

const NOW = Date.UTC(2026, 10, 20, 5, 0); // 11/20 14:00 KST

function raw(over: Partial<UserStatsRaw> = {}): UserStatsRaw {
  return {
    accountId: "acc1",
    now: NOW,
    staff: false,
    summary: {
      accountId: "acc1",
      name: "토끼",
      createdAt: Date.UTC(2026, 10, 1, 3),
      lastSeenAt: NOW - 3 * 3_600_000,
      points: 1200,
      renameRequired: false,
      hasCode: true,
      stayMinutes: 125,
      lifetimePoints: 54321,
    },
    account: { streak: 4, lastAttend: "20261120", inventory: { a: 2, b: 0 }, equipped: [], stash: [], graves: ["g1"], nameChanges: 1 },
    activeDays: 12,
    hourDays: 3,
    pointRank: { value: 54321, rank: 7 },
    pointWeek: null,
    stayRank: { value: 125, rank: 30 },
    char: { ...newCharacter(), level: 50, tLevel: 3, runs: 40, fBest: 12, fBestMs: 83_400, hz: { "meeting-room": [5, 4], tower: [2, 9], bugs: [3, 0] } },
    kills: { value: 980, rank: 2 },
    killsWeek: null,
    zoneBest: { "meeting-room": { value: 61_250, rank: 1 } },
    towerRank: 4,
    chair: { used: { normal: 1, hell: 0 }, refunded: false, best: { normal: 5000, hell: 0 }, bestMs: { normal: 90_000, hell: 0 }, week: { normal: { damage: 4000, rank: 3 }, hell: null } },
    metrics: { fishn: 33, big: 41, gath: 10, quests: 2, champ: 1, look: 77, dex_fish: 5 },
    titles: ["t1", "t2"],
    wornTitle: null,
    friends: { friends: 3, incoming: 1, outgoing: 0 },
    referrals: { joined: 2, qualified: 1, credited: 1, paid: 1, month: 0, gJoined: 0, gPaid: 0 },
    referredBy: null,
    houses: { village: null, sea: null },
    megaphones: 2,
    bans: [],
    reported: null,
    ...over,
  };
}

const row = (s: ReturnType<typeof buildUserStats>, sec: string, label: string) => s.sections.find((x) => x.id === sec)?.rows.find((r) => r.label === label);

describe("buildUserStats", () => {
  it("묶음 순서와 기본 수치", () => {
    const s = buildUserStats(raw());
    expect(s.sections.map((x) => x.title)).toEqual(["기본", "사냥", "야근 빌딩", "회장님 독대", "채집·낚시", "포인트", "꾸미기·집", "소셜", "제재"]);
    expect(s.name).toBe("토끼");
    expect(row(s, "basic", "상태")?.value).toBe("정상");
    expect(row(s, "basic", "마지막 접속")?.value).toBe("3시간 전");
    expect(row(s, "basic", "총 접속 시간")).toMatchObject({ value: "2시간 5분", note: "30위" });
    expect(row(s, "basic", "가입일")?.value).toBe("2026. 11. 1.");
  });

  it("사냥: 판 수 누적(hz)·사냥터 표·처치 순위", () => {
    const s = buildUserStats(raw());
    expect(row(s, "hunt", "레벨")).toMatchObject({ value: "Lv.50", note: "초월 ★53" });
    expect(row(s, "hunt", "사냥터 판")).toMatchObject({ value: "5판", note: "깬 판 4판" });
    expect(row(s, "hunt", "누적 처치")).toMatchObject({ value: "980마리", note: "2위" });
    expect(row(s, "hunt", "곤충 잡기 판")?.value).toBe("3판");
    const t = s.sections.find((x) => x.id === "hunt")!.table!;
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].slice(1)).toEqual(["5", "4", "1분 1.3초", "1위"]);
  });

  it("야근 빌딩·회장님 독대·채집", () => {
    const s = buildUserStats(raw());
    expect(row(s, "tower", "최고 층")).toMatchObject({ value: "12층", note: "1분 23.4초 만에" });
    expect(row(s, "tower", "오른 판")).toMatchObject({ value: "2판", note: "깬 층 합 9층" });
    expect(row(s, "tower", "전체 순위")?.value).toBe("4위");
    expect(row(s, "chair", "일반 최고 피해")?.value).toBe("5,000");
    expect(row(s, "chair", "일반 이번 주")).toMatchObject({ value: "4,000", note: "3위" });
    expect(row(s, "chair", "지옥 최고 피해")?.value).toBe("—");
    expect(row(s, "life", "낚은 물고기")).toMatchObject({ value: "33마리", note: "가장 큰 것 4.1cm" });
    expect(row(s, "life", "물고기 도감")?.value).toMatch(/^5 \/ \d+$/);
  });

  it("옛 캐릭터(hz 없음)와 못 읽은 칸은 0판·—", () => {
    const s = buildUserStats(raw({ char: newCharacter(), metrics: null, friends: null, bans: null }));
    expect(row(s, "hunt", "사냥터 판")?.value).toBe("0판");
    expect(s.sections.find((x) => x.id === "hunt")!.table!.rows).toHaveLength(1); // 최단 기록만 있는 사냥터
    expect(row(s, "life", "낚은 물고기")?.value).toBe("—");
    expect(row(s, "social", "친구")?.value).toBe("—");
    expect(row(s, "sanction", "정지 기록")?.value).toBe("—");
  });

  it("지금 정지 중이면 상태·제재에 보인다", () => {
    const ban = {
      id: "b1",
      kind: "account" as const,
      accountId: "acc1",
      accountName: "토끼",
      ipHash: null,
      ipSource: null,
      ipAccounts: 0,
      reason: "도배",
      memo: "",
      startAt: NOW - 86_400_000,
      until: null,
      by: "admin",
      liftedAt: null,
      liftedBy: null,
      history: [],
    };
    const s = buildUserStats(raw({ bans: [ban], reported: { count: 3, lastAt: NOW } }));
    expect(row(s, "basic", "상태")?.value).toBe("정지");
    expect(row(s, "sanction", "지금 정지")).toMatchObject({ value: "영구", note: "도배" });
    expect(row(s, "sanction", "받은 유저 신고")?.value).toBe("3번");
  });

  it("11/26 캠핑장 집: 채널·터 이름 + 종류·앞마당 단계·카라반 디자인", () => {
    const camp = (c: object, lot: number) => ({ ch: 2, lot, score: 15, zone: "camp", camp: c }) as unknown as NonNullable<UserStatsRaw["houses"]>["village"];
    const cv = buildUserStats(raw({ houses: { village: null, sea: null, camp: camp({ kind: "caravan", yard: 3, design: { model: "airstream", color: 2, awning: 1 } }, 9) } }));
    expect(row(cv, "deco", "캠핑장 집")).toMatchObject({ value: "2채널 숲 쪽 9번 카라반", note: "카라반, 앞마당 3단계, 에어스트림 · 청록 · 파랑 차양, 꾸밈 점수 15" });
    const ps = buildUserStats(raw({ houses: { village: null, sea: null, camp: camp({ kind: "pension", yard: 1 }, 13) } }));
    expect(row(ps, "deco", "캠핑장 집")?.note).toBe("펜션, 앞마당 1단계, 꾸밈 점수 15");
    expect(row(buildUserStats(raw()), "deco", "캠핑장 집")?.value).toBe("없음");
    expect(row(buildUserStats(raw({ houses: null })), "deco", "캠핑장 집")?.value).toBe("—");
  });

  it("clock", () => {
    expect(clock(9_950)).toBe("9.9초");
    expect(clock(125_000)).toBe("2분 5.0초");
  });
});
