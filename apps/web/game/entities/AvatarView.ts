import * as Phaser from "phaser";
import { DIR, type ActKind, type DirId, type StateName } from "@tomb/protocol";
import { avatarActAnimKey, avatarAnimKey, avatarFrame, ensureAvatarTexture, TEX } from "../assets/manifest";
import { DEPTH, LABEL_ME, LABEL_OTHER, prefersReducedMotion, SIT_IDLE_MS } from "../config";
import { AV_ORIGIN_Y, avatarArtTop, BODY_METRICS, bodyOf, waterSink } from "../sprites/avatar";
import type { EmoteIcon } from "../sprites/emotes";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { SpeechBubble } from "./SpeechBubble";

// 아바타 한 명의 화면 표현 (스프라이트 + 이름 라벨 + "…" 말풍선). 내 캐릭터와 원격 아바타가 같이 쓴다.
// 상태 값과 방향만 받아서 애니메이션을 고르고, 상태별 연출은 그림에만 얹는다 (논리 위치는 그대로):
//  - hang: HANG_LIFT만큼 들어 올리고 살짝 흔들린다     - swing: 그네처럼 좌우로 왕복 (진자)
//  - swim: 수면 물결 고리                              - dive: 물결 + 물방울이 올라온다
// 꾸미기: 모자·후광 고리·목도리·손등불은 시트에 함께 그려지고, 날개·후광 빛·그림자 유령 친구·발자국 꽃·
// 안개 망토·반딧불 오라는 따로 붙는 오브젝트다. 몸 모양(AVATAR_BODIES)은 시트를 바꾼다.
// 머리 위는 아래에서부터 머리 꾸미기(귀·모자·후광·날개 끝) → 이름표 → 말풍선/이모티콘 순으로 쌓는다:
// 이름표 높이는 몸·꾸미기 조합의 실제 그림 높이(avatarArtTop)로 정해서 꾸미기가 높으면 저절로 위로 올라간다.

/** 의자에 앉으면 좌석 위로 살짝 올려 그린다 */
export const SIT_CHAIR_LIFT = 3;
/** 나무에 매달리면 그림을 이만큼 들어 올린다 (발 위치는 줄기 앞 그대로) */
export const HANG_LIFT = 13;
/** 그네 진자 폭 (px)과 주기 (ms) */
const SWING_AMP = 3;
const SWING_PERIOD = 1600;
/** 수면 줄: 발바닥에서 위로 */
const WATER_LINE = 5;
const ACT_MS = 1200;
const FLOWER_POOL = 12;
const FLOWER_STEP = 10;
const FLOWER_MS = 3000;
const BUBBLES = 4;
const BUBBLE_MS = 900;
/** 꾸미기 반짝임 주기·길이 (착용하면 가끔 머리 위에서 반짝) */
const SPARKLE_EVERY_MS = 2600;
const SPARKLE_MS = 520;
/** 날개 그림: 어깨에서 이만큼 위가 날개 끝 */
const WING_TIP = 9;

