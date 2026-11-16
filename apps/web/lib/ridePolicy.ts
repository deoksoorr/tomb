// 11/16 탈것에 탄 채로 다른 장면(사냥터·야근 빌딩·미니게임·집)으로 가지 않게 하는 규칙 (순수 함수 — lib/rideGate가 쓴다).
// 예전엔 오리배·조각배에 탄 채 [사냥]을 누르면 바로 사냥터로 갔다가, 끝나고 돌아오면 다시 배 위였다.
//  - 탈것(배·범퍼카·관람차·열기구·회전목마·시소·트램펄린·타는 펫·버스, 앞으로 생길 튜브·제트스키 같은 새 자세도): 막는다 → 내린 다음에
//  - 자리(의자·벤치·바닥·그네·나무·해먹·침대·책·욕조): 저절로 일어난 다음 간다
//  - 그 밖(서기·걷기·달리기·점프·수영·잠수): 그대로 간다

export type RideKind = "boat" | "bumper" | "ferris" | "balloon" | "carousel" | "seesaw" | "trampoline" | "pet" | "bus" | "tube" | "jetski" | "other";

/** 내 캐릭터가 지금 탄 것 (ride, 없으면 null)과 자리에 앉았는지 (seated) — 장면이 bridge "player:ride"로 알린다 */
export type RideStatus = { ride: RideKind | null; seated: boolean };

export const NOT_RIDING: RideStatus = { ride: null, seated: false };

/** 자세(Player.state) → 탈것 */
const RIDE_STATES: Readonly<Record<string, RideKind>> = {
  boat: "boat",
  bumper: "bumper",
  ferris: "ferris",
  balloon: "balloon",
  carousel: "carousel",
  seesaw: "seesaw",
  trampoline: "trampoline",
};
/** 일어나기만 하면 되는 자리 */
const SEAT_STATES: ReadonlySet<string> = new Set(["sitGround", "sitChair", "hang", "swing", "hammock", "lie", "read", "bath"]);
/** 아무것도 타지 않은 자세 */
const FREE_STATES: ReadonlySet<string> = new Set(["idle", "walk", "run", "jump", "swim", "dive"]);

const NOUN: Readonly<Record<RideKind, string>> = {
  boat: "배",
  bumper: "범퍼카",
  ferris: "관람차",
  balloon: "열기구",
  carousel: "회전목마",
  seesaw: "시소",
  trampoline: "트램펄린",
  pet: "펫",
  bus: "버스",
  // 11/16 r13 바닷가 튜브·제트스키 (자세는 조각배와 같은 boat — seaRide로 따로 알려요)
  tube: "튜브",
  jetski: "제트스키",
  other: "탈것",
};

export type PlayerRideInput = {
  /** Player.state */
  state: string;
  /** 조각배·오리배 자리 (Player.inBoat) */
  inBoat: boolean;
  /** 범퍼카 자리 (Player.inCar) */
  inCar: boolean;
  /** 타는 펫에 올라타 있다 (Riding.on) */
  pet: boolean;
  /** 11/16 r13 바닷가 튜브·제트스키에 탔다 (SeaRides — 자세는 boat라 이름만 따로) */
  seaRide?: "tube" | "jetski" | null;
};

/** 내 캐릭터 상태 → 탄 것·앉은 자리. 모르는 새 자세는 탈것으로 본다 (새 놀이기구가 생겨도 기본은 막기) */
export function rideStatusOf(p: PlayerRideInput): RideStatus {
  if (p.seaRide) return { ride: p.seaRide, seated: false };
  if (p.inBoat) return { ride: "boat", seated: false };
  if (p.inCar) return { ride: "bumper", seated: false };
  const r = RIDE_STATES[p.state];
  if (r) return { ride: r, seated: false };
  if (SEAT_STATES.has(p.state)) return { ride: null, seated: true };
  if (!FREE_STATES.has(p.state)) return { ride: "other", seated: false };
  return p.pet ? { ride: "pet", seated: false } : NOT_RIDING;
}

export function sameRide(a: RideStatus | null | undefined, b: RideStatus): boolean {
  return !!a && a.ride === b.ride && a.seated === b.seated;
}

/**
 * 다른 장면으로 가도 되는지: 막히면 안내 문구, 가도 되면 null.
 * todo = 하려는 일 ("사냥터에 갈"·"곤충 채집을 할" …, 없으면 "갈") → 「배에서 내린 다음에 사냥터에 갈 수 있어요.」
 * bus = 마을 ↔ 캠핑장·바닷가 버스 안
 */
export function rideBlockReason(st: RideStatus | null | undefined, bus = false, todo = "갈"): string | null {
  const kind: RideKind | null = bus ? "bus" : (st?.ride ?? null);
  if (!kind) return null;
  return `${NOUN[kind]}에서 내린 다음에 ${todo} 수 있어요.`;
}
