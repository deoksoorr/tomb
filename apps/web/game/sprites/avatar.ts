// 아바타 그림 전체판. 그림 본체는 avatarCore.ts — 여기서는 무거운 계절 한정 세트 그림을 끼워 넣고 그대로 내보낸다.
// 게임·상점·꾸미기·염색 등은 모두 이 파일을 부른다 (불러오는 순간 등록이 끝나 있다).
// 입장 화면 캐릭터 미리보기(기본 몸·색만)만 avatarCore를 직접 불러 첫 화면 묶음을 가볍게 둔다 (11/20).
import { registerSeasonArt, sheetCosmeticIds } from "./avatarCore";
import { COSMETIC_FX_IDS } from "./cosmeticFx";
// 11/19 계절 한정 세트 (첫눈 출근길 · 산타 견습 요정)의 시트 그림
import { drawSsBack, drawSsGlow, drawSsHand, drawSsHead, drawSsNeck, SEASON_SHEET_IDS, seasonGearOf, ssCovers, ssHeadWorn } from "./seasonSetGear";

registerSeasonArt({ SEASON_SHEET_IDS, seasonGearOf, ssCovers, ssHeadWorn, drawSsBack, drawSsNeck, drawSsHead, drawSsHand, drawSsGlow });

export * from "./avatarCore";

/** 아바타가 그리는 꾸미기 전체: 시트에 그려지는 것 + AvatarView가 따로 붙이는 것(날개·유령 친구·발자국 꽃·안개) */
export const SPRITE_COSMETICS: readonly string[] = [...sheetCosmeticIds(), "back_wings", "pet_ghost", "feet_flowers", "aura_fog", ...COSMETIC_FX_IDS];
