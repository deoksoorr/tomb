import type * as Phaser from "phaser";

// 11/15 언젠가 캠핑장 버스 (game/bus) 약속.
//  - BusArrival: 정류장(마을 납품 부두 위 마당·캠핑장 아래 왼쪽 길)에 버스가 들어와 서고 문이 열린다 → 타면 문 닫고 떠난다. 월드 좌표에 그린다
//  - BusRideScene("busRide"): 8초 버스 창밖 연출 (화면 전체). 가는 길 마을 → 고속도로 → 단풍 국도 → 숲길, 돌아오는 길은 반대
// 버스 텍스처 키는 BUS_TEX_PREFIX로 시작하고, 정류장 근처나 버스를 처음 부를 때 구워요. 한 번 구우면 지우지 않아요.

export const BUS_TEX_PREFIX = "bus-";
export const BUS_RIDE_SCENE = "busRide";
/** 창밖 연출 길이 */
export const BUS_RIDE_MS = 8000;

/**
 * 가는 쪽. "toCamp" = 마을에서 나가는 길(캠핑장·바닷가 어느 쪽이든), "toVillage" = 마을로 돌아오는 길.
 * 11/16 바닷가 노선이 생겨도 값은 그대로 둬요 (어디로 가는지는 BusRoute가 정해요)
 */
export type BusLeg = "toCamp" | "toVillage";
/** 11/16 노선: camp = 언젠가 캠핑장 (단풍 국도·숲길), sea = 달물결 포구 (해송 숲·바닷길) */
export type BusRoute = "camp" | "sea";

export type BusArrivalOptions = {
  /** 문이 정류장 앞에 오도록 서는 x (문 가운데) */
  doorX: number;
  /** 버스 바퀴가 닿는 길 y (버스 그림 맨 아래 줄) */
  laneY: number;
  /** true면 왼쪽 화면 밖에서 들어와 오른쪽으로 떠난다 */
  fromLeft: boolean;
  reduced: boolean;
  /** 떠나는 법: forward(기본) = 그대로 앞으로 달려 나간다, fade = 그 자리에서 흐려지며 사라진다 (캠핑장) */
  leave?: "forward" | "fade" | "loop";
  /** leave "fade"·"loop"일 때 문을 닫고 서 있는 시간 (ms) */
  waitMs?: number;
  /** 11/16 leave "loop" = 앞의 돌림 마당으로 이만큼(px) 천천히 굴러 들어가며 흐려져요 (돌아서 왔던 길로 나가는 셈 — 바닷가) */
  loopDist?: number;
};

export interface BusArrivalApi {
  /** 들어와 서고 문이 열리면 onOpen (약 2초) */
  arrive(onOpen: () => void): void;
  /** 문을 닫고 떠난다 (앞으로 화면 밖까지, 또는 잠깐 서 있다 흐려진다) — 다 사라지면 onGone */
  depart(onGone: () => void): void;
  /** 열린 문 앞 (캐릭터가 걸어 들어가는 자리) */
  readonly door: { x: number; y: number };
  destroy(): void;
}

export type BusRideData = {
  leg: BusLeg;
  /** 11/16 노선 (없으면 캠핑장). 창밖 풍경·끝 표지판·자막이 노선마다 달라요 */
  route?: BusRoute;
  reduced: boolean;
  /** 한국 시각 0~24 (하늘·창밖 색) */
  hour: number;
  /** 연출이 끝났다 (건너뛰기 포함). 장면은 스스로 멈춘다 */
  onDone: () => void;
};

/** BusRideScene이 밖에서 부를 수 있는 것 (E·탭으로 건너뛰기) */
export interface BusRideControl {
  skip(): void;
}

export type BusArrivalFactory = (scene: Phaser.Scene, o: BusArrivalOptions) => BusArrivalApi;