export class AvatarView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.BitmapText;
  private bubble: Phaser.GameObjects.Image | null = null;
  /** 말풍선(say) — 처음 말할 때 만든다 */
  private speech: SpeechBubble | null = null;
  private texKey: string;
  private look: readonly string[] = [];
  private body: string;
  private labelGap: number;
  /** 발바닥에서 그림 맨 위 (머리 꾸미기 포함) */
  private artTop: number;
  private shoulder: number;
  private sparkle: Phaser.GameObjects.Image | null = null;
  private sparkleAt = 0;
  private aura: Phaser.GameObjects.Image[] = [];
  /** 손등불을 들고 있으면 조명이 더 넓다 */
  lantern = false;
  /** 점프 높이 (px). 스프라이트만 띄우고 발 위치(물리·네트워크)는 그대로 */
  hop = 0;
  private shadow: Phaser.GameObjects.Image | null = null;
  private baseOriginX = 0;
  private baseOriginY = 0;
  /** 상태 연출로 옮긴 표시 원점 (매달리기 들어 올림, 그네 진자) */
  private poseDx = 0;
  private poseDy = 0;
  private pendDx = 0;
  private pendDy = 0;
  private anim = "";
  private gestureUntil = 0;
  private swingFrame = -1;
  state: StateName = "idle";
  dir: DirId = DIR.down;
  /** 앉기 시작한 시각 (앉아 있지 않으면 0) */
  sitSince = 0;
  /** 의자 위처럼 y 정렬을 덮어써야 할 때 */
  depthOverride: number | null = null;

  private readonly reduced = prefersReducedMotion();
  private lastNow = 0;
  // 꾸미기 연출 오브젝트 (착용할 때만 만든다)
  private haloGlow: Phaser.GameObjects.Image | null = null;
  private wings: Phaser.GameObjects.Image | null = null;
  private pet: Phaser.GameObjects.Image | null = null;
  private petX = 0;
  private petY = 0;
  private fog: Phaser.GameObjects.Image[] = [];
  private flowers: Phaser.GameObjects.Image[] = [];
  private flowerBorn: number[] = [];
  private flowerNext = 0;
  private walkX = 0;
  private walkY = 0;
  private walked = 0;
  // 물 연출
  private ripple: Phaser.GameObjects.Image | null = null;
  private bubbles: Phaser.GameObjects.Image[] = [];
  private bubbleBorn: number[] = [];
  private bubbleX: number[] = [];
  private bubbleAt = 0;
  private bubbleNext = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    x: number,
    y: number,
    private readonly color: string,
    name: string,
    isMe: boolean,
    look: readonly string[] = [],
    body: string = "hood",
  ) {
    this.body = bodyOf(body);
    const m = BODY_METRICS[bodyOf(body)];
    this.artTop = m.top;
    this.labelGap = m.top + 2;
    this.shoulder = m.shoulder;
    this.texKey = ensureAvatarTexture(scene, color, look, this.body);
    this.sprite = scene.add.sprite(x, y, this.texKey, avatarFrame("idle", DIR.down)).setOrigin(0.5, AV_ORIGIN_Y);
    this.baseOriginX = this.sprite.displayOriginX;
    this.baseOriginY = this.sprite.displayOriginY;
    this.walkX = x;
    this.walkY = y;
    this.petX = x;
    this.petY = y;
    atlas.ensure(name);
    this.label = scene.add
      .bitmapText(x, y - this.labelGap, FONT_KEY, name, FONT_PX)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.labels + (isMe ? 1 : 0))
      .setTint(isMe ? LABEL_ME : LABEL_OTHER);
    this.apply("idle", DIR.down, 0);
    this.setLook(look);
  }

  private retexture(): void {
    const key = ensureAvatarTexture(this.scene, this.color, this.look, this.body);
    if (key !== this.texKey) {
      this.texKey = key;
      this.anim = "";
      this.swingFrame = -1;
      this.sprite.setTexture(key, this.sprite.frame.name);
      this.apply(this.state, this.dir, 0);
    }
  }

  /** 몸 모양 변경 (AVATAR_BODIES id, 모르는 값은 hood) */
  setBody(body: string): void {
    const b = bodyOf(body);
    if (b === this.body) return;
    this.body = b;
    this.shoulder = BODY_METRICS[b].shoulder;
    this.relayout();
    this.retexture();
  }

  /** 머리 위 쌓기 높이: 그림 맨 위(머리 꾸미기 포함)와 날개 끝 중 높은 곳 + 2px 위에 이름표 */
  private relayout(): void {
    this.artTop = avatarArtTop(this.body, this.look);
    const wings = this.look.includes("back_wings") ? this.shoulder + WING_TIP : 0;
    this.labelGap = Math.max(this.artTop, wings) + 2;
  }

  get bodyId(): string {
    return this.body;
  }

  /** 꾸미기 착용 변경 (바로 반영) */
  setLook(look: readonly string[]): void {
    this.look = look.slice();
    this.lantern = look.includes("hand_lantern");
    this.relayout();
    this.retexture();
    const vis = this.sprite.visible;
    const wantAura = look.includes("aura_firefly");
    if (wantAura && !this.aura.length) {
      for (let i = 0; i < 3; i++) {
        this.aura.push(this.scene.add.image(0, 0, TEX.firefly).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fireflies + 1).setVisible(vis));
      }
    } else if (!wantAura && this.aura.length) {
      for (const a of this.aura) a.destroy();
      this.aura = [];
    }
    if (look.includes("hat_halo")) {
      this.haloGlow ??= this.scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe27a).setScale(0.28).setDepth(DEPTH.lights + 2).setVisible(vis);
    } else {
      this.haloGlow?.destroy();
      this.haloGlow = null;
    }
    if (look.includes("back_wings")) {
      this.wings ??= this.scene.add.image(0, 0, TEX.avWings, 0).setVisible(vis);
    } else {
      this.wings?.destroy();
      this.wings = null;
    }
    if (look.includes("pet_ghost")) {
      if (!this.pet) {
        this.petX = this.sprite.x + 10;
        this.petY = this.sprite.y;
        this.pet = this.scene.add.image(this.petX, this.petY, TEX.avPetGhost).setOrigin(0.5, 1).setAlpha(0.72).setVisible(vis);
      }
    } else {
      this.pet?.destroy();
      this.pet = null;
    }
    if (look.includes("aura_fog")) {
      if (!this.fog.length)
        for (let i = 0; i < 3; i++)
          this.fog.push(this.scene.add.image(0, 0, TEX.glow).setTint(0xa8c8f0).setAlpha(0.22).setScale(0.42, 0.14).setVisible(vis));
    } else if (this.fog.length) {
      for (const f of this.fog) f.destroy();
      this.fog = [];
    }
    if (look.includes("feet_flowers")) {
      if (!this.flowers.length) {
        for (let i = 0; i < FLOWER_POOL; i++) {
          this.flowers.push(this.scene.add.image(0, 0, TEX.avFootFlower, i % 3).setDepth(DEPTH.decal + 2).setVisible(false));
          this.flowerBorn.push(-Infinity);
        }
        this.walkX = this.sprite.x;
        this.walkY = this.sprite.y;
        this.walked = 0;
      }
    } else if (this.flowers.length) {
      for (const f of this.flowers) f.destroy();
      this.flowers = [];
      this.flowerBorn = [];
    }
    // 착용하면 가끔 머리 위에서 작게 반짝 (움직임 줄이기 설정이면 없음)
    if (look.length && !this.reduced) {
      if (!this.sparkle) {
        this.sparkle = this.scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 3).setVisible(false);
        this.sparkleAt = 0;
      }
    } else {
      this.sparkle?.destroy();
      this.sparkle = null;
    }
  }

  get wearing(): readonly string[] {
    return this.look;
  }

  setName(name: string): void {
    this.atlas.ensure(name);
    this.label.setText(name);
  }

  /** 상태·방향 반영. 바뀔 때만 애니메이션을 바꾼다 */
  apply(state: StateName, dir: DirId, now: number): void {
    const sitting = state === "sitGround" || state === "sitChair";
    if (sitting && !(this.state === "sitGround" || this.state === "sitChair")) this.sitSince = now || 1;
    if (!sitting) this.sitSince = 0;
    this.state = state;
    this.dir = dir;
    if (now < this.gestureUntil) return;
    if (state === "swing") {
      // 그네 프레임은 진자 위상에 맞춰 sync에서 고른다
      if (this.anim !== "swing") {
        this.anim = "swing";
        this.swingFrame = -1;
        this.sprite.stop();
        this.sprite.setFrame(avatarFrame("swing", dir));
      }
      return;
    }
    const key = avatarAnimKey(this.texKey, state, dir);
    if (key !== this.anim) {
      this.anim = key;
      this.sprite.play(key, true);
    }
  }

  /** 잠깐의 몸짓 (꽃 놓기: 쪼그려 앉기 프레임) */
  gesture(dir: DirId, ms: number, now: number): void {
    this.gestureUntil = now + ms;
    this.anim = "";
    this.sprite.stop();
    this.sprite.setFrame(avatarFrame("sitGround", dir));
  }

  /**
   * 한 번 하는 동작 (같은 채널 모두에게 보인다): wave/bell → 손 흔들기, cheer/splash → 두 팔 환호. 약 1.2초.
   * 물속·매달리기·그네·앉은 상태에서는 몸짓 없이 넘어간다 (연출은 씬이 따로 한다).
   */
  playAct(kind: ActKind, now: number): void {
    // 이모티콘은 어떤 자세에서든 이름표 위에 뜬다 (같은 채널 모두에게)
    if (kind === "wave" || kind === "cheer") this.emote(kind, now);
    const s = this.state;
    if (s === "swim" || s === "dive" || s === "hang" || s === "swing" || s === "sitGround" || s === "sitChair" || s === "jump") return;
    const act = kind === "cheer" || kind === "splash" ? "cheer" : "wave";
    this.gestureUntil = now + ACT_MS;
    this.anim = "";
    this.sprite.play(avatarActAnimKey(this.texKey, act, this.dir), true);
  }

  /**
   * 점프 높이 반영: 표시 원점을 올려 그림만 띄운다 (위치는 그대로라 물리 바디·네트워크 좌표가 바뀌지 않는다).
   * 바닥에는 높이에 따라 작아지는 그림자를 남긴다. 바뀐 원점 차이를 돌려준다 (물리 바디 보정용).
   */
  setHop(h: number, shadowScale: number): number {
    const prev = this.hop;
    this.hop = h;
    const s = this.sprite;
    if (h !== prev) this.applyOrigin();
    if (h > 0.01) {
      if (!this.shadow) this.shadow = this.scene.add.image(0, 0, TEX.shadow).setOrigin(0.5, 0.5);
      this.shadow.setPosition(s.x, s.y - 1).setScale(shadowScale).setDepth(s.depth - 0.5).setVisible(s.visible);
    } else if (this.shadow) {
      this.shadow.destroy();
      this.shadow = null;
    }
    return h - prev;
  }

  private applyOrigin(): void {
    this.sprite.setDisplayOrigin(this.baseOriginX + this.poseDx, this.baseOriginY + this.hop + this.poseDy);
  }

  /**
   * 상태 연출(매달리기 들어 올림·그네 진자)로 바뀐 표시 원점 누적값을 꺼낸다.
   * 물리 바디가 켜진 채라면 setHop처럼 바디 오프셋에 더해 발 위치를 유지할 것 (매달리기·그네 중엔 바디를 끄는 게 보통).
   */
  consumeOriginDelta(out: { x: number; y: number }): { x: number; y: number } {
    out.x = this.pendDx;
    out.y = this.pendDy;
    this.pendDx = 0;
    this.pendDy = 0;
    return out;
  }

  /** 지금 상태 연출로 들어 올린 높이 (px) */
  get poseLift(): number {
    return this.poseDy;
  }

  private setPose(dx: number, dy: number): void {
    if (dx === this.poseDx && dy === this.poseDy) return;
    this.pendDx += dx - this.poseDx;
    this.pendDy += dy - this.poseDy;
    this.poseDx = dx;
    this.poseDy = dy;
    this.applyOrigin();
  }

  /** 논리 위치(발밑/좌석 앵커)에 놓는다 */
  place(x: number, y: number): void {
    const lift = this.state === "sitChair" ? SIT_CHAIR_LIFT : 0;
    this.sprite.setPosition(x, y - lift);
  }

  /** 정해진 문장 말풍선 (4초). 이름표 위에 뜬다 */
  say(text: string, now: number): void {
    this.speech ??= new SpeechBubble(this.scene, this.atlas);
    this.speech.show(text, now);
  }

  /** 이모티콘 (손 흔들기·환호·헌화·살려주세요): 말풍선 자리에 크게 잠깐 */
  emote(kind: EmoteIcon, now: number): void {
    this.speech ??= new SpeechBubble(this.scene, this.atlas);
    this.speech.showIcon(kind, now);
  }

  /** 지금 떠 있는 말풍선 (겹침 풀기용, 없으면 null) */
  speechAt(now: number): SpeechBubble | null {
    return this.speech && this.speech.active(now) && this.sprite.visible ? this.speech : null;
  }

  /** 라벨·말풍선·depth·상태 연출·꾸미기를 스프라이트에 맞춘다 (보이는 아바타만 매 프레임) */
  sync(now: number, labelScale: number): void {
    const s = this.sprite;
    const dt = this.lastNow ? Math.min(100, Math.max(0, now - this.lastNow)) : 16;
    this.lastNow = now;
    if (now >= this.gestureUntil && this.gestureUntil) {
      this.gestureUntil = 0;
      this.anim = "";
      this.apply(this.state, this.dir, now);
    }

    // ── 상태 연출 ──
    const st = this.state;
    if (st === "hang") {
      const sway = this.reduced ? 0 : Math.round(Math.sin(now / 650) * 1);
      this.setPose(sway, HANG_LIFT);
    } else if (st === "swing") {
      // 그네는 정면에서 보이므로 앞뒤로 흔들린다: 앞으로 오면 아래로·조금 크게, 뒤로 가면 위로·조금 작게.
      // 줄과 좌판은 아바타 그림에 함께 그려져 같이 움직인다 (가만히 있는 좌판은 WorldMap이 숨긴다)
      const ph = ((now % SWING_PERIOD) / SWING_PERIOD) * Math.PI * 2;
      const sn = Math.sin(ph);
      this.setPose(0, -Math.round(sn * (this.reduced ? 1 : SWING_AMP)));
      const sc = Math.round((1 + (this.reduced ? 0.02 : 0.07) * sn) * 50) / 50;
      if (s.scaleX !== sc) s.setScale(sc);
      const f = sn > 0 ? 0 : 1;
      if (f !== this.swingFrame && now >= this.gestureUntil) {
        this.swingFrame = f;
        s.setFrame(avatarFrame("swing", this.dir, f));
      }
    } else this.setPose(0, 0);
    if (st !== "swing" && s.scaleX !== 1) s.setScale(1);

    s.setDepth(this.depthOverride ?? s.y);
    const sitLift = st === "sitGround" ? 3 : st === "sitChair" ? 1 : 0;
    // 물에 잠긴 만큼 이름표도 내린다
    const waterDrop = st === "swim" || st === "dive" ? waterSink(this.body, st) : 0;
    const headY = s.y - this.hop - this.poseDy;
    // 매달리기는 두 팔이 머리 위로 올라가 그만큼 더 띄운다
    const armsUp = st === "hang" ? 3 : 0;
    this.label.setPosition(Math.round(s.x - this.poseDx), headY - this.labelGap + sitLift + waterDrop - armsUp);
    if (this.shadow) this.shadow.setPosition(s.x, s.y - 1).setDepth((this.depthOverride ?? s.y) - 0.5);
    if (this.label.scaleX !== labelScale) this.label.setScale(labelScale);
    const vis = s.visible;
    const bx = s.x - this.poseDx;

    for (let i = 0; i < this.aura.length; i++) {
      // 반딧불 세 마리가 몸 둘레를 천천히 돈다
      const a = now / 900 + (i * Math.PI * 2) / this.aura.length;
      const blink = 0.45 + 0.55 * Math.max(0, Math.sin(now / 350 + i * 2.1));
      this.aura[i].setPosition(bx + Math.cos(a) * 10, headY - 9 + Math.sin(a * 1.3) * 5).setAlpha(blink);
    }

    this.syncWater(now, bx, s.y, vis);
    this.syncCosmetics(now, dt, bx, headY, vis);

    const speaking = !!this.speech?.active(now);
    // 이름표 높이(height)는 이미 배율이 들어간 월드 높이 (displayHeight는 배율이 한 번 더 곱해져 이름표에 겹쳤다)
    const labelTop = this.label.y - this.label.height;
    if (this.speech) this.speech.place(this.label.x, labelTop - labelScale, labelScale, now, vis);
    const longSit = !speaking && this.sitSince > 0 && now - this.sitSince > SIT_IDLE_MS;
    if (longSit) {
      if (!this.bubble) {
        this.bubble = this.scene.add.image(0, 0, TEX.bubble).setOrigin(0.5, 1).setDepth(DEPTH.bubble).setAlpha(0);
        this.scene.tweens.add({ targets: this.bubble, alpha: 1, duration: 600 });
      }
      // 이름표 바로 위에 띄운다 (이름표는 화면 픽셀 크기라 줌에 따라 월드 높이가 바뀐다)
      const bob = Math.sin(now / 600) > 0.5 ? 1 : 0;
      this.bubble.setPosition(s.x, labelTop - labelScale - bob);
      this.bubble.setVisible(vis);
    } else if (this.bubble) {
      this.bubble.destroy();
      this.bubble = null;
    }
  }

  /** 수영·잠수: 수면 물결 고리, 잠수면 물방울 */
  private syncWater(now: number, x: number, y: number, vis: boolean): void {
    const st = this.state;
    const wet = st === "swim" || st === "dive";
    if (wet) {
      if (!this.ripple) this.ripple = this.scene.add.image(0, 0, TEX.avRipple);
      const k = this.reduced ? 0 : (Math.sin(now / 420) + 1) / 2;
      this.ripple
        .setPosition(x, y - WATER_LINE)
        .setScale(1 + 0.18 * k, 1 + 0.1 * k)
        .setAlpha(0.85 - 0.35 * k)
        .setDepth(this.sprite.depth + 0.1)
        .setVisible(vis);
    } else if (this.ripple) {
      this.ripple.destroy();
      this.ripple = null;
    }
    if (st === "dive") {
      if (!this.bubbles.length)
        for (let i = 0; i < BUBBLES; i++) {
          this.bubbles.push(this.scene.add.image(0, 0, TEX.avBubble).setVisible(false));
          this.bubbleBorn.push(-Infinity);
          this.bubbleX.push(0);
        }
      if (now >= this.bubbleAt) {
        this.bubbleAt = now + (this.reduced ? 1100 : 380 + Math.random() * 250);
        const i = this.bubbleNext;
        this.bubbleNext = (i + 1) % BUBBLES;
        this.bubbleBorn[i] = now;
        this.bubbleX[i] = x + Math.round((Math.random() - 0.5) * 7);
      }
      for (let i = 0; i < this.bubbles.length; i++) {
        const u = (now - this.bubbleBorn[i]) / BUBBLE_MS;
        const b = this.bubbles[i];
        if (u < 0 || u >= 1) {
          if (b.visible) b.setVisible(false);
          continue;
        }
        b.setPosition(this.bubbleX[i] + Math.sin(u * 9) * 0.6, y - WATER_LINE - 1 - u * 12)
          .setAlpha(1 - u)
          .setDepth(this.sprite.depth + 0.2)
          .setVisible(vis);
      }
    } else if (this.bubbles.length) {
      for (const b of this.bubbles) b.destroy();
      this.bubbles = [];
      this.bubbleBorn = [];
      this.bubbleX = [];
    }
  }

  private syncCosmetics(now: number, dt: number, x: number, headY: number, vis: boolean): void {
    const s = this.sprite;
    const st = this.state;
    const wet = st === "swim" || st === "dive";
    const depth = this.depthOverride ?? s.y;
    if (this.haloGlow) {
      const pulse = this.reduced ? 0.45 : 0.38 + 0.14 * Math.sin(now / 500);
      // 후광 고리는 그림 맨 위 (물에 들어가면 가라앉은 만큼 내려간다)
      const sink = wet ? waterSink(this.body, st) : 0;
      const sitDrop = st === "sitGround" ? 3 : st === "sitChair" ? 1 : 0;
      this.haloGlow.setPosition(x, headY - this.artTop + 1 + sink + sitDrop).setAlpha(pulse).setVisible(vis && st !== "dive");
    }
    if (this.wings) {
      const side = this.dir === DIR.left || this.dir === DIR.right;
      const flap = this.reduced ? 1 : 1 + 0.16 * Math.sin(now / (st === "run" ? 70 : 150));
      const w = this.wings;
      if (w.frame.name !== (side ? "1" : "0")) w.setFrame(side ? 1 : 0);
      w.setFlipX(this.dir === DIR.right)
        .setPosition(x + (this.dir === DIR.right ? 2 : this.dir === DIR.left ? -2 : 0), headY - this.shoulder - 3)
        .setScale(flap, 1)
        // 뒷모습(up)이면 날개가 앞에 보이고, 나머지는 몸 뒤
        .setDepth(this.dir === DIR.up ? depth + 0.05 : depth - 0.05)
        .setVisible(vis && !wet);
    }
    if (this.pet) {
      // 몸 뒤쪽으로 조금 떨어져 느긋하게 따라온다
      const back = this.dir === DIR.left ? [12, -1] : this.dir === DIR.right ? [-12, -1] : this.dir === DIR.up ? [7, 5] : [-9, -5];
      const k = 1 - Math.exp(-dt / 240);
      this.petX += (s.x + back[0] - this.petX) * k;
      this.petY += (s.y + back[1] - this.petY) * k;
      const bob = this.reduced ? 0 : Math.sin(now / 420) * 1.5;
      this.pet
        .setPosition(Math.round(this.petX), Math.round(this.petY - 4 + bob))
        .setFlipX(this.petX > s.x)
        .setDepth(this.petY)
        .setVisible(vis);
    }
    if (this.sparkle) {
      // 머리 꾸미기 언저리에서 작게 반짝 (반짝일 때만 보인다)
      if (now >= this.sparkleAt + SPARKLE_EVERY_MS) {
        this.sparkleAt = now + Math.random() * 600;
        const head = this.look.some((id) => id.startsWith("hat_"));
        const top = head ? this.artTop - 2 : Math.round(this.artTop * 0.55);
        this.sparkle.setData("dx", Math.round((Math.random() - 0.5) * 12)).setData("dy", top - Math.round(Math.random() * 3));
      }
      const u = (now - this.sparkleAt) / SPARKLE_MS;
      const on = u >= 0 && u < 1 && vis && st !== "dive";
      if (on) {
        const k = Math.sin(u * Math.PI);
        const sink = wet ? waterSink(this.body, st) : 0;
        this.sparkle
          .setPosition(x + (this.sparkle.getData("dx") as number), headY - (this.sparkle.getData("dy") as number) + sink)
          .setScale(0.6 + 0.5 * k)
          .setAlpha(0.9 * k)
          .setVisible(true);
      } else if (this.sparkle.visible) this.sparkle.setVisible(false);
    }
    for (let i = 0; i < this.fog.length; i++) {
      const a = now / 1800 + i * 2.1;
      this.fog[i]
        .setPosition(x + Math.cos(a) * 6, s.y - 1 + Math.sin(a * 1.4) * 1.5)
        .setAlpha(0.18 + 0.06 * Math.sin(now / 700 + i))
        .setDepth(depth + 0.03)
        .setVisible(vis && !wet && st !== "hang");
    }
    if (this.flowers.length) {
      if (st === "walk" || st === "run") {
        this.walked += Math.hypot(s.x - this.walkX, s.y - this.walkY);
        if (this.walked >= FLOWER_STEP) {
          this.walked = 0;
          const i = this.flowerNext;
          this.flowerNext = (i + 1) % FLOWER_POOL;
          this.flowerBorn[i] = now;
          this.flowers[i]
            .setFrame(Math.floor(Math.random() * 3))
            .setPosition(Math.round(s.x + (Math.random() - 0.5) * 6), Math.round(s.y - 1 + (Math.random() - 0.5) * 2))
            .setAlpha(1);
        }
      } else this.walked = 0;
      this.walkX = s.x;
      this.walkY = s.y;
      for (let i = 0; i < this.flowers.length; i++) {
        const u = (now - this.flowerBorn[i]) / FLOWER_MS;
        const f = this.flowers[i];
        if (u < 0 || u >= 1) {
          if (f.visible) f.setVisible(false);
          continue;
        }
        f.setAlpha(u < 0.7 ? 1 : (1 - u) / 0.3).setVisible(vis || f.visible);
      }
    }
  }

  setVisible(v: boolean): void {
    if (this.sprite.visible === v) return;
    this.sprite.setVisible(v);
    this.label.setVisible(v);
    this.bubble?.setVisible(v);
    if (!v) this.speech?.hide();
    for (const a of this.aura) a.setVisible(v);
    this.shadow?.setVisible(v);
    this.haloGlow?.setVisible(v);
    if (!v) this.sparkle?.setVisible(false);
    this.wings?.setVisible(v);
    this.pet?.setVisible(v);
    for (const f of this.fog) f.setVisible(v);
    this.ripple?.setVisible(v);
    if (!v) for (const b of this.bubbles) b.setVisible(false);
  }

  get visible(): boolean {
    return this.sprite.visible;
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.bubble?.destroy();
    this.bubble = null;
    this.speech?.destroy();
    this.speech = null;
    for (const a of this.aura) a.destroy();
    this.aura = [];
    this.shadow?.destroy();
    this.shadow = null;
    this.haloGlow?.destroy();
    this.haloGlow = null;
    this.sparkle?.destroy();
    this.sparkle = null;
    this.wings?.destroy();
    this.wings = null;
    this.pet?.destroy();
    this.pet = null;
    for (const f of this.fog) f.destroy();
    this.fog = [];
    for (const f of this.flowers) f.destroy();
    this.flowers = [];
    this.ripple?.destroy();
    this.ripple = null;
    for (const b of this.bubbles) b.destroy();
    this.bubbles = [];
  }
}
