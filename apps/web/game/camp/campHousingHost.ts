import type { InputHub } from "../input/InputHub";
import type { GlyphAtlas } from "../text/GlyphAtlas";

// 11/24 캠핑장에서 [집] → [내 집 가기]로 바로 들어갈 때 집 씬(game/housing/install.ts)이 빌려 쓰는 것 (바닷가 seaHousingHost와 같다).
// 11/26 캠핑장 집 문(E)으로 들어갈 때도 빌린다 (나오면 그 집 문 앞 — standAtLot).
// 캠핑장 장면이 만들어지면 채우고 닫히면 비워요. 집에 들어가 있는 동안 캠핑장 장면은 scene:changed로 스스로 숨고, 나오면 그 자리에서 이어져요.

export type CampHousingHost = {
  atlas: GlyphAtlas;
  hub: InputHub;
  reduced: boolean;
  /** 캠핑장 장면이 보이고 입력을 받는 중인지 (버스·숨김·만드는 중이면 false) */
  active(): boolean;
  look(): readonly string[];
  body(): string;
  /** 11/26 그 캠핑장 집 문 앞으로 (집에서 나올 때 — 캠핑장 집 문으로 들어갔을 때). 캠핑장 집(game/camp/campHousing)이 채운다 */
  standAtLot?: (lot: number) => void;
};

export const campHousingHost: { current: CampHousingHost | null } = { current: null };
