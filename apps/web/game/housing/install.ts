import type * as Phaser from "phaser";
import type { PublicHouse } from "@/lib/housing/types";
import { bridge } from "../bridge";
import type { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import type { GameContext } from "../scenes/context";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { HouseScene, type HouseSceneData } from "./HouseScene";

// 하우징 씬 등록 + 월드 ↔ 집 전환. createGame에서 한 줄로 부른다.
// 월드 씬은 유령 잡화점과 똑같이 "숨기기만" 한다: 실시간 연결·원격 아바타 보간은 계속되고,
// 월드의 내 캐릭터는 분양 사무소 앞에 멈춰 있다가 나오면 그 자리에서 이어진다.
//
// 월드 씬에 공개된 진입 API가 아직 없어서, 상점 진입(enterShop)이 쓰는 필드를 같은 방식으로 빌려 쓴다.
// (TODO 게임 담당: WorldScene에 enterSubScene(key, data)/exitSubScene() 같은 공개 메서드가 생기면 이 파일만 바꾸면 된다)

type WorldLike = Phaser.Scene & {
  hub?: InputHub;
  atlas?: GlyphAtlas;
  rig?: { enabled: boolean };
  inShop?: boolean;
  reduced?: boolean;
  player?: { view: { wearing: readonly string[] } };
  onAction?: (a: KeyAction) => void;
  ctx?: GameContext;
};

export function installHousing(game: Phaser.Game, ctx: GameContext): void {
  game.scene.add("house", HouseScene, false);
  let inHouse: { world: WorldLike; mine: boolean } | null = null;

  const exit = () => {
    if (!inHouse) return;
    const { world } = inHouse;
    inHouse = null;
    game.scene.stop("house");
    world.scene.setVisible(true);
    if (world.rig) world.rig.enabled = true;
    world.inShop = false;
    if (world.hub && world.onAction) world.hub.setHandler((a) => world.onAction!.call(world, a));
    bridge.emit("scene:changed", { scene: "world" });
    bridge.emit("house:left");
  };

  const enter = (house: PublicHouse, mine: boolean, edit: boolean) => {
    const world = game.scene.getScene("world") as WorldLike | null;
    if (!world || !world.scene.isActive() || !world.hub || !world.atlas || ctx.disposed) return;
    // 이미 집 안이면 다른 집으로 바로 옮긴다
    if (inHouse) game.scene.stop("house");
    else {
      if (world.inShop) return;
      world.inShop = true; // 월드의 입력·탭 처리를 멈추고 캐릭터를 세운다 (상점과 같은 경로)
      if (world.rig) world.rig.enabled = false;
      world.scene.setVisible(false);
    }
    inHouse = { world, mine };
    const data: HouseSceneData = {
      house,
      mine,
      atlas: world.atlas,
      input: world.hub,
      color: ctx.opts.color,
      name: ctx.opts.name,
      look: world.player?.view.wearing ?? [],
      reduced: !!world.reduced,
      editing: edit,
      onExit: exit,
    };
    game.scene.run("house", data);
    bridge.emit("scene:changed", { scene: "house" });
  };

  const offs = [
    bridge.on("house:enter", ({ house, mine, edit }) => enter(house, mine, !!edit)),
    bridge.on("house:exit", () => {
      const s = game.scene.getScene("house") as HouseScene | null;
      if (inHouse && s?.scene.isActive()) s.leave();
      else exit();
    }),
    bridge.on("house:data", ({ house }) => {
      const s = game.scene.getScene("house") as HouseScene | null;
      if (!inHouse || !s?.scene.isActive()) return;
      const cur = (s as unknown as { data0?: HouseSceneData }).data0;
      // 크기가 바뀌면 처음부터 다시 그린다 (편집 모드는 유지)
      if (cur && cur.house.tier !== house.tier) s.scene.restart({ ...cur, house, editing: s.debugState.editing });
      else s.markSaved(house);
    }),
  ];
  ctx.disposers.push(() => {
    for (const off of offs) off();
    inHouse = null;
  });
}
