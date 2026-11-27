// 아바타 그림 전체판. 그림 본체는 avatarCore.ts — 여기서는 무거운 계절 한정 세트 그림을 끼워 넣고 그대로 내보낸다.
// 게임·상점·꾸미기·염색 등은 모두 이 파일을 부른다 (불러오는 순간 등록이 끝나 있다).
// 입장 화면 캐릭터 미리보기(기본 몸·색만)만 avatarCore를 직접 불러 첫 화면 묶음을 가볍게 둔다 (11/20).
import { AV_COLS, avatarFrameGrid, registerSeasonArt, sheetCosmeticIds } from "./avatarCore";
import { COSMETIC_FX_IDS } from "./cosmeticFx";
// 11/19 계절 한정 세트 (첫눈 출근길 · 산타 견습 요정)의 시트 그림
// 11/22 골목 붕어빵 수레 한정 꾸미기 · 외형 「붕어빵 장수 유령」 덧그림도 같이 (bungeoGear.ts — seasonSetGear가 합친다)
import { drawSsBack, drawSsGlow, drawSsHand, drawSsHead, drawSsNeck, SEASON_SHEET_IDS, seasonGearOf, ssBeginFrame, ssCovers, ssFrameCtx, ssHeadWorn } from "./seasonSetGear";
import { setRaftGearWarm } from "./raftGear";

registerSeasonArt({ SEASON_SHEET_IDS, seasonGearOf, ssCovers, ssHeadWorn, drawSsBack, drawSsNeck, drawSsHead, drawSsHand, drawSsGlow, ssFrameCtx, ssBeginFrame });
// 11/27 좌대 코디: 처음 그 몸으로 그릴 때 앞·옆·뒤 × 모든 열을 그 꾸미기 하나로 한 번 그려 줄임 단계를 정한다 (raftGear — 걷는 동안 크기가 깜빡이지 않게)
setRaftGearWarm((body, id) => {
  for (const view of ["down", "side", "up"] as const) for (let col = 0; col < AV_COLS; col++) avatarFrameGrid(body, view, col, "#9fb8d8", [id]);
});

export * from "./avatarCore";

/** 아바타가 그리는 꾸미기 전체: 시트에 그려지는 것 + AvatarView가 따로 붙이는 것(유령 친구·발자국 꽃·안개) + 따로 그리는 연출(날개 — 11/22 작은 날개도 cosmeticFx로) */
export const SPRITE_COSMETICS: readonly string[] = [...sheetCosmeticIds(), "pet_ghost", "feet_flowers", "aura_fog", ...COSMETIC_FX_IDS];
