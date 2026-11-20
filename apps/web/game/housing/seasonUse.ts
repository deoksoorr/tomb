import type { EmoteIcon } from "../sprites/emotes";
import type { HouseSound } from "./houseSfx";
import { OFFICE_FX, OFFICE_LIGHT_LABEL } from "./officeUse";

// 11/19 시즌 가구 써 보기 (서서 E — interact.ts의 "season"). 연출만 하고 포인트·아이템은 주지 않는다.
// 같은 방 사람에게는 use 이벤트(a = 한마디 번호)로 같은 연출을 보여 준다 (HouseScene.playSeason).
//  - v·ms: 잠깐 바뀌는 그림 (seasonFurnitureArt의 변형 이름)과 그 시간
//  - emote·sfx: 머리 위 이모티콘·소리, lines: 머리 위 한마디 (a번째)
//  - jump: 제자리에서 폴짝 (연 날리는 흉내)
// 불빛 가구(난로·트리·벽난로·케이크·디스코볼·초롱)는 석등처럼 켜기·끄기("light")라 여기 없다. 니트 러그는 앉기("rug").

export type SeasonFx = {
  v?: string;
  ms?: number;
  emote?: EmoteIcon;
  sfx?: HouseSound;
  lines?: readonly string[];
  jump?: boolean;
};

export const SEASON_FX: Readonly<Record<string, SeasonFx>> = {
  frost_window: { v: "breath", ms: 5000, emote: "heart", sfx: "wind", lines: ["호— 하고 하트를 그렸어요.", "창밖에 눈이 펑펑 와요.", "서리에 이름을 써 봤어요."] },
  log_basket: { emote: "fire", sfx: "rustle", lines: ["장작 한 아름! 오늘 밤은 따뜻하겠어요.", "솔방울 향이 나요."] },
  cocoa_table: { v: "sip", ms: 4000, emote: "coffee", sfx: "pour", lines: ["달콤한 코코아 한 모금.", "마시멜로가 사르르 녹아요."] },
  scarf_grave: { emote: "heart", sfx: "sheet", lines: ["목도리를 꼭꼭 여며 줬어요.", "올겨울도 따뜻하게 지내요.", "털모자가 잘 어울려요."] },
  paper_tree: { v: "stamp", ms: 3000, emote: "approve", sfx: "click", lines: ["쾅! 승인. 올해 결재 끝.", "반려… 아니고 승인!", "연말 결재 완료!"] },
  gift_pile: { v: "shake", ms: 1500, emote: "gift", sfx: "rustle", lines: ["달그락… 뭐가 들었을까요?", "이건 크리스마스까지 참기.", "리본이 살짝 풀렸어요."] },
  nutcracker: { v: "crack", ms: 1500, emote: "wow", sfx: "pop", lines: ["딱! 고소한 호두.", "병정이 씩 웃었어요."] },
  wreath_stand: { v: "ring", ms: 1500, emote: "note", sfx: "chime", lines: ["딸랑딸랑~", "메리 크리스마스!"] },
  balloon_bunch: { v: "bop", ms: 1500, emote: "party", sfx: "squeak", lines: ["둥실둥실~", "톡! 풍선이 흔들흔들."] },
  champagne_tower: { v: "clink", ms: 2000, emote: "party", sfx: "chime", lines: ["짠! 한 해 수고했어요.", "건배!"] },
  karaoke: { v: "sing", ms: 4000, emote: "tune", sfx: "tune", lines: ["♪ 부장님 18번 한 소절…", "100점! 앵콜!", "탬버린은 제가 맡을게요."] },
  folding_screen: { v: "fold", ms: 6000, emote: "zen", sfx: "creak", lines: ["병풍을 차곡차곡 접었어요.", "매화가 다시 활짝."] },
  tteokguk_table: { v: "eat", ms: 8000, emote: "grin", sfx: "pour", lines: ["떡국 한 그릇, 한 살 더 먹었어요.", "두 그릇은 안 돼요!"] },
  lucky_pouch: { v: "shake", ms: 1500, emote: "thanks", sfx: "chime", lines: ["새해 복 많이 받으세요!", "복이 한 줌 들어왔어요."] },
  shield_kite: { jump: true, emote: "wow", sfx: "wind", lines: ["연이 하늘 높이!", "바람아 불어라~", "얼레를 휘휘 감았어요."] },
  resolution_scroll: { emote: "clockout", sfx: "page", lines: ["올해 다짐: 칼퇴!", "칼… 퇴…! 큰 소리로 읽었어요.", "작심삼일은 없어요."] },
  // 11/20 총무팀 문대리 사무실 가구 (game/housing/officeUse.ts — 같은 길로 연출)
  ...OFFICE_FX,
};

/** 불빛 시즌 가구의 E 안내 (켜져 있으면 끄기). 없는 가구는 석등과 같은 「불 끄기·켜기」 */
const LIGHT_LABEL: Readonly<Record<string, readonly [off: string, on: string]>> = {
  winter_stove: ["난로 불 끄기", "난로 불 켜기"],
  xmas_tree: ["전구 끄기", "전구 켜기"],
  stocking_fireplace: ["벽난로 불 끄기", "벽난로 불 켜기"],
  cake_table: ["촛불 끄고 소원 빌기", "촛불 다시 켜기"],
  disco_ball: ["조명 끄기", "조명 켜기"],
  cheongsa_lantern: ["초롱 불 끄기", "초롱 불 켜기"],
  // 11/20 야근 스탠드
  ...OFFICE_LIGHT_LABEL,
};

/** dark = 지금 꺼져 있음 */
export const seasonLightLabel = (item: string, dark: boolean): string | null => {
  const l = LIGHT_LABEL[item];
  return l ? l[dark ? 1 : 0] : null;
};

/** 처음부터 켜져 있는 시즌 불빛 가구 (값 1 = 꺼짐) */
export const SEASON_LIGHTS: ReadonlySet<string> = new Set(Object.keys(LIGHT_LABEL));
