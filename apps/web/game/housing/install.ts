import type * as Phaser from "phaser";
import type { PublicHouse, VillageResponse } from "@/lib/housing/types";
import { bridge } from "../bridge";
import type { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import type { GameContext } from "../scenes/context";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { seaHousingHost, type SeaHousingHost } from "../sea/seaHousingHost";
import { campHousingHost, type CampHousingHost } from "../camp/campHousingHost";
import { doorOnEnter, houseExitTo } from "./housePlace";
import { HouseScene, type HouseSceneData } from "./HouseScene";
import { VillageScene, type VillageSceneData } from "./VillageScene";

// 하우징 씬(마을·집) 등록 + 월드 ↔ 마을 ↔ 집 전환. createGame에서 한 줄로 부른다.
// 월드 씬은 유령 잡화점과 똑같이 "숨기기만" 한다: 실시간 연결·원격 아바타 보간은 계속되고,
// 월드의 내 캐릭터는 분양 사무소 앞에 멈춰 있다가 돌아오면 그 자리에서 이어진다.
//  - 월드 → 마을(village:enter) → 집(house:enter) → 나오면 마을의 그 집 문 앞 → 마을 입구로 나가면 월드
//  - 월드 → 집(분양 사무소에서 바로) → 나오면 월드
//  - 11/24 [집] → [내 집 가기](house:enter stay): 들어가기 전 자리 그대로 나온다 (마을·바닷가·캠핑장 — 캠핑장은 campHousingHost)
// scene:changed는 마을·집 모두 "house"로 보낸다 (UI는 하우징 영역 동안 월드 HUD를 숨긴다).
//
// 월드 씬에 공개된 진입 API가 아직 없어서, 상점 진입(enterShop)이 쓰는 필드를 같은 방식으로 빌려 쓴다.
// (TODO 게임 담당: WorldScene에 enterSubScene(key, data)/exitSubScene() 같은 공개 메서드가 생기면 이 파일만 바꾸면 된다)

type WorldLike = Phaser.Scene & {
  hub?: InputHub;
  atlas?: GlyphAtlas;
  rig?: { enabled: boolean };
  inShop?: boolean;
  reduced?: boolean;
  player?: { view: { wearing: readonly string[]; bodyId: string } };
  onAction?: (a: KeyAction) => void;
  /** 유령 잡화점 안이면 나온다 (상점에서 친구 창의 [집 놀러 가기]를 눌렀을 때) */
  exitShop?: () => void;
  /** 그 번지 집 문 앞으로 (WorldScene.standAtHouseDoor) */
  standAtHouseDoor?: (lot: number) => void;
};

type Where = { at: "village" } | { at: "house"; from: "world" | "village"; lot: number; zone?: "sea"; stay?: boolean } | null;

export function installHousing(game: Phaser.Game, ctx: GameContext): void {
  game.scene.add("house", HouseScene, false);
  game.scene.add("village", VillageScene, false);
  let where: Where = null;
  let world: WorldLike | null = null;
  /** 11/16 바닷가 장면에서 들어온 집 (포구 오두막·친구 집). 바닷가 장면은 scene:changed로 스스로 숨고 돌아온다 */
  let sea: SeaHousingHost | null = null;
  /** 11/24 캠핑장 장면에서 바로 들어온 집 ([내 집 가기]). 캠핑장 장면도 scene:changed로 스스로 숨고 돌아온다 */
  let camp: CampHousingHost | null = null;
  /** 마지막 마을 정보 (집에서 마을로 돌아갈 때) */
  let lastVillage: { village: VillageResponse; myHouseId: string | null } | null = null;

  const hideWorld = (): boolean => {
    const w = game.scene.getScene("world") as WorldLike | null;
    if (!w || !w.scene.isActive() || !w.hub || !w.atlas || ctx.disposed) return false;
    // 상점 안에서 집으로 바로 (친구 창 [집 놀러 가기]·[친구한테 가기]): 상점에서 먼저 나온다. 예전엔 여기서 멈춰 집 HUD만 떠 있고 들어가지지 않았다
    if (w.inShop) w.exitShop?.call(w);
    if (w.inShop) return false;
    w.inShop = true; // 월드의 입력·탭 처리를 멈추고 캐릭터를 세운다 (상점과 같은 경로)
    if (w.rig) w.rig.enabled = false;
    w.scene.setVisible(false);
    world = w;
    return true;
  };

  /** 바닷가 장면을 빌린다 (월드가 자고 있고 바닷가가 떠 있을 때) */
  const hideSea = (): boolean => {
    const h = seaHousingHost.current;
    if (!h || !h.active() || ctx.disposed) return false;
    sea = h;
    return true;
  };

  /** 11/24 캠핑장 장면을 빌린다 ([내 집 가기]로 캠핑장에서 바로 들어갈 때만) */
  const hideCamp = (): boolean => {
    const h = campHousingHost.current;
    if (!h || !h.active() || ctx.disposed) return false;
    camp = h;
    return true;
  };

  const showWorld = () => {
    const w = world;
    world = null;
    where = null;
    if (sea || camp) {
      sea = null;
      camp = null;
      bridge.emit("scene:changed", { scene: "world" });
      return;
    }
    if (!w) return;
    w.scene.setVisible(true);
    if (w.rig) w.rig.enabled = true;
    w.inShop = false;
    if (w.hub && w.onAction) w.hub.setHandler((a) => w.onAction!.call(w, a));
    bridge.emit("scene:changed", { scene: "world" });
  };

  const base = () => {
    const away = sea ?? camp;
    return away
      ? { atlas: away.atlas, input: away.hub, color: ctx.opts.color, name: ctx.opts.name, look: away.look(), body: away.body(), reduced: away.reduced }
      : {
          atlas: world!.atlas!,
          input: world!.hub!,
          color: ctx.opts.color,
          name: ctx.opts.name,
          look: world!.player?.view.wearing ?? [],
          // 입장 화면에서 고르지 않았으면 입장 토큰으로 받은 몸 (월드의 내 아바타가 가진 값이 정답)
          body: world!.player?.view.bodyId ?? ctx.opts.body,
          reduced: !!world!.reduced,
        };
  };

  const stopAll = () => {
    if (game.scene.isActive("house") || game.scene.isPaused("house")) game.scene.stop("house");
    if (game.scene.isActive("village") || game.scene.isPaused("village")) game.scene.stop("village");
  };

  const runVillage = (v: { village: VillageResponse; myHouseId: string | null }, spawnLot: number | null, spawnAt?: { x: number; y: number }) => {
    lastVillage = v;
    const data: VillageSceneData = {
      ...base(),
      ...v,
      spawnLot,
      spawnAt,
      onExit: () => {
        stopAll();
        showWorld();
        bridge.emit("village:left");
      },
    };
    stopAll();
    where = { at: "village" };
    game.scene.run("village", data);
    bridge.emit("scene:changed", { scene: "house", place: "village" });
  };

  /** 월드의 내 캐릭터를 그 번지 집 문 앞으로 (월드에서 들어온 집만. 2단지 번지는 메인 맵에 없어 그대로) */
  const toDoor = (w: WorldLike | null, house: { lot: number; zone?: "sea" }) => {
    // 11/16 포구 오두막: 바닷가에서 들어왔으면 그 터 앞으로 (마을에서 들어왔으면 마을 캐릭터는 그대로)
    if (house.zone === "sea") {
      sea?.standAtLot(house.lot);
      return;
    }
    if (sea || camp) return;
    if (w?.standAtHouseDoor) w.standAtHouseDoor.call(w, house.lot);
  };

  const exitHouse = () => {
    if (where?.at !== "house") return;
    const { from, lot, zone, stay } = where;
    game.scene.stop("house");
    const to = houseExitTo(from, !!lastVillage, !!stay);
    if (to === "village" && lastVillage) {
      runVillage(lastVillage, lot);
      bridge.emit("house:left", { to: "village" });
    } else {
      // 문으로 들어갔으면 그 집 문 앞 (친구 집 놀러 가기로 들어왔어도 엉뚱한 곳으로 돌아가지 않게).
      // 11/24 [내 집 가기]로 바로 들어갔으면(stay) 들어가기 전 자리 그대로 — 숨은 캐릭터를 옮기지 않았다
      if (to === "door") toDoor(world, { lot, zone });
      showWorld();
      bridge.emit("house:left", { to: "world" });
    }
  };

  const enterHouse = (house: PublicHouse, mine: boolean, edit: boolean, stayHere: boolean) => {
    if (!where && !hideWorld() && !hideSea() && !(stayHere && hideCamp())) {
      // 들어갈 수 없으면 UI(집 HUD)도 닫는다 — 들어가지도 못했는데 위쪽 집 막대만 남아 닫히지 않던 문제
      bridge.emit("house:left", { to: "world" });
      // 11/15 캠핑장에 있으면 (월드가 자고 있다) 집은 마을에서 (11/16 바닷가도 같다)
      const inCamp = (bridge.last("map:changed")?.map ?? "village") !== "village" || bridge.last("bus:state")?.riding === true;
      bridge.emit("toast", { message: inCamp ? "집은 마을에 있어요. 버스를 타고 마을로 돌아가요." : "지금은 집에 들어갈 수 없어요. 잠시 뒤 다시 해 주세요." });
      return;
    }
    const from = where?.at === "village" ? "village" : where?.at === "house" ? where.from : "world";
    // 집에서 집으로 옮겨 가면(사무소 창에서 다른 집) 처음 들어올 때 정한 나올 자리를 이어 간다
    const stay = where?.at === "house" ? !!where.stay : stayHere;
    stopAll();
    const data: HouseSceneData = { ...base(), house, mine, editing: edit, onExit: exitHouse };
    where = { at: "house", from, lot: house.lot, ...(house.zone === "sea" ? { zone: "sea" as const } : {}), ...(stay ? { stay: true } : {}) };
    // 월드에서 들어온 집: 숨은 월드 캐릭터를 미리 문 앞에 세워 둔다 (새로고침 복원도 문 앞으로). [내 집 가기]면 그 자리 그대로
    if (doorOnEnter(from, stay)) toDoor(world, house);
    game.scene.run("house", data);
    bridge.emit("scene:changed", { scene: "house", place: "house", houseId: house.id });
  };

  const offs = [
    bridge.on("village:enter", ({ village, myHouseId, spawnLot }) => {
      if (!where && !hideWorld()) {
        if ((bridge.last("map:changed")?.map ?? "village") !== "village") bridge.emit("toast", { message: "분양 마을은 마을에서 들어가요. 버스를 타고 마을로 돌아가요." });
        return;
      }
      runVillage({ village, myHouseId }, spawnLot ?? null);
    }),
    bridge.on("village:data", (v) => {
      lastVillage = v;
      // 마을에 있으면 다시 그린다 (지금 자리 그대로)
      if (where?.at === "village") {
        const s = game.scene.getScene("village") as VillageScene | null;
        runVillage(v, null, s?.debugState.player);
      }
    }),
    bridge.on("village:exit", () => {
      if (where?.at !== "village") return;
      (game.scene.getScene("village") as VillageScene).leave();
    }),
    bridge.on("house:enter", ({ house, mine, edit, stay }) => enterHouse(house, mine, !!edit, !!stay)),
    bridge.on("house:exit", () => {
      const s = game.scene.getScene("house") as HouseScene | null;
      if (where?.at === "house" && s?.scene.isActive()) s.leave();
      else if (where?.at === "house") exitHouse();
      // 게임은 집에 없는데 UI만 집 HUD를 띄우고 있다 → UI도 닫게 알린다
      else if (!where) bridge.emit("house:left", { to: "world" });
    }),
    bridge.on("house:data", ({ house }) => {
      const s = game.scene.getScene("house") as HouseScene | null;
      if (where?.at !== "house" || !s?.scene.isActive()) return;
      const cur = (s as unknown as { data0?: HouseSceneData }).data0;
      // 크기가 바뀌면 처음부터 다시 그린다 (편집 모드는 유지)
      if (cur && cur.house.tier !== house.tier) s.scene.restart({ ...cur, house, editing: s.debugState.editing });
      else s.markSaved(house);
    }),
  ];
  ctx.disposers.push(() => {
    for (const off of offs) off();
    where = null;
    world = null;
    sea = null;
    camp = null;
  });
}
