import type * as Phaser from "phaser";
import type { CampNpcId } from "@tomb/protocol";
import type { ReachZone } from "../logic/reach";

// 11/15 캠핑장 (game/camp) 모듈 사이 약속. 맵 그림·충돌(CampMap) ↔ 장면(CampScene) ↔ 버스(game/bus).
// 캠핑장 그림(텍스처)은 정류장 근처·버스 여행 동안 조금씩 굽고, 장면을 닫아도 남겨 둬요 (다시 갈 때 멈추지 않게).
// 캠핑장 텍스처 키는 모두 CAMP_TEX_PREFIX로 시작한다.

export const CAMP_TEX_PREFIX = "camp-";

/** E로 쓰는 것 (자리 앉기는 좌석 체계 — CAMP_SEATS — 가 따로) */
/**
 * 11/26 폭포 계곡 개편: 데크·캠핑카·전망대 망원경·별 망원경을 없앴어요.
 * (11/26 분양 입간판 sale은 뺐다 — 캠핑장 분양은 언젠가 씨·소슬댁·순이 할머니에게 말을 걸어서만) · rowboat = 윤슬 낚시터 나룻배 타기 · lot·house = 집 화면 담당(campHousing)이 끼워 넣는 집터·집 문
 * agungi = 11/26 촌캉스 아궁이 불 켜기·끄기 (campHousing) · tramp·slide = 11/26 놀이터 대형 트램펄린(매트 둘레)·워터 슬라이드 사다리 밑 (game/camp/CampPlay)
 */
export type CampInteractKind = "bus" | "npc" | "board" | "sign" | "bbq" | "vending" | "bungeo" | "rowboat" | "lot" | "house" | "tramp" | "slide" | "agungi" | "hammock";
export type CampInteractable = {
  id: string;
  kind: CampInteractKind;
  /** 상호작용 판정 중심 (발 위치 기준) */
  x: number;
  y: number;
  /** 판정 반지름 */
  r: number;
  /** 11/18 바닥 영역 (있으면 반지름 대신 이 상자 안이 닿는 곳 — 버스 정차 칸, game/logic/reach) */
  zone?: ReachZone;
  /** 화면 안내 ("E 버스 타기") */
  label: string;
  npc?: CampNpcId;
  /** 11/26 집터 번호 (집 화면 담당이 쓰는 lot·house) */
  lot?: number;
  seatId?: string;
};

/** 밤 빛 (Atmosphere.setStaticLights에 그대로 넘긴다 — WorldMap LightSpot과 같은 모양) */
export type CampLight = { x: number; y: number; scale: number; tint: number; base: number };

/** 매 프레임 CampMap.update에 넘기는 시간·날씨 (Atmosphere.levels + KST 시각) */
export type CampTime = {
  /** 한국 시각 0~24 (ambienceAt().kstHour — ?time= 덮어쓰기 반영) */
  hour: number;
  /** 0 낮 ~ 1 한밤 (Atmosphere.levels.darkness) */
  darkness: number;
  /** 비 0..1 */
  rain: number;
  /** 안개 0..1 */
  fog: number;
};

/** CampMap이 장면에 주는 것 (구현: game/camp/CampMap.ts) */
export interface CampMapApi {
  readonly width: number;
  readonly height: number;
  /** 막히는 것 (나무 줄기·건물·캠핑카·물·난간·바위 덩어리·맵 가장자리). 점프로도 못 넘는다 */
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  /** 의자·벤치·통나무·앉는 바위·탁자 (점프 중엔 넘는다) */
  readonly furnitureColliders: Phaser.Physics.Arcade.StaticGroup;
  readonly interactables: readonly CampInteractable[];
  /** 밤 빛 (줄 조명·모닥불·창문·정류장 등) */
  readonly staticLights: readonly CampLight[];
  /** 걸을 수 있는 칸인지 (새로고침 자리·친구 옆 자리 판정). 물·건물·나무 줄기·맵 밖이면 false */
  standable(x: number, y: number): boolean;
  /** 매 프레임: 화면 근처 컬링, 불꽃·물결·줄 조명·물안개·다람쥐·반딧불·은하수·NPC 시간대 표시 */
  update(time: number, delta: number, view: Phaser.Geom.Rectangle, t: CampTime): void;
  /** NPC가 지금 보이는지 (기타 캠퍼는 밤 9~11시) — 말 걸기 판정에 쓴다 */
  npcVisible(id: CampNpcId): boolean;
  /** NPC 머리 위 말풍선 자리 (없으면 null) */
  npcAnchor(id: CampNpcId): { x: number; y: number } | null;
  /** 큰 모닥불 둘레에 앉아 불멍 중이면 불티를 더 (CampfireView) */
  boostCampfire(id: string | null): void;
  /** (x,y)가 지붕 아래인지 (빗소리) — 11/26 큰 타프를 없애 늘 false */
  underTarp(x: number, y: number): boolean;
  /** 모든 오브젝트·캠핑장 텍스처 정리 */
  destroy(): void;
}
