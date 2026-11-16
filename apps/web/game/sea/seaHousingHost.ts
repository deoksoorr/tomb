import type { InputHub } from "../input/InputHub";
import type { GlyphAtlas } from "../text/GlyphAtlas";

// 11/16 포구 오두막: 바닷가 장면이 떠 있을 때 집 씬(game/housing/install.ts)이 빌려 쓰는 것.
// 바닷가 장면(SeaHousing)이 만들어지면 채우고 닫히면 비워요. 집에 들어가 있는 동안 바닷가 장면은 scene:changed로 스스로 숨어요.

export type SeaHousingHost = {
  atlas: GlyphAtlas;
  hub: InputHub;
  reduced: boolean;
  /** 바닷가 장면이 보이고 입력을 받는 중인지 (버스·숨김 중이면 false) */
  active(): boolean;
  look(): readonly string[];
  body(): string;
  /** 그 오두막 터 출입구 앞으로 (집에서 나올 때·내 집 가기) */
  standAtLot(lot: number): void;
};

export const seaHousingHost: { current: SeaHousingHost | null } = { current: null };
