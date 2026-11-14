import * as Phaser from "phaser";
import { champAuraOn, CHAT_SHOW_MS, dexBadgeCats, DIR, isChampBits, isNameSlot, itemById, ridePetOfLook, sanitizeDye, titleOfLook, type ActKind, type DirId, type StateName } from "@tomb/protocol";
import { hasNameStyle, nameStyleRef } from "@/lib/nameStyle";
import { titleLabel } from "@/lib/titles";
import { addCanvasTexture, avatarActAnimKey, avatarAnimKey, avatarFrame, ensureAvatarTexture, TEX } from "../assets/manifest";
import { DEPTH, LABEL_ME, LABEL_OTHER, prefersReducedMotion, SIT_IDLE_MS } from "../config";
import { AV_ORIGIN_Y, avatarArtTop, avatarColorSpec, BODY_METRICS, bodyOf, handAnchor, waterSink, type AppearanceChange, isDyedSpec } from "../sprites/avatar";
import { CosmeticFxView } from "./CosmeticFxView";
import { DyeFxView } from "./DyeFxView";
import { bodyFx, riderLift } from "../sprites/cosmeticFx";
import type { EmoteIcon } from "../sprites/emotes";
import { HAMMOCK_H, HAMMOCK_W, hammockLieKey, hammockLieSheet, LIE_ORIGIN_X, LIE_ORIGIN_Y } from "../sprites/hammockArt";
import { INDOOR_POSE_PERIOD, indoorPoseKey, indoorPoseSheet, isIndoorPose, POSE_H, POSE_W, type IndoorPose } from "../sprites/indoorPose";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { wrapChat } from "../logic/chatWrap";
import { SpeechBubble } from "./SpeechBubble";
import { MoodView } from "./MoodView";
import { STAFF_COLOR, StaffFxView } from "./StaffFxView";
import { ChampBadgeView } from "./ChampBadgeView";
import { NameStyleView } from "./NameStyleView";

/** 도감 100% 배지: 종류마다 별 하나 (금빛) */
const DEX_BADGE_STAR = "★";
/** 친구 표시: 이름표 왼쪽 작은 하트 (분홍) */
const FRIEND_HEART = "♥";
const FRIEND_TINT = 0xff8fb8;
const DEX_BADGE_TINT = 0xffd45e;
/** 칭호 글자 (연한 금빛 — 이름표 뼈색·촛불빛·1위 배지 금색과 구분되게 옅게) */
const TITLE_TINT = 0xf3d98a;
/** 칭호 위아래로 보이는 간격 (화면 px): 이름표 ↔ 칭호 ↔ 1위 배지·말풍선 */
const TITLE_GAP = 6;

