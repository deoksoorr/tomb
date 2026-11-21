import * as Phaser from "phaser";
import { TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { Lighting } from "../world/Lighting";
import { BeamView } from "./BeamView";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { ensureLighthouseTextures, LAMP_AT, LED_BOX, LED_LOOP, LED_TEXT, ledTextures, LTEX } from "./lighthouseArt";
import { BOARD_ART_H, BOARD_ART_W, LIGHTHOUSE, LIGHTHOUSE_ART_FOOT, LIGHTHOUSE_ART_H, LIGHTHOUSE_ART_W, LIGHTHOUSE_BOARD, lighthouseColliders } from "./lighthouseLayout";

// 11/20 마을의 「판교의 등대」 (예전 야근 빌딩 자리). 그림 + 몸 충돌 + 움직이는 장식:
//  - 등실·창·문 등 빛 층: 밤이 깊을수록 진해진다 (낮엔 은은하게)
//  - 등불 빛무리: 밤엔 천천히 숨 쉬듯
//  - 빛줄기 둘 (마주 보는 원뿔, 원근·가림·빛 웅덩이·연못 반짝이): 밤·어스름에만 — BeamView
//  - 오른쪽 앞 전광판: 글씨 띠를 1px씩 민다 (잘라 보는 창만 옮긴다)
// 움직임 줄이기면 빛줄기는 한 방향에 멈추고 전광판은 흐르지 않는다.

/** 전광판 글씨를 1px 미는 간격 */
const LED_STEP_MS = 110;
/** 11/20 전광판이 화면에 보이면 이번 주 1위를 이 간격으로 다시 묻는다 (UI도 1분 캐시) */
const WANT_MS = 60_000;

export class LighthouseView {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly glow: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  /** 11/20 빛줄기 (원근·가림·빛 웅덩이) */
  readonly beam: BeamView;
  private readonly ledGlow: Phaser.GameObjects.Image;
  private readonly led: Phaser.GameObjects.Image;
  /** 11/20 전광판 위 이름표 (이번 주 노멀 1위 — 한글은 LED 글꼴로 못 그려서 마을 이름표 글씨로) */
  private readonly tag: Phaser.GameObjects.BitmapText | null = null;
  private ledText = LED_TEXT;
  private ledLoop = LED_LOOP;
  private ledOff = 0;
  private wantAt = 0;
  private night = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    colliders: Phaser.Physics.Arcade.StaticGroup,
    private readonly reduced: boolean,
    /** 지금 밤 정도 0..1 (Atmosphere levels.darkness) */
    private readonly darkness: () => number = () => 0,
    private readonly atlas: GlyphAtlas | null = null,
  ) {
    ensureLighthouseTextures(scene);
    const { x, y } = LIGHTHOUSE;
    const foot = y + LIGHTHOUSE_ART_FOOT;
    const left = x - LIGHTHOUSE_ART_W / 2;
    const top = foot - LIGHTHOUSE_ART_H;
    this.objs.push(scene.add.image(left, top, LTEX.body).setOrigin(0, 0).setDepth(y));
    for (const r of lighthouseColliders()) {
      const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      z.removeFromDisplayList();
      colliders.add(z);
      this.objs.push(z);
    }
    // 등실·창·문 등 빛 (어둠 위)
    this.glow = scene.add.image(left, top, LTEX.glow).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights).setAlpha(0.2);
    // 등불 빛무리
    this.halo = scene.add
      .image(left + LAMP_AT.x + 0.5, top + LAMP_AT.y, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffe8a0)
      .setDepth(DEPTH.lights + 0.2)
      .setAlpha(0);
    this.objs.push(this.glow, this.halo);
    if (!reduced) this.timers.push(this.scene.time.addEvent({ delay: 90, loop: true, callback: () => this.breathe() }));
    // 빛줄기 둘 (BeamView — 밤 세기는 tick이 넘긴다)
    this.beam = new BeamView(scene, reduced);
    // 전광판: 판 + 잘라 보는 글씨 띠 (+ 빛 띠)
    const B = LIGHTHOUSE_BOARD;
    const bl = B.x - BOARD_ART_W / 2;
    const bt = B.y - BOARD_ART_H;
    this.objs.push(scene.add.image(bl, bt, LTEX.board).setOrigin(0, 0).setDepth(B.y));
    const lx = bl + LED_BOX.x;
    const ly = bt + LED_BOX.y;
    this.led = scene.add.image(lx, ly, LTEX.led).setOrigin(0, 0).setDepth(B.y + 0.2);
    this.ledGlow = scene.add.image(lx, ly, LTEX.ledGlow).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 0.1).setAlpha(0.3);
    this.objs.push(this.led, this.ledGlow);
    this.showLed();
    if (!reduced)
      this.timers.push(
        scene.time.addEvent({
          delay: LED_STEP_MS,
          loop: true,
          callback: () => {
            this.ledOff = (this.ledOff + 1) % this.ledLoop;
            this.showLed();
          },
        }),
      );
    // 11/20 이름표: 판 위 (마을 이름표 글씨, 화면에서 늘 같은 크기 — scaleLabels)
    if (atlas) {
      this.tag = scene.add.bitmapText(B.x, bt - 2, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setTint(0xffd890).setAlpha(0.95).setDepth(DEPTH.labels - 1).setVisible(false);
      this.objs.push(this.tag);
    }
    this.offs.push(bridge.on("lighthouse:board", (b) => this.setBoard(b.led, b.name)));
    const last = bridge.last("lighthouse:board");
    if (last) this.setBoard(last.led, last.name);
    // 밤 정도 따라 빛 층·빛줄기
    this.timers.push(scene.time.addEvent({ delay: 200, loop: true, callback: () => this.tick() }));
    this.tick();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private readonly offs: (() => void)[] = [];

  private showLed(): void {
    const lx = LIGHTHOUSE_BOARD.x - BOARD_ART_W / 2 + LED_BOX.x;
    for (const img of [this.led, this.ledGlow]) img.setCrop(this.ledOff, 0, LED_BOX.w, LED_BOX.h).setX(lx - this.ledOff);
  }

  /** 11/20 전광판 글·이름표 바꾸기 (UI가 lighthouse:board로) */
  private setBoard(text: string, name: string | null): void {
    if (text && text !== this.ledText) {
      const t = ledTextures(this.scene, text);
      this.ledText = text;
      this.ledLoop = t.loop;
      this.ledOff = 0;
      this.led.setTexture(t.led);
      this.ledGlow.setTexture(t.glow);
      this.showLed();
    }
    if (this.tag) {
      if (name) this.atlas?.ensure(name);
      this.tag.setText(name ?? "").setVisible(!!name);
    }
  }

  /** 1/zoom 배율 글씨 (WorldScene이 매 프레임) */
  scaleLabels(s: number): void {
    if (this.tag && this.tag.scaleX !== s) this.tag.setScale(s);
  }

  private tick(): void {
    // 11/20 전광판이 화면 안이면 1분에 한 번 이번 주 1위를 묻는다
    const now = this.scene.time.now;
    if (now >= this.wantAt && this.scene.cameras.main.worldView.contains(LIGHTHOUSE_BOARD.x, LIGHTHOUSE_BOARD.y - 10)) {
      this.wantAt = now + WANT_MS;
      bridge.emit("lighthouse:want");
    }
    const night = Math.min(1, Math.max(0, this.darkness()) * 2.2);
    if (Math.abs(night - this.night) < 0.01) return;
    this.night = night;
    this.glow.setAlpha(0.18 + 0.72 * night);
    this.ledGlow.setAlpha(0.3 + 0.6 * night);
    if (this.reduced) this.halo.setAlpha(0.12 + 0.5 * night).setScale(0.6 + 0.5 * night);
    // 빛줄기: 어스름부터 서서히, 낮엔 아예 끄고 돌리지도 않는다
    this.beam.setLevel(Math.min(1, Math.max(0, (night - 0.15) / 0.6)));
  }

  /** 등불 빛무리 숨쉬기 (낮엔 옅게) */
  private breathe(): void {
    const n = Math.max(0, this.night);
    const t = this.scene.time.now / 1000;
    const k = 0.5 + 0.5 * Math.sin(t * 1.6);
    // 11/20 빛줄기가 보는 사람 쪽을 향하면 빛무리·등실도 번쩍
    const f = this.beam.flash;
    this.halo.setAlpha(Math.min(1, 0.12 + n * (0.42 + 0.14 * k + 0.4 * f))).setScale(0.55 + n * (0.5 + 0.08 * k + 0.5 * f));
    this.glow.setAlpha(Math.min(1, 0.18 + 0.72 * n + 0.25 * f * n));
  }

  /** 11/20 빛 웅덩이·빛줄기 길이 어둠을 걷는다 (WorldScene.updateLighting) */
  addLights(lit: Lighting): void {
    this.beam.addLights(lit);
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off();
    for (const t of this.timers.splice(0)) t.remove();
    this.beam.destroy();
    for (const o of this.objs.splice(0)) o.destroy();
  }
}
