import type * as Phaser from "phaser";
import { BBQ_THUD_SCALE, bbqActive, bbqItem, bbqSpeed, drunkLevel, drunkUntil, type BbqItemId, type Sid } from "@tomb/protocol";
import { addFood, applyFoodView, DIZZY_LEVEL, foodIdle, HICCUP_MS, myFood, setMyFood, swayFor, type FoodApplied, type FoodView } from "./foodState";

import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { bridge } from "../bridge";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import type { Sfx } from "../world/Sfx";

export { addFood, applyFoodView, foodOfPeer, myFood, swayFor, type FoodState } from "./foodState";

/** 쿵 먼지 알갱이 수 */
const THUD_DUST = 12;

// 11/15 캠핑장 바베큐장 먹거리·마실 거리 효과 (마을·캠핑장 장면이 하나씩 가진다 — 사냥터·야근 빌딩에는 없다).
//  - 커지기(grow): 몸이 커지고 메뉴 색 빛 (AvatarView.setBig)
//  - 커지기 3배(통삼겹 바비큐): 먹을 때 쿵 — 발밑 먼지가 퍼지고 가까이 있으면 화면이 살짝 울린다 (thud)
//  - 빨라지기(speed): 내 걸음 배율 (Player.boost, 마을·캠핑장만). 번개 닭꼬치는 걸을 때 잔상 (AvatarView.setTrail)
//  - 취기(drunk): 1 볼 홍조 · 2 걸을 때 휘청 · 3↑ 화면 어질어질(카메라 살짝 흔들림·가장자리 흐림)·가끔 딸꾹. 10분에 1씩 깬다
// 세 갈래는 따로 겹친다. 다른 사람 것은 서버가 확인한 소식(bbq)·접속자 정보(PeerInfo.bbq·spd·drunk)로 안다.
// 내 효과는 장면을 옮겨도(캠핑장 ↔ 마을)·새로고침해도 이어지게 이 브라우저에 기억한다 (끝나는 시각까지만).

/**
 * 내 캐릭터 효과 (Player가 마을·캠핑장에서 하나씩 가진다 — 집·상점·사냥터에는 없다).
 * 걸음 배율·휘청 폭을 Player에 넣고, 내 그림의 크기·홍조, 취기 3↑ 화면 어질어질·딸꾹을 맡는다
 */
export class MyFoodView {
  private cache: FoodApplied | null = null;
  private checkAt = 0;
  private hiccupAt = 0;
  private dizzy: Phaser.GameObjects.Image | null = null;
  private rot = 0;
  /** 카메라에 마지막으로 넣은 기울기 (라디안) */
  private camRot = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {}

  /** 매 프레임. 돌려주는 값: [걸음 배율, 휘청 폭] */
  update(view: FoodView & { say(text: string, now: number): void }, now: number): [number, number] {
    const t = Date.now();
    const me = myFood();
    const lv = drunkLevel(me.drunk, t);
    if (now >= this.checkAt) {
      this.checkAt = now + 400;
      this.cache = applyFoodView(view, me, t, this.cache);
      // 다 끝났으면 기억도 지운다
      if (foodIdle(me, t) && (me.grow || me.spd || me.drunk)) {
        setMyFood({});
      }
    }
    this.updateDizzy(lv, now);
    // 취기 3↑: 가끔 딸꾹
    if (lv < DIZZY_LEVEL) this.hiccupAt = 0;
    else if (this.hiccupAt === 0) this.hiccupAt = now + 3000;
    else if (now >= this.hiccupAt) {
      view.say("딸꾹!", now);
      this.hiccupAt = now + HICCUP_MS * (0.7 + Math.random() * 0.6);
    }
    return [bbqSpeed(me.spd, t), swayFor(lv)];
  }

  /**
   * 취기 3↑: 카메라가 아주 천천히 기울었다 돌아오고 가장자리가 어둑하게 흐려진다.
   * 움직임 줄이기면 끈다. 이 장면이 화면 맨 위가 아니면(사냥터·야근 빌딩·미니게임·집이 떠 있으면) 끈다
   */
  private updateDizzy(lv: number, now: number): void {
    const cam = this.scene.cameras.main;
    const sc = bridge.last("scene:changed")?.scene;
    const on = lv >= DIZZY_LEVEL && !this.reduced && (sc === undefined || sc === "world");
    const k = on ? Math.min(1, (lv - DIZZY_LEVEL + 1) / 3) : 0;
    const goal = on ? (0.006 + 0.008 * k) * Math.sin(now / 1100) : 0;
    this.rot += (goal - this.rot) * 0.12;
    if (Math.abs(this.rot) < 1e-4 && !on) this.rot = 0;
    if (this.camRot !== this.rot) {
      this.camRot = this.rot;
      cam.setRotation(this.rot);
    }
    if (on) {
      this.dizzy ??= this.scene.add.image(0, 0, TEX.vignette).setScrollFactor(0).setDepth(DEPTH.vignette + 1).setTint(0x2a1830);
      this.dizzy
        .setPosition(cam.width / 2, cam.height / 2)
        .setDisplaySize(cam.width / cam.zoom + 40, cam.height / cam.zoom + 40)
        .setAlpha((0.22 + 0.2 * k) * (0.85 + 0.15 * Math.sin(now / 700)))
        .setVisible(true);
    } else if (this.dizzy?.visible) this.dizzy.setVisible(false);
  }