// 아바타 한 명의 화면 표현 (스프라이트 + 이름 라벨 + "…" 말풍선). 내 캐릭터와 원격 아바타가 같이 쓴다.
// 상태 값과 방향만 받아서 애니메이션을 고르고, 상태별 연출은 그림에만 얹는다 (논리 위치는 그대로):
//  - hang: HANG_LIFT만큼 들어 올리고 살짝 흔들린다     - swing: 그네처럼 좌우로 왕복 (진자)
//  - swim: 수면 물결 고리                              - dive: 물결 + 물방울이 올라온다
//  - hammock: 해먹 천 안에 누운 그림(sprites/hammockArt — 천 곡선을 따라 휜 몸 + 앞 천)으로 바꿔 천천히 흔들린다 (F5)
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
/** 해먹 흔들림 주기 (몸이 천 안으로 1px 가라앉았다 올라온다) */
const LIE_PERIOD = 2400;
/** 해먹 누운 그림: 텍스처마다 몸 맨 윗줄 (이름표 자리) */
const lieTops = new Map<string, number>();
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
  /** 말풍선 자리에 지금 떠 있는 자유 채팅 (신고용) */
  private chatShown: { text: string; until: number } | null = null;
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
  /** 해먹 누운 그림을 쓰는 중 (텍스처가 아바타 시트가 아니다) */
  private lying = false;
  private lieKey = "";
  private lieFrame = -1;
  /** 3번 집 안 자세(눕기·읽기·욕조) 그림을 쓰는 중 (텍스처가 sprites/indoorPose 시트) */
  private pose: IndoorPose | null = null;
  private poseFrame = -1;
  state: StateName = "idle";
  dir: DirId = DIR.down;
  /** 앉기 시작한 시각 (앉아 있지 않으면 0) */
  sitSince = 0;
  /** 의자 위처럼 y 정렬을 덮어써야 할 때 */
  depthOverride: number | null = null;
  /** 실내로 들어가며 흐려지는·문에서 나타나는 정도 (1 = 그대로). 원격 아바타(RemoteAvatar)가 넣는다 */
  fade = 1;
  /**
   * 50번 조각배·시소·트램펄린·회전목마: 씬(PlazaRides·BoatRide)이 매 프레임 넣어 주는 그림 연출.
   * ox = 앵커에서 옆으로(회전목마), lift = 위로 띄우는 높이, depth = 그릴 순서 (null이면 그대로). 논리 위치는 그대로다.
   * dir = 보는 방향을 덮어쓴다(시소: 마주 보는 옆모습), alt = 잠깐 다른 자세 프레임(시소에서 땅을 찰 때 무릎 굽힘)
   */
  ride: { ox: number; lift: number; depth: number | null; dir?: DirId; alt?: StateName | null } | null = null;
  private altFrame = -1;
  /** 동물원 타는 펫: 착용한 펫이 타는 펫이면 그 id, 올라타 있는지 (실시간 서버 ride 또는 내 캐릭터) */
  private mountPet: string | null = null;
  private riding = false;

  private readonly reduced = prefersReducedMotion();
  private lastNow = 0;
  // 꾸미기 연출 오브젝트 (착용할 때만 만든다)
  private haloGlow: Phaser.GameObjects.Image | null = null;
  /** F8 추가 꾸미기 연출 (우산·풍선·날개·발자국·오라·펫) — 처음 입을 때 만든다 */
  private cfx: CosmeticFxView | null = null;
  /** 46번 특수 색(금빛 광택·반짝이·무지개·야광) 부위 연출 — 특수 색 부위가 있을 때만 */
  private dyeFx: DyeFxView | null = null;
  /** 24번 벤치 상태 (머리 위 작은 아이콘 + 손 소품) — 처음 고를 때 만든다 */
  private moodFx: MoodView | null = null;
  /** 31번 운영자 저승사자 차림 (낫·안개·배지). 켜져 있는 동안 몸 색은 염색했으면 그 색, 아니면 STAFF_COLOR. 원래 색은 staffBase에 둔다 */
  private staffFx: StaffFxView | null = null;
  private staffBase = "";
  /** 도감 100% 배지 (이름표 오른쪽 별) */
  private dexBadge: Phaser.GameObjects.BitmapText | null = null;
  private dexBadgeN = 0;
  /** 주간 랭킹 1위 값 (비트 묶음 + 오라 끔 표시, 0 = 아님)과 이름표 위 배지 */
  private champ = 0;
  private champBadge: ChampBadgeView | null = null;
  /** 칭호 「…」 (이름표 바로 위, 연한 금빛). 칭호를 달았을 때만 만든다 */
  private titleText: Phaser.GameObjects.BitmapText | null = null;
  /** 닉네임 꾸미기 (이름 글자 색·이름표 바탕판). 착용했을 때만 만든다 */
  private nameFx: NameStyleView | null = null;
  private readonly isMe: boolean;
  /** 친구 하트 (이름표 왼쪽). 친구일 때만 만든다 */
  private friendMark: Phaser.GameObjects.BitmapText | null = null;
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
    private color: string,
    name: string,
    isMe: boolean,
    look: readonly string[] = [],
    body: string = "hood",
  ) {
    this.isMe = isMe;
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
      if (this.lying || this.pose) {
        this.lying = false;
        this.pose = null;
        this.sprite.setTexture(key, avatarFrame("idle", this.dir));
      } else this.sprite.setTexture(key, this.sprite.frame.name);
      this.apply(this.state, this.dir, 0);
    }
    this.refreshDyeFx();
  }

  /** 46번 특수 색 부위 연출을 지금 색 표기에 맞춘다 (텍스처 키는 바탕 색만 보므로 특수 표시만 바뀌어도 여기서) */
  private refreshDyeFx(): void {
    if (DyeFxView.wants(this.color)) (this.dyeFx ??= new DyeFxView(this.scene)).set(this.color, this.look, this.body, this.texKey);
    else if (this.dyeFx) {
      this.dyeFx.destroy();
      this.dyeFx = null;
    }
  }

  /** 46번: 색 표기 변경 (avatarColorSpec — 염색) */
  setColor(spec: string): void {
    if (this.staffFx) this.staffBase = spec;
    const next = this.staffFx ? staffColorOf(spec) : spec;
    if (next === this.color) return;
    this.color = next;
    this.retexture();
  }

  get colorSpec(): string {
    return this.staffFx ? this.staffBase : this.color;
  }

  /** 31번 운영자 표시 켜기·끄기 (실시간 서버가 알린 staff, 내 캐릭터는 /api/me의 staff) */
  setStaff(on: boolean): void {
    if (on === !!this.staffFx) return;
    if (on) {
      this.staffBase = this.color;
      this.staffFx = new StaffFxView(this.scene, this.atlas, this.label.depth);
      this.color = staffColorOf(this.color);
    } else {
      this.staffFx?.destroy();
      this.staffFx = null;
      this.color = this.staffBase;
    }
    this.nameFx?.setStaff(on);
    this.retexture();
  }

  get staff(): boolean {
    return !!this.staffFx;
  }

  /** 도감 100% 배지 (종류별 비트, 0이면 없음): 이름표 오른쪽에 종류마다 작은 별 하나 */
  setDexBadge(bits: number | undefined): void {
    const n = dexBadgeCats(bits).length;
    if (n === this.dexBadgeN) return;
    this.dexBadgeN = n;
    if (!n) {
      this.dexBadge?.destroy();
      this.dexBadge = null;
      return;
    }
    const text = DEX_BADGE_STAR.repeat(n);
    this.atlas.ensure(text);
    if (this.dexBadge) this.dexBadge.setText(text);
    else this.dexBadge = this.scene.add.bitmapText(0, 0, FONT_KEY, text, FONT_PX).setOrigin(0, 1).setDepth(this.label.depth).setTint(DEX_BADGE_TINT);
  }

  get dexBadgeCount(): number {
    return this.dexBadgeN;
  }

  /**
   * 주간 랭킹 1위 (실시간 서버가 알린 champ, 내 캐릭터는 착용 증서와 같이 온 값): 이름표 위 "이번 주 ○○왕" 배지 +
   * 발밑·몸 뒤 1위 오라 (본인이 끄면 배지만). 0이나 모르는 값이면 둘 다 없앤다
   */
  setChamp(bits: number | undefined): void {
    const next = isChampBits(bits) ? bits : 0;
    if (next === this.champ) return;
    this.champ = next;
    if (!next) {
      this.champBadge?.destroy();
      this.champBadge = null;
    } else (this.champBadge ??= new ChampBadgeView(this.scene, this.atlas, this.label.depth)).set(next);
    if (this.cfx || champAuraOn(next)) (this.cfx ??= new CosmeticFxView(this.scene)).setLook(this.look, this.body, next);
  }

  get champBits(): number {
    return this.champ;
  }

  /** 지금 입은 꾸미기 (관람차·열기구 탑승 장면이 탄 사람 오라를 그릴 때) */
  get lookIds(): readonly string[] {
    return this.look;
  }

  /** 친구면 이름표 왼쪽에 작은 하트 (UI가 알려 준 같은 채널 친구) */
  setFriend(on: boolean): void {
    if (on === !!this.friendMark) return;
    if (!on) {
      this.friendMark?.destroy();
      this.friendMark = null;
      return;
    }
    this.atlas.ensure(FRIEND_HEART);
    this.friendMark = this.scene.add.bitmapText(0, 0, FONT_KEY, FRIEND_HEART, FONT_PX).setOrigin(1, 1).setDepth(this.label.depth).setTint(FRIEND_TINT);
  }

  get friend(): boolean {
    return !!this.friendMark;
  }

  /** 46·25번: 실시간 서버가 알린 염색·몸 모양 (없는 값은 그대로 둔다) */
  applyAppearance(extra: AppearanceChange | undefined): void {
    if (!extra) return;
    if (typeof extra.body === "string") this.setBody(extra.body);
    if (extra.dye !== undefined) this.setColor(avatarColorSpec(this.colorSpec, sanitizeDye(extra.dye)));
    if (typeof extra.champ === "number") this.setChamp(extra.champ);
  }

  /** 몸 모양 변경 (AVATAR_BODIES id, 모르는 값은 hood) */
  setBody(body: string): void {
    const b = bodyOf(body);
    if (b === this.body) return;
    this.body = b;
    this.shoulder = BODY_METRICS[b].shoulder;
    // 25번 프리미엄 외형 등급 연출은 몸에 딸린다 (다른 사람 화면에서도 몸 id로 똑같이)
    if (this.cfx || bodyFx(b)) (this.cfx ??= new CosmeticFxView(this.scene)).setLook(this.look, b, this.champ);
    this.relayout();
    this.retexture();
  }

  /** 머리 위 쌓기 높이: 그림 맨 위(머리 꾸미기 포함)와 날개 끝 중 높은 곳 + 2px 위에 이름표 */
  private relayout(): void {
    this.artTop = avatarArtTop(this.body, this.look);
    const wings = this.look.includes("back_wings") ? this.shoulder + WING_TIP : 0;
    this.labelGap = Math.max(this.artTop, wings, this.cfx?.labelTop(this.artTop, this.shoulder) ?? 0) + 2;
  }

  get bodyId(): string {
    return this.body;
  }

  /** 동물원 타는 펫에 올라타기·내리기 (착용한 펫이 타는 펫일 때만 그림이 바뀐다) */
  setRiding(on: boolean): void {
    if (on === this.riding) return;
    this.riding = on;
    this.anim = "";
    this.apply(this.state, this.dir, 0);
  }

  /** 올라타 있다고 표시된 상태 (펫이 타는 펫이 아니면 그림은 그대로) */
  get ridingOn(): boolean {
    return this.riding;
  }

  /** 이 자세에서 타는 펫 위에 앉아 보이는지 (서 있기·걷기·달리기·점프만 — 앉기·물·놀이기구는 내린 모습) */
  private mountedIn(st: StateName): boolean {
    return this.riding && this.mountPet !== null && (st === "idle" || st === "walk" || st === "run" || st === "jump");
  }

  /** 꾸미기 착용 변경 (바로 반영) */
  setLook(look: readonly string[]): void {
    this.look = look.slice();
    this.lantern = look.includes("hand_lantern") || look.includes("hand_lantern_blue");
    const mount = ridePetOfLook(look);
    if (mount !== this.mountPet) {
      this.mountPet = mount;
      this.anim = "";
    }
    if (this.cfx || look.length || bodyFx(this.body) || champAuraOn(this.champ)) (this.cfx ??= new CosmeticFxView(this.scene)).setLook(look, this.body, this.champ);
    this.relayout();
    this.retexture();
    this.setNameStyle(look);
    this.setTitle(titleLabel(titleOfLook(look)));
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
    // 착용하면 가끔 머리 위에서 작게 반짝 (움직임 줄이기 설정이면 없음). 닉네임 꾸미기만 했으면 몸에는 반짝이지 않는다
    if (look.some((id) => itemById(id)?.kind === "cosmetic" && !isNameSlot(itemById(id)?.slot)) && !this.reduced) {
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

  /** 칭호 글자 (null = 없앤다). 이름표와 같은 글꼴, 구분되게 연한 금빛 */
  private setTitle(text: string | null): void {
    if (!text) {
      this.titleText?.destroy();
      this.titleText = null;
      return;
    }
    if (this.titleText?.text === text) return;
    this.atlas.ensure(text);
    if (this.titleText) this.titleText.setText(text);
    else this.titleText = this.scene.add.bitmapText(0, 0, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setDepth(this.label.depth).setTint(TITLE_TINT).setVisible(this.sprite.visible);
  }

  /** 닉네임 꾸미기 (착용 목록에서 이름 글자·이름표 바탕판). 없으면 원래 이름표 색으로 */
  private setNameStyle(look: readonly string[]): void {
    const ref = nameStyleRef(look);
    if (!hasNameStyle(ref)) {
      this.nameFx?.destroy();
      this.nameFx = null;
      return;
    }
    if (!this.nameFx) {
      this.nameFx = new NameStyleView(this.scene, this.label, this.isMe, this.reduced);
      this.nameFx.setStaff(this.staff);
    }
    this.nameFx.set(ref.color, ref.plate);
  }

  setName(name: string): void {
    this.atlas.ensure(name);
    this.label.setText(name);
    this.nameFx?.textChanged();
  }

  /** 상태·방향 반영. 바뀔 때만 애니메이션을 바꾼다 */
  apply(state: StateName, dir: DirId, now: number): void {
    const sitting = state === "sitGround" || state === "sitChair";
    if (sitting && !(this.state === "sitGround" || this.state === "sitChair")) this.sitSince = now || 1;
    if (!sitting) this.sitSince = 0;
    this.state = state;
    this.dir = dir;
    if (state === "hammock") {
      this.lieDown();
      return;
    }
    if (isIndoorPose(state)) {
      this.indoorPose(state);
      return;
    }
    if (this.lying || this.pose) this.getUp(state, dir);
    if (now < this.gestureUntil) return;
    // 타는 펫 위: 서 있기·걷기·달리기·점프 모두 등에 앉은 자세 (높이는 sync가 올린다)
    if (this.mountedIn(state)) {
      const key = `mount:${dir}`;
      if (this.anim !== key) {
        this.anim = key;
        this.sprite.stop();
        this.sprite.setFrame(avatarFrame("sitChair", dir));
      }
      return;
    }
    // 놀거리가 잠깐 다른 자세 프레임을 쓰는 중 (sync가 고른다)
    if (this.altFrame >= 0 && this.ride?.alt && (state === "seesaw" || state === "carousel" || state === "trampoline" || state === "boat" || state === "ferris" || state === "balloon")) return;
    this.altFrame = -1;
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

  /** 해먹 누운 그림으로 (F5). 천이 해먹 소품과 픽셀 1:1로 겹치도록 표시 원점을 맞춘다 */
  private lieDown(): void {
    const key = hammockLieKey(this.texKey);
    if (!this.scene.textures.exists(key)) {
      const lie = hammockLieSheet(this.body, this.color, this.look);
      addCanvasTexture(this.scene, key, { canvas: lie.grid.toCanvas(), frameW: HAMMOCK_W, frameH: HAMMOCK_H });
      lieTops.set(key, lie.top);
    }
    if (this.lying && this.lieKey === key) return;
    this.lying = true;
    this.lieKey = key;
    this.lieFrame = 0;
    this.anim = "lie";
    this.gestureUntil = 0;
    this.sprite.stop();
    this.sprite.setTexture(key, 0);
    this.applyOrigin();
  }

  /** 3번 집 안 자세 그림으로 (프레임 크기·원점이 아바타와 같다) */
  private indoorPose(kind: IndoorPose): void {
    if (this.lying) this.getUp("idle", this.dir);
    const key = indoorPoseKey(this.texKey, kind);
    if (!this.scene.textures.exists(key)) {
      addCanvasTexture(this.scene, key, { canvas: indoorPoseSheet(kind, this.body, this.color, this.look).toCanvas(), frameW: POSE_W, frameH: POSE_H });
    }
    if (this.pose === kind && this.sprite.texture.key === key) return;
    this.pose = kind;
    this.poseFrame = 0;
    this.anim = "pose";
    this.gestureUntil = 0;
    this.sprite.stop();
    this.sprite.setTexture(key, 0);
    this.applyOrigin();
  }

  /** 해먹·집 안 자세에서 일어남: 아바타 시트로 돌아온다 (애니메이션은 apply가 이어서 고른다) */
  private getUp(state: StateName, dir: DirId): void {
    this.pose = null;
    this.lying = false;
    this.anim = "";
    this.sprite.setTexture(this.texKey, avatarFrame(state === "swing" ? "swing" : "idle", dir));
    this.applyOrigin();
  }

  /** 잠깐의 몸짓 (꽃 놓기: 쪼그려 앉기 프레임) */
  gesture(dir: DirId, ms: number, now: number): void {
    if (this.lying || this.pose) return;
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
    if (s === "swim" || s === "dive" || s === "hang" || s === "swing" || s === "hammock" || s === "sitGround" || s === "sitChair" || s === "jump") return;
    if (s === "boat" || s === "seesaw" || s === "trampoline" || s === "carousel") return;
    if (isIndoorPose(s)) return;
    if (this.mountedIn(s)) return; // 타는 펫 위에서는 몸짓 없이 이모티콘만
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
    if (this.lying) this.sprite.setDisplayOrigin(LIE_ORIGIN_X + this.poseDx, LIE_ORIGIN_Y + this.hop + this.poseDy);
    else this.sprite.setDisplayOrigin(this.baseOriginX + this.poseDx, this.baseOriginY + this.hop + this.poseDy);
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
    this.chatShown = null;
  }

  /** 말풍선 자유 채팅 (가린 글, CHAT_SHOW_MS). 떠 있던 말풍선·이모티콘은 바로 바뀐다 (한 자리 하나) */
  chat(text: string, now: number): void {
    this.speech ??= new SpeechBubble(this.scene, this.atlas);
    this.speech.showChat(wrapChat(text), now, CHAT_SHOW_MS);
    this.chatShown = { text, until: now + CHAT_SHOW_MS };
  }

  /** 지금 떠 있는 자유 채팅 글 (신고에 붙인다). 없거나 다른 말풍선으로 바뀌었으면 null */
  chatText(now: number): string | null {
    return this.chatShown && now < this.chatShown.until ? this.chatShown.text : null;
  }

  /** 이모티콘 (손 흔들기·환호·헌화·5번 이모티콘 판): 말풍선 자리에 크게 잠깐 (ms 없으면 기본 길이) */
  emote(kind: EmoteIcon, now: number, ms?: number): void {
    this.speech ??= new SpeechBubble(this.scene, this.atlas);
    this.speech.showIcon(kind, now, ms);
    this.chatShown = null;
  }

  /** 24번 벤치 상태 (SEAT_MOODS id, 없거나 ""면 푼다). 앉아 있는 동안만 보인다 */
  setMood(mood: string | null | undefined): void {
    if (!mood && !this.moodFx) return;
    (this.moodFx ??= new MoodView(this.scene, this.reduced)).set(mood);
  }

  /** 지금 벤치 상태 (없으면 null) */
  get mood(): string | null {
    return this.moodFx?.current ?? null;
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
    } else if (st === "hammock") {
      // 천 안에서 몸이 천천히 1px 가라앉았다 올라온다 (천은 그대로라 밑의 해먹 소품과 어긋나지 않는다)
      this.setPose(0, 0);
      const f = this.reduced ? 0 : Math.sin(((now % LIE_PERIOD) / LIE_PERIOD) * Math.PI * 2) > 0.2 ? 1 : 0;
      if (this.lying && f !== this.lieFrame) {
        this.lieFrame = f;
        s.setFrame(f);
      }
    } else if (st === "boat" || st === "seesaw" || st === "trampoline" || st === "carousel" || st === "ferris" || st === "balloon") {
      // 놀거리 연출은 씬이 정해 준다 (회전목마는 앵커 둘레를 돌고, 트램펄린은 통통, 시소는 오르락내리락, 배는 물결에 살짝)
      const r = this.ride;
      this.setPose(r ? -Math.round(r.ox) : 0, r ? Math.round(r.lift) : 0);
      if (r && r.depth !== null) this.depthOverride = r.depth;
      if (r?.dir !== undefined && r.dir !== this.dir) {
        this.dir = r.dir;
        this.altFrame = -1;
        this.anim = "";
        this.apply(st, r.dir, now);
      }
      const alt = r?.alt && now >= this.gestureUntil ? avatarFrame(r.alt, this.dir) : -1;
      if (alt >= 0) {
        if (alt !== this.altFrame) {
          this.altFrame = alt;
          this.anim = "";
          s.stop();
          s.setFrame(alt);
        }
      } else if (this.altFrame >= 0) {
        this.altFrame = -1;
        this.apply(st, this.dir, now);
      }
    } else if (this.pose && isIndoorPose(st)) {
      // 3번 집 안 자세: 숨쉬기(이불)·책장 넘기기·거품 방울을 천천히 번갈아
      this.setPose(0, 0);
      const period = INDOOR_POSE_PERIOD[this.pose];
      const f = this.reduced ? 0 : (now % period) / period > 0.55 ? 1 : 0;
      if (f !== this.poseFrame) {
        this.poseFrame = f;
        s.setFrame(f);
      }
    } else if (this.mountedIn(st)) {
      // 타는 펫 등 위로 들어 올린다 (걸으면 발걸음에 맞춰 1px 출렁)
      const bob = (st === "walk" || st === "run") && !this.reduced ? Math.floor(now / (st === "run" ? 90 : 140)) % 2 : 0;
      this.setPose(0, riderLift(this.mountPet) + bob);
    } else this.setPose(0, 0);
    if (this.altFrame >= 0 && st !== "boat" && st !== "seesaw" && st !== "trampoline" && st !== "carousel" && st !== "ferris" && st !== "balloon") this.altFrame = -1;
    if (s.angle !== 0) s.setAngle(0);
    if (st !== "swing" && s.scaleX !== 1) s.setScale(1);

    s.setDepth(this.depthOverride ?? s.y);
    const sitLift = st === "sitGround" ? 3 : st === "sitChair" ? 1 : 0;
    // 물에 잠긴 만큼 이름표도 내린다
    const waterDrop = st === "swim" || st === "dive" ? waterSink(this.body, st) : 0;
    // 해먹에 누우면 머리 꼭대기 = 누운 몸 맨 윗줄 (그 2px 위에 이름표)
    const headY = st === "hammock" && this.lying ? s.y - LIE_ORIGIN_Y + (lieTops.get(this.lieKey) ?? 8) - 2 + this.labelGap : s.y - this.hop - this.poseDy;
    // 매달리기는 두 팔이 머리 위로 올라가 그만큼 더 띄운다
    const armsUp = st === "hang" ? 3 : 0;
    // 24번 벤치 상태 아이콘이 있으면 머리와 이름표 사이에 끼운다 (그만큼 이름표를 올린다)
    const labelY = headY - this.labelGap + sitLift + waterDrop - armsUp;
    // 오라(착용·전용)를 그릴 몸 자리 — 모든 자세에서 보이게 (auraFrame)
    const af = this.auraFrame(st, s.y, headY, labelY, waterDrop, sitLift, armsUp);
    const moodLift = this.moodFx?.lift(st) ?? 0;
    this.label.setPosition(Math.round(st === "hammock" ? s.x : s.x - this.poseDx), labelY - moodLift);
    if (this.shadow) this.shadow.setPosition(s.x, s.y - 1).setDepth((this.depthOverride ?? s.y) - 0.5);
    if (this.label.scaleX !== labelScale) this.label.setScale(labelScale);
    const vis = s.visible;
    const bx = s.x - this.poseDx;
    const fa = this.fade;
    if (s.alpha !== fa) s.setAlpha(fa);
    if (this.label.alpha !== fa) this.label.setAlpha(fa);
    // 닉네임 꾸미기 (바탕판이 있으면 옆 표시·위 배지를 그만큼 비켜 놓는다)
    this.nameFx?.sync(now, labelScale, vis, fa);
    const side = this.nameFx?.sidePad(labelScale) ?? 0;
    if (this.dexBadge) {
      const l = this.label;
      if (this.dexBadge.scaleX !== labelScale) this.dexBadge.setScale(labelScale);
      this.dexBadge.setPosition(Math.round(l.x + l.width / 2 + 2 * labelScale + side), l.y).setAlpha(fa).setVisible(vis && l.visible);
    }
    if (this.friendMark) {
      const l = this.label;
      if (this.friendMark.scaleX !== labelScale) this.friendMark.setScale(labelScale);
      this.friendMark.setPosition(Math.round(l.x - l.width / 2 - 2 * labelScale - side), l.y).setAlpha(fa).setVisible(vis && l.visible);
    }
    if (this.shadow && this.shadow.alpha !== fa) this.shadow.setAlpha(fa);

    for (let i = 0; i < this.aura.length; i++) {
      // 반딧불 세 마리가 몸 둘레를 천천히 돈다: 뒤쪽 반원은 몸 뒤(depth 아래)에 작고 어둡게 → 입체감
      const a = now / 900 + (i * Math.PI * 2) / this.aura.length;
      const z = Math.sin(a);
      const blink = 0.45 + 0.55 * Math.max(0, Math.sin(now / 350 + i * 2.1));
      const d = this.depthOverride ?? s.y;
      // 앞쪽은 예전처럼 밤 어둠 위(반딧불 층), 뒤쪽은 몸 뒤
      // 모든 자세에서: 보이는 몸 가운데 높이 (물에 잠기거나 누우면 그 높이로, 잠수 중엔 은은하게)
      this.aura[i]
        .setPosition(bx + Math.cos(a) * 10, af.base - Math.min(9, (af.base - af.top) * 0.5) + z * 3 + Math.sin(a * 2 + i) * 2)
        .setAlpha(blink * af.dim * (z < 0 ? 0.55 + 0.45 * (1 + z) : 1))
        .setScale(z < 0 ? 1 + 0.22 * z : 1)
        .setDepth(z < 0 ? d - 0.2 : DEPTH.fireflies + 1);
    }

    this.syncWater(now, bx, s.y, vis);
    this.syncCosmetics(now, dt, bx, headY, vis, af);
    this.dyeFx?.sync(now, s);
    if (this.staffFx) {
      const d = this.dir;
      this.staffFx.sync(
        {
          now,
          x: bx,
          y: s.y - this.hop - this.poseDy,
          dir: d,
          hand: handAnchor(this.body, d === DIR.left ? "left" : d === DIR.right ? "right" : d === DIR.up ? "up" : "down"),
          depth: this.depthOverride ?? s.y,
          moving: st === "walk" || st === "run",
          hidden: st === "dive" || st === "swim" || st === "hammock" || st === "hang" || st === "lie" || st === "bath" || st === "swing",
          reduced: this.reduced,
          label: this.label,
          labelScale,
        },
        vis,
      );
    }
    if (this.cfx) {
      const d = this.dir;
      this.cfx.sync(
        {
          now,
          dt,
          x: bx,
          y: s.y,
          headY,
          dir: d,
          moving: st === "walk" || st === "run",
          hidden: st === "dive" || st === "hammock" || st === "swim" || st === "hang" || st === "lie" || st === "bath",
          artTop: this.artTop,
          shoulder: this.shoulder,
          hand: handAnchor(this.body, d === DIR.left ? "left" : d === DIR.right ? "right" : d === DIR.up ? "up" : "down"),
          reduced: this.reduced,
          riding: this.mountedIn(st),
          hop: this.hop,
          water: st === "swim" || st === "dive" ? st : null,
          // 앉기(피아노·책상·벤치)·집 안 자세는 그림 depth를 덮어쓴다: 날개 앞뒤도 그 값 기준이어야 몸에 안 가린다
          depth: this.depthOverride ?? s.y,
          // 오라(착용·전용)는 모든 자세에서 보이게: 보이는 몸 자리 (물 = 수면, 누운 자세 = 누운 몸, 그 밖 = 그림 발밑)
          aura: af,
        },
        vis,
        fa,
      );
    }

    this.moodFx?.sync(now, bx, s.y, labelY, this.dir, this.body, this.depthOverride ?? s.y, st, vis);

    const speaking = !!this.speech?.active(now);
    // 이름표 높이(height)는 이미 배율이 들어간 월드 높이 (displayHeight는 배율이 한 번 더 곱해져 이름표에 겹쳤다)
    // 주간 1위 배지가 있으면 이름표 위에 얹고, 말풍선은 그 위로
    // 이름표 위로 쌓기: (바탕판 여백) → 칭호 → 주간 1위 배지 → 말풍선.
    // 칭호가 있으면 보이는 간격을 모두 TITLE_GAP으로 맞춘다: 이름표(바탕판이 있으면 판 윗변, 운영자면 금빛 테두리, 그냥 글자면 글자 윗선) ↔ 칭호 글자 ↔ 1위 배지 판·말풍선
    let lift = this.nameFx?.topLift(labelScale) ?? 0;
    let labelTop: number;
    if (this.titleText) {
      const t = this.titleText;
      const sc = labelScale;
      if (t.scaleX !== sc) t.setScale(sc);
      const pad = this.atlas.inkPad;
      const gap = TITLE_GAP * sc;
      const cellTop = this.label.y - this.label.height;
      const visibleTop = cellTop - (lift > 0 ? lift : this.staffFx ? 1.5 * sc : -pad.top * sc);
      const titleBottom = visibleTop - gap + pad.bottom * sc;
      t.setPosition(Math.round(this.label.x), Math.round(titleBottom)).setAlpha(fa).setVisible(vis && this.label.visible);
      const titleInkTop = titleBottom - t.height + pad.top * sc;
      // 1위 배지 판 아랫변 = 칭호 글자 윗선 − 간격 (ChampBadgeView: 판 아랫변 = 칸 위 − 1px − lift)
      lift = cellTop - sc - (titleInkTop - gap);
      labelTop = this.champBadge ? this.champBadge.sync(this.label, sc, vis, fa, now, this.reduced, lift) : titleInkTop - gap + sc;
    } else labelTop = this.champBadge ? this.champBadge.sync(this.label, labelScale, vis, fa, now, this.reduced, lift) : this.label.y - this.label.height - lift;
    if (this.speech) this.speech.place(this.label.x, labelTop - labelScale, labelScale, now, vis);
    // 벤치 상태를 고르면 기본 "…"은 띄우지 않는다
    const longSit = !speaking && !this.mood && this.sitSince > 0 && now - this.sitSince > SIT_IDLE_MS;
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

  /**
   * 오라를 그릴 몸 자리 (CosmeticFxSim FxInput.aura): base = 발밑 줄, top = 보이는 몸 꼭대기, dim = 밝기.
   * 수영·잠수는 수면에 고리를 띄우고 잠긴 만큼 몸 꼭대기를 내린다(잠수 중엔 은은하게), 해먹·눕기·욕조는 누운 몸 높이,
   * 매달리기·점프·놀이기구·타는 펫은 들어 올린 몸 아래(headY), 앉기는 낮아진 머리에 맞춘다
   */
  private auraFrame(st: StateName, y: number, headY: number, labelY: number, waterDrop: number, sitLift: number, armsUp: number): { base: number; top: number; dim: number; wide?: number } {
    if (st === "swim" || st === "dive") return { base: y - WATER_LINE, top: headY - this.artTop + waterDrop, dim: st === "dive" ? 0.45 : 1 };
    // 타는 펫에 올라탔으면 펫 발밑(땅, 점프하면 같이)을 발밑 줄로, 펫과 사람 전체를 감싸게 넓게 (옆모습은 펫이 길다)
    if (this.mountedIn(st)) {
      const side = this.dir === DIR.left || this.dir === DIR.right;
      return { base: y - this.hop, top: headY - this.artTop, dim: 1, wide: side ? 1.75 : 1.3 };
    }
    if (st === "hammock" || st === "lie" || st === "bath") {
      const top = labelY + 2;
      return { base: top + 12, top, dim: 1 };
    }
    return { base: headY, top: headY - this.artTop + sitLift - armsUp, dim: 1 };
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

  private syncCosmetics(now: number, dt: number, x: number, headY: number, vis: boolean, af: { base: number; top: number; dim: number; wide?: number }): void {
    const s = this.sprite;
    const st = this.state;
    const wet = st === "swim" || st === "dive";
    const depth = this.depthOverride ?? s.y;
    if (this.haloGlow) {
      const pulse = this.reduced ? 0.45 : 0.38 + 0.14 * Math.sin(now / 500);
      // 후광 고리는 그림 맨 위 (물에 들어가면 가라앉은 만큼 내려간다)
      const sink = wet ? waterSink(this.body, st) : 0;
      const sitDrop = st === "sitGround" ? 3 : st === "sitChair" ? 1 : 0;
      this.haloGlow.setPosition(x, headY - this.artTop + 1 + sink + sitDrop).setAlpha(pulse).setVisible(vis && st !== "dive" && st !== "hammock");
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
        // 이불 속·욕조 물속에서는 날개를 숨긴다 (꾸미기 연출과 같은 규칙)
        .setVisible(vis && !wet && st !== "hammock" && st !== "lie" && st !== "bath");
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
        .setAlpha(0.72 * this.fade)
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
        // 모든 자세에서: 발밑 줄(물이면 수면, 매달리면 몸 아래)에 깔린다
        .setPosition(x + Math.cos(a) * 6, af.base - 1 + Math.sin(a * 1.4) * 1.5)
        .setAlpha((0.18 + 0.06 * Math.sin(now / 700 + i)) * af.dim)
        .setDepth(depth + 0.03)
        .setVisible(vis);
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
    this.cfx?.setVisible(v);
    this.dyeFx?.setVisible(v);
    this.moodFx?.setVisible(v);
    this.staffFx?.setVisible(v);
    this.dexBadge?.setVisible(v);
    this.champBadge?.setVisible(v);
    this.nameFx?.setVisible(v);
    this.titleText?.setVisible(v);
    this.friendMark?.setVisible(v);
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
    this.dexBadge?.destroy();
    this.champBadge?.destroy();
    this.champBadge = null;
    this.nameFx?.destroy();
    this.nameFx = null;
    this.titleText?.destroy();
    this.titleText = null;
    this.friendMark?.destroy();
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
    this.cfx?.destroy();
    this.cfx = null;
    this.dyeFx?.destroy();
    this.dyeFx = null;
    this.moodFx?.destroy();
    this.moodFx = null;
    this.staffFx?.destroy();
    this.staffFx = null;
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

/** 운영자 차림의 몸 색: 염색했으면 그 색을 그대로, 아니면 저승사자 검은 망토 */
const staffColorOf = (spec: string): string => (isDyedSpec(spec) ? spec : STAFF_COLOR);
