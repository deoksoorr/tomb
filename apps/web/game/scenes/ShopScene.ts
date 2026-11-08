import * as Phaser from "phaser";
import { DIR } from "@tomb/protocol";
import { bridge } from "../bridge";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import type { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import type { MoveInput } from "../logic/movement";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 유령 잡화점 실내. 혼자 들어오는 작은 방이다 (원격 아바타는 그리지 않는다).
//  - 주인장 앞에서 E/Space/탭 → shop:open (UI가 상점 창을 연다)
//  - 아래 문으로 걸어 나가면 월드의 잡화점 문 앞으로 돌아간다
// 실시간 연결은 월드 씬이 그대로 유지하고, 월드에서의 내 위치는 문 앞에 멈춰 있는 것으로 둔다.

export type ShopContext = {
  atlas: GlyphAtlas;
  input: InputHub;
  color: string;
  name: string;
  look: readonly string[];
  reduced: boolean;
  onExit(): void;
};

const COLS = 13;
const ROWS = 10;
const W = COLS * 16; // 208
const H = ROWS * 16; // 160
const DOOR_X = W / 2;
const KEEPER = { x: W / 2, y: 50 };
const NEAR_KEEPER = 40;
const NO_SEATS: SeatRequester = { sit: () => undefined, stand: () => undefined };

export class ShopScene extends Phaser.Scene {
  private ctx!: ShopContext;
  private player!: Player;
  private keeper!: Phaser.GameObjects.Sprite;
  private prompt!: Phaser.GameObjects.BitmapText;
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  /** 문에서 한 번 떨어져야 나갈 수 있다 (들어오자마자 다시 나가지 않게) */
  private armed = false;
  private exiting = false;
  private lamps: Phaser.GameObjects.Image[] = [];
  private onTap = (e: PointerEvent) => this.handleTap(e);

  constructor() {
    super("shop");
  }

  init(data: ShopContext): void {
    this.ctx = data;
    this.armed = false;
    this.exiting = false;
  }

  create(): void {
    const { atlas } = this.ctx;
    this.cameras.main.setBackgroundColor("#120e14");

    // 바닥·벽
    for (let y = 2; y < ROWS - 1; y++) for (let x = 0; x < COLS; x++) this.add.image(x * 16, y * 16, TEX.shopFloor).setOrigin(0, 0).setDepth(-1000);
    for (let x = 0; x < COLS; x++) this.add.image(x * 16, 0, TEX.shopWall).setOrigin(0, 0).setDepth(-900);
    const side = (x: number) => this.add.rectangle(x, H / 2, 8, H, 0x2e2432).setDepth(-800);
    side(4);
    side(W - 4);
    this.add.rectangle(W / 2, H - 8, W, 16, 0x2e2432).setDepth(H);
    this.add.image(DOOR_X, H, TEX.shopDoor).setOrigin(0.5, 1).setDepth(H + 1);
    // 깔개
    this.add.rectangle(W / 2, 104, 72, 36, 0x6a2e3a).setDepth(-500).setStrokeStyle(1, 0xc8a050);

    // 선반·계산대·주인장
    this.add.image(28, 30, TEX.shopShelf0).setOrigin(0.5, 1).setDepth(30);
    this.add.image(64, 30, TEX.shopShelf1).setOrigin(0.5, 1).setDepth(30);
    this.add.image(W - 64, 30, TEX.shopShelf2).setOrigin(0.5, 1).setDepth(30);
    this.add.image(W - 28, 30, TEX.shopShelf0).setOrigin(0.5, 1).setDepth(30).setFlipX(true);
    this.keeper = this.add.sprite(KEEPER.x, KEEPER.y, TEX.shopKeeper, 0).setOrigin(0.5, 1).setDepth(KEEPER.y).setAlpha(0.92);
    if (!this.ctx.reduced) this.keeper.play("fx-keeper-float");
    this.add.image(W / 2, 66, TEX.shopCounter).setOrigin(0.5, 1).setDepth(66);
    // 통·상자
    this.add.rectangle(22, 136, 16, 14, 0x5a4028).setDepth(136).setStrokeStyle(1, 0x2e2018);
    this.add.rectangle(W - 22, 132, 18, 18, 0x6a4a30).setDepth(132).setStrokeStyle(1, 0x2e2018);

    // 걸린 등불 (따뜻한 빛)
    for (const [x, y] of [
      [40, 40],
      [W - 40, 40],
      [W / 2, 30],
    ] as const) {
      this.add.sprite(x, y, TEX.candle, 0).setDepth(y + 1).play("fx-candle-flicker");
      this.lamps.push(
        this.add.image(x, y - 4, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc070).setScale(1.3).setAlpha(0.45).setDepth(DEPTH.lights),
      );
    }

    // 충돌: 계산대, 아래 벽(문 빼고), 방 경계
    const walls = this.physics.add.staticGroup();
    const wall = (x: number, y: number, w: number, h: number) => {
      const z = this.add.zone(x + w / 2, y + h / 2, w, h);
      z.removeFromDisplayList();
      walls.add(z);
    };
    wall(W / 2 - 24, 54, 48, 12);
    wall(0, H - 18, DOOR_X - 12, 18);
    wall(DOOR_X + 12, H - 18, W - DOOR_X - 12, 18);
    wall(10, 128, 22, 14);
    wall(W - 32, 124, 22, 16);
    this.physics.world.setBounds(10, 40, W - 20, H - 40 + 6);

    this.player = new Player(this, atlas, DOOR_X, H - 20, this.ctx.color, this.ctx.name);
    this.player.view.setLook(this.ctx.look);
    this.player.dir = DIR.up;
    this.physics.add.collider(this.player.sprite, walls);

    atlas.ensure("E · 둘러보기");
    this.prompt = this.add
      .bitmapText(KEEPER.x, KEEPER.y - 24, FONT_KEY, "E · 둘러보기", FONT_PX)
      .setOrigin(0.5, 1)
      .setTint(0xffe39a)
      .setDepth(DEPTH.labels)
      .setVisible(false);

    // 카메라: 방 전체가 보이면 가운데, 작은 화면이면 따라간다
    const cam = this.cameras.main;
    const fit = Math.min(cam.width / W, cam.height / H);
    cam.setZoom(Math.max(2, Math.min(4, Math.floor(fit * 2) / 2)));
    cam.setRoundPixels(true);
    this.applyBounds();
    cam.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 10);

    this.ctx.input.setHandler((a) => this.onAction(a));
    this.game.canvas.addEventListener("pointerup", this.onTap);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyBounds, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener("pointerup", this.onTap);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyBounds, this);
      this.player.destroy();
    });
  }

  private applyBounds(): void {
    const cam = this.cameras.main;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    cam.setBounds(vw > W ? (W - vw) / 2 : 0, vh > H ? (H - vh) / 2 : 0, Math.max(W, vw), Math.max(H, vh));
  }

  private nearKeeper(): boolean {
    return Math.hypot(this.player.x - KEEPER.x, this.player.y - (KEEPER.y + 22)) < NEAR_KEEPER;
  }

  private onAction(a: KeyAction): void {
    if (this.exiting) return;
    if (a === "interact" && this.nearKeeper()) {
      this.player.faceTo(KEEPER.x, KEEPER.y, this.time.now);
      bridge.emit("shop:open");
      return;
    }
    if (a === "jump") {
      this.player.jump(this.time.now, NO_SEATS);
      return;
    }
    if (a === "sit") {
      if (this.player.sitting) this.player.stand(this.time.now, NO_SEATS);
      else this.player.sit(null, this.time.now, NO_SEATS);
    }
  }

  private handleTap(e: PointerEvent): void {
    if (this.exiting || this.ctx.input.isBlocked) return;
    const r = this.game.canvas.getBoundingClientRect();
    const p = this.cameras.main.getWorldPoint(
      ((e.clientX - r.left) * this.game.canvas.width) / Math.max(1, r.width),
      ((e.clientY - r.top) * this.game.canvas.height) / Math.max(1, r.height),
    );
    // 주인장(또는 계산대)을 탭하면 상점 창
    if (Math.abs(p.x - KEEPER.x) < 26 && p.y > KEEPER.y - 26 && p.y < 70) bridge.emit("shop:open");
  }

  update(time: number): void {
    if (this.exiting) return;
    this.ctx.input.read(this.move);
    if (this.ctx.input.isBlocked) {
      this.move.ax = this.move.ay = 0;
    }
    this.player.update(this.move, time, NO_SEATS);
    this.player.view.sync(time, 1 / this.cameras.main.zoom);
    this.prompt.setScale(1 / this.cameras.main.zoom).setVisible(this.nearKeeper());
    for (let i = 0; i < this.lamps.length; i++) this.lamps[i].setAlpha(this.ctx.reduced ? 0.45 : 0.4 + 0.06 * Math.sin(time / 130 + i));

    // 문 앞까지 내려가면 나간다 (들어온 직후엔 한 번 문에서 떨어져야 무장된다)
    const atDoor = Math.abs(this.player.x - DOOR_X) < 12 && this.player.y > H - 18;
    if (!atDoor && this.player.y < H - 30) this.armed = true;
    if (this.armed && atDoor && this.move.ay > 0) {
      this.exiting = true;
      this.ctx.input.setHandler(null);
      this.ctx.onExit();
    }
  }

  /** 테스트·디버그용 */
  get playerPos(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

}