  destroy(): void {
    if (this.camRot !== 0) this.scene.cameras?.main?.setRotation(0);
    this.dizzy?.destroy();
    this.dizzy = null;
  }
}

/** 캠핑장 장면: 서버 소식(bbq)을 내 효과·다른 사람 아바타로 나눠 주고 먹는·마시는 연출을 한다 */
export class FoodFx {
  constructor(private readonly h: { scene: Phaser.Scene; reduced: boolean; sfx: Sfx; player: () => Player; remotes: () => ReadonlyMap<Sid, RemoteAvatar> }) {}

  /** 지금 내 취기 단계 */
  myDrunk(now = Date.now()): number {
    return drunkLevel(myFood().drunk, now);
  }

  /** 서버가 확인한 한 접시·한 잔 (내 것도 온다). anim이면 먹는·마시는 연출 */
  onBbq(sid: Sid, isMe: boolean, item: BbqItemId, until: number, lv?: number, at?: number, anim = true): void {
    if (isMe) {
      setMyFood(addFood(myFood(), item, until, lv, at));
      return;
    }
    const r = this.h.remotes().get(sid);
    if (!r) return;
    r.applyFood(addFood(r.food, item, until, lv, at));
    if (anim && r.visible) this.playEat(r.view, r.x, r.y, item, performance.now());
  }

  /** 내가 방금 샀다: 바로 먹는 연출과 효과 (서버 확인은 뒤따라 온다) */
  eat(item: BbqItemId, until: number, lv?: number, at?: number): void {
    setMyFood(addFood(myFood(), item, until, lv, at));
    const pl = this.h.player();
    this.playEat(pl.view, pl.x, pl.y, item, this.h.scene.time.now);
  }

  /** 접시·잔이 머리 위로 떠올랐다 사라지고 말풍선 ("한 입!" · "캬~") */
  private playEat(view: { say(text: string, now: number): void; readonly bigScale: number }, x: number, y: number, item: BbqItemId, now: number): void {
    const m = bbqItem(item);
    if (!m) return;
    view.say(m.bite, now);
    this.h.sfx.play("say", 0.4);
    const key = `camp-bbqPlate-${item}`;
    const s = this.h.scene;
    if (!s.textures.exists(key)) return;
    // 커진(커질) 몸이면 그만큼 머리 위에서 띄운다
    const lift = 18 * (Math.max(view.bigScale, m.kind === "grow" ? m.scale : 1) - 1);
    const plate = s.add.image(x, y - 26 - lift, key).setOrigin(0.5, 1).setDepth(y + 40);
    s.tweens.add({ targets: plate, y: y - 40 - lift, alpha: 0, duration: this.h.reduced ? 600 : 1600, ease: "Sine.easeIn", onComplete: () => plate.destroy() });
    if (m.kind === "grow" && m.scale >= BBQ_THUD_SCALE) s.time.delayedCall(240, () => this.thud(x, y));
  }

  /** 쿵: 몸이 확 커지며 땅이 울린다 — 발밑 먼지 고리, 가까이(내 화면 안쪽)면 카메라가 짧게 흔들린다 (움직임 줄이기면 먼지만 조금) */
  private thud(x: number, y: number): void {
    const s = this.h.scene;
    if (!s.sys.isActive()) return;
    const pl = this.h.player();
    const near = Math.hypot(pl.x - x, pl.y - y) < 160;
    if (near) this.h.sfx.play("burst", 0.3, 0.5);
    if (!this.h.reduced && near) s.cameras.main.shake(220, 0.006);
    const n = this.h.reduced ? 4 : THUD_DUST;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const d = s.add
        .image(x, y - 1, TEX.dust)
        .setDepth(y + 0.5)
        .setTint(0xf2e8d4)
        .setScale(2.4)
        .setAlpha(0.95);
      s.tweens.add({
        targets: d,
        x: x + Math.cos(a) * (24 + Math.random() * 8),
        y: y - 1 + Math.sin(a) * (9 + Math.random() * 3) - 3,
        scale: 4.2,
        alpha: 0,
        duration: this.h.reduced ? 500 : 700 + Math.random() * 200,
        ease: "Quad.easeOut",
        onComplete: () => d.destroy(),
      });
    }
  }

  /** 지금 내 효과 남은 시간 요약 (QA) */
  static summary(now = Date.now()): { growLeft: number; speedLeft: number; drunk: number; soberAt: number | null } {
    const f = myFood();
    return {
      growLeft: bbqActive(f.grow, now) ? f.grow.u - now : 0,
      speedLeft: bbqActive(f.spd, now) ? f.spd.u - now : 0,
      drunk: drunkLevel(f.drunk, now),
      soberAt: f.drunk ? drunkUntil(f.drunk) : null,
    };
  }
}
