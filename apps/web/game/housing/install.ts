import type * as Phaser from "phaser";
import type { PublicHouse, VillageResponse } from "@/lib/housing/types";
import { bridge } from "../bridge";
import type { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import type { GameContext } from "../scenes/context";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { HouseScene, type HouseSceneData } from "./HouseScene";
import { VillageScene, type VillageSceneData } from "./VillageScene";

// 하우징 씬(마을·집) 등록 + 월드 ↔ 마을 ↔ 집 전환. createGame에서 한 줄로 부른다.
// 월드 씬은 유령 잡화점과 똑같이 "숨기기만" 한다: 실시간 연결·원격 아바타 보간은 계속되고,
// 월드의 내 캐릭터는 분양 사무소 앞에 멈춰 있다가 돌아오면 그 자리에서 이어진다.
//  - 월드 → 마을(village:enter) → 집(house:enter) → 나오면 마을의 그 집 문 앞 → 마을 입구로 나가면 월드
//  - 월드 → 집(분양 사무소에서 바로) → 나오면 월드
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
};

type Where = { at: "village" } | { at: "house"; from: "world" | "village"; lot: number } | null;

export function installHousing(game: Phaser.Game, ctx: GameContext): void {
  game.scene.add("house", HouseScene, false);
  game.scene.add("village", VillageScene, false);
  let where: Where = null;
  let world: WorldLike | null = null;
  /** 마지막 마을 정보 (집에서 마을로 돌아갈 때) */
  let lastVillage: { village: VillageResponse; myHouseId: string | null } | null = null;

  const hideWorld = (): boolean => {
    const w = game.scene.getScene("world") as WorldLike | null;
    if (!w || !w.scene.isActive() || !w.hub || !w.atlas || ctx.disposed || w.inShop) return false;
    w.inShop = true; // 월드의 입력·탭 처리를 멈추고 캐릭터를 세운다 (상점과 같은 경로)
    if (w.rig) w.rig.enabled = false;
    w.scene.setVisible(false);
    world = w;
    return true;
  };

  const showWorld = () => {
    const w = world;
    world = null;
    where = null;
    if (!w) return;
    w.scene.setVisible(true);
    if (w.rig) w.rig.enabled = true;
    w.inShop = false;
    if (w.hub && w.onAction) w.hub.setHandler((a) => w.onAction!.call(w, a));
    bridge.emit("scene:changed", { scene: "world" });
  };

  const base = () => ({
    atlas: world!.atlas!,
    input: world!.hub!,
    color: ctx.opts.color,
    name: ctx.opts.name,
    look: world!.player?.view.wearing ?? [],
    // 입장 화면에서 고르지 않았으면 입장 토큰으로 받은 몸 (월드의 내 아바타가 가진 값이 정답)
    body: world!.player?.view.bodyId ?? ctx.opts.body,
    reduced: !!world!.reduced,
  });

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
    bridge.emit("scene:changed", { scene: "house" });
  };

  const exitHouse = () => {
    if (where?.at !== "house") return;
    const { from, lot } = where;
    game.scene.stop("house");
    if (from === "village" && lastVillage) {
      runVillage(lastVillage, lot);
      bridge.emit("house:left", { to: "village" });
    } else {
      showWorld();
      bridge.emit("house:left", { to: "world" });
    }
  };

  const enterHouse = (house: PublicHouse, mine: boolean, edit: boolean) => {
    if (!where && !hideWorld()) return;
    const from = where?.at === "village" ? "village" : where?.at === "house" ? where.from : "world";
    stopAll();
    const data: HouseSceneData = { ...base(), house, mine, editing: edit, onExit: exitHouse };
    where = { at: "house", from, lot: house.lot };
    game.scene.run("house", data);
    bridge.emit("scene:changed", { scene: "house" });
  };

  const offs = [
    bridge.on("village:enter", ({ village, myHouseId, spawnLot }) => {
      if (!where && !hideWorld()) return;
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
    bridge.on("house:enter", ({ house, mine, edit }) => enterHouse(house, mine, !!edit)),
    bridge.on("house:exit", () => {
      const s = game.scene.getScene("house") as HouseScene | null;
      if (where?.at === "house" && s?.scene.isActive()) s.leave();
      else if (where?.at === "house") exitHouse();
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
  });
}
