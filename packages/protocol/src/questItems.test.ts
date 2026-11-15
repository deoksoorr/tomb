import { describe, expect, it } from "vitest";
import {
  AVATAR_BODIES,
  bodyTier,
  bodyUnlockPrice,
  EMOS,
  isAvatarBody,
  isEmoId,
  isQuestItem,
  isRideablePet,
  isShopListed,
  itemById,
  MAX_VALID_SPEED,
  petDef,
  permanentPrice,
  QUEST_BODIES,
  QUEST_EMO_IDS,
  QUEST_EMO_PACK,
  QUEST_ITEM_IDS,
  questBody,
  questGrantKind,
  RUN_SPEED,
  rideSpeed,
  ridePetOfLook,
  sanitizeLook,
  staffGateLook,
  verifyJoinToken,
  signJoinToken,
  ZOO_PETS,
} from "./index";

// 11/15 수집 의뢰 보상: 도장 교환소에서만 받는다 (상점·포인트 X). id는 lib/forage/quests/catalog.ts와 같다

const IDS = [
  "qe_pack",
  "q_dye_pick",
  "q_dye_special",
  "q_hat_angler",
  "q_hand_net",
  "q_hat_miner",
  "q_hand_brush",
  "q_name_wave",
  "q_name_leaf",
  "q_aura_firefly",
  "q_pet_goldfish",
  "q_aura_nightfish",
  "q_back_cape",
  "q_ride_carp",
  "q_body_collector",
  // 11/15 월마다 바뀌는 교환소 겨울·새해 묶음
  "q_hat_snow",
  "q_aura_snowglobe",
  "q_hand_wishlamp",
  "q_name_newyear",
  "q_pet_penguin",
  "q_back_kite",
];

describe("수집 의뢰 보상 카탈로그", () => {
  it("21종 모두 quest 표시, 상점 목록·영구 구매·동물원에 없다", () => {
    expect([...QUEST_ITEM_IDS].sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const it = itemById(id)!;
      expect(it, id).toBeTruthy();
      expect(it.quest, id).toBe(true);
      expect(isQuestItem(id)).toBe(true);
      expect(isShopListed(it), id).toBe(false);
      expect(permanentPrice(id), id).toBeNull();
      expect(petDef(id), id).toBeUndefined();
      expect(it.grade, id).toBeTruthy();
    }
    expect(isQuestItem("hat_cat")).toBe(false);
    // 전설은 수집가 유령 외형 하나뿐
    expect(IDS.filter((id) => itemById(id)!.grade === "legend")).toEqual(["q_body_collector"]);
  });

  it("받는 방법: 꾸미기 = 영구, 염색권 = 개수, 이모티콘 묶음 = 1개, 외형 = 해금", () => {
    expect(questGrantKind("qe_pack")).toBe("own");
    expect(questGrantKind("q_dye_pick")).toBe("count");
    expect(questGrantKind("q_dye_special")).toBe("count");
    expect(questGrantKind("q_body_collector")).toBe("body");
    for (const id of IDS.filter((i) => itemById(i)!.kind === "cosmetic")) expect(questGrantKind(id), id).toBe("permanent");
    expect(questGrantKind("hat_cat")).toBeNull();
    expect(itemById("q_dye_pick")!.dye).toEqual({ mode: "pick" });
    expect(itemById("q_dye_special")!.dye).toEqual({ mode: "special" });
  });

  it("착용 목록·입장 토큰이 의뢰 꾸미기를 받는다 (운영자가 아니어도)", async () => {
    const look = ["q_hat_miner", "q_hand_net", "q_back_cape", "q_aura_nightfish", "q_ride_carp", "q_name_wave", "q_name_leaf"];
    expect(sanitizeLook(look)).toEqual(look);
    expect(staffGateLook(sanitizeLook(look), false)).toEqual(look);
    const winter = ["q_hat_snow", "q_hand_wishlamp", "q_back_kite", "q_aura_snowglobe", "q_pet_penguin", "q_name_newyear"];
    expect(staffGateLook(sanitizeLook(winter), false)).toEqual(winter);
    for (const id of winter) expect(itemById(id)!.grade, id).not.toBe("legend");
    // 쓰는 물건(이모티콘 묶음·염색권·외형)은 착용 목록에 실리지 않는다
    expect(sanitizeLook(["qe_pack", "q_dye_pick", "q_body_collector"])).toEqual([]);
    const tok = await signJoinToken("s", { visitorId: "v", name: "n", color: "#e8d9b0", channel: 1, look, body: "collector" });
    const c = await verifyJoinToken("s", tok);
    expect(c?.look).toEqual(look);
    expect(c?.body).toBe("collector");
  });

  it("월척 잉어는 타는 펫 (동물원 밖), 타고 달려도 서버 속도 검증 안", () => {
    expect(ZOO_PETS.some((p) => p.id === "q_ride_carp")).toBe(false);
    expect(isRideablePet("q_ride_carp")).toBe(true);
    expect(ridePetOfLook(["q_ride_carp"])).toBe("q_ride_carp");
    expect(rideSpeed("q_ride_carp")).toBeLessThanOrEqual(1.35);
    expect(RUN_SPEED * rideSpeed("q_ride_carp")).toBeLessThan(MAX_VALID_SPEED);
    expect(isRideablePet("q_pet_goldfish")).toBe(false);
  });

  it("수집가 유령: 전설 외형, 선택권으로 살 수 없다", () => {
    expect(isAvatarBody("collector")).toBe(true);
    expect(AVATAR_BODIES.some((b) => b.id === "collector")).toBe(true);
    expect(questBody("collector")?.item).toBe("q_body_collector");
    expect(itemById("q_body_collector")!.body).toBe("collector");
    expect(bodyTier("collector")).toBe("legend");
    expect(bodyUnlockPrice("collector")).toBeNull();
    expect(QUEST_BODIES.map((b) => b.id)).toEqual(["collector"]);
  });

  it("의뢰 이모티콘 8종은 EMOS 맨 끝 (앞 순서 그대로), 실시간 서버도 id를 안다", () => {
    expect(itemById(QUEST_EMO_PACK)?.unlock).toBe("emo");
    expect(EMOS.slice(-8).map((e) => e.id)).toEqual([...QUEST_EMO_IDS]);
    expect(EMOS.slice(0, 3).map((e) => e.id)).toEqual(["heart", "laugh", "cry"]);
    for (const id of QUEST_EMO_IDS) expect(isEmoId(id)).toBe(true);
  });
});
