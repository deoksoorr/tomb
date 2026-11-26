import type * as Phaser from "phaser";
import { CAMP_SLIDE, CAMP_SLIDE_SEAT, CAMP_TRAMP_AREA, CAMP_TRAMP_GATE, CAMP_TRAMP_IN, CAMP_TRAMP_SEATS, campTrampPhase, campTrampSeatId, clampToArea, DIR, STATE, type DirId, type Sid, type StateName } from "@tomb/protocol";
import type { Player, SeatRequester } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import type { MoveInput } from "../logic/movement";
import { RideSound } from "../world/RideSound";
import { TRAMPOLINE_MAT, TRAMPOLINE_PERIOD_MS, trampolineHeight } from "../world/rides";
import { nearTrampGate, slideRidePose, SLIDE_DEPTH, SLIDE_RIDE_MS, TRAMP_RUN, TRAMP_WALK } from "./campPlayPath";
import { valleyTex } from "./campValleyTex";

// 11/26 캠핑장 놀이터 (펜션 정원 옆): 대형 트램펄린 8인 · 워터 슬라이드(겨울·크리스마스판엔 눈썰매 언덕).
// 마을 50번 광장 트램펄린(world/PlazaRides)과 같은 규칙을 캠핑장 자리로 옮겼어요:
//  - 트램펄린 (11/26 운영자 「입구로만 타고, 위에서 돌아다니며 계속 튄다」): 앞 가운데 사다리(입구)에서 E → 빈 자리(qJ1~8, 나룻배처럼 움직이는 자리)를
//    받아 매트 위로. 탄 동안은 방향키로 매트 안을 걷고 뛰며 서버 시계 박자로 계속 튄다 (자리마다 박자가 조금씩 어긋나 물결처럼).
//    다른 사람과 부딪히면 서로 튕겨 나고, 내리기는 사다리 앞에서만 (아래로 걸어 나가거나 E). 다른 사람에게는 위치(MOVE) + 튀기(자리 박자)로 같게 보인다
//  - 워터 슬라이드: 한 자리(qZ — 나룻배처럼 타는 동안 움직이는 자리). 사다리 밑에서 E → 사다리를 오르고, 꼭대기에서 구불구불 미끄러져
//    풀에 풍덩 → 풀가에 내려서요. 다른 사람에게는 그 사람 위치(MOVE)를 따라 같은 모습으로 보여요 (미끄럼틀 그림 위에 그린다)

export type CampPlayHost = {
  scene: Phaser.Scene;
  reduced: boolean;
  player(): Player;
  remotes(): ReadonlyMap<Sid, RemoteAvatar>;
  seats(): ReadonlyMap<string, Sid>;
  mySid(): Sid | null;
  online(): boolean;
  sit(seatId: string): void;
  seatReq(): SeatRequester;
  /** 서버 시계 (ms) — 트램펄린 박자를 모두에게 같게 */
  clock(): number;
  toast(message: string): void;
  splash(x: number, y: number): void;
  splashSound(gain: number): void;
  /** 겨울·크리스마스판 (눈썰매) */
  snowy(): boolean;
  /** 타기 전에 (펫에서 내리기·커졌으면 막기). false면 타지 않아요 */
  beforeRide(): boolean;
};

/** 트램펄린 위에서 다른 사람과 이만큼 가까우면 튕겨 난다 */
const TRAMP_BUMP = 11;
const SLIDE_ID = CAMP_SLIDE_SEAT.id;
/** 썰매 그림 바닥을 탄 사람 발밑에서 이만큼 아래로 (앞코가 무릎 앞으로 나오게) */
const SLED_DY = 7;

const isTramp = (id: string | null | undefined): id is string => !!id && /^qJ\d$/.test(id);

export class CampPlay {
  private readonly sound = new RideSound();
  /** 내가 탄 미끄럼 (시작 시각 — scene time) */
  private slide: { t0: number; snowy: boolean; splashed: boolean; fxAt: number } | null = null;
  /** 지난 프레임에 놀이 연출을 넣은 원격 (내린 사람은 비운다) */
  private styled = new Set<RemoteAvatar>();
  private mineStyled = false;
  private lowPrev = false;
  /** 내가 탄 트램펄린 (자리 id · 매트 위 위치) */
  private tramp: { id: string; x: number; y: number; dir: DirId } | null = null;
  private bumpAt = 0;
  private gateToastAt = 0;
  /** 11/26 눈썰매 탄 사람(나·원격) 밑에 까는 썰매 그림 */
  private sleds = new Map<object, Phaser.GameObjects.Image>();

  constructor(private readonly host: CampPlayHost) {}

  /** 트램펄린 위에서 뛰는 중 / 미끄럼 타는 중 */
  get busy(): boolean {
    return this.slide !== null || this.tramp !== null;
  }

  // ── E ──

  /** 타고 있을 때의 E·X: 트램펄린이면 사다리 앞에서만 내린다(아니면 안내), 미끄럼 중이면 무시. 한 일이 있으면 true */
  interact(): boolean {
    if (this.slide) return true;
    const t = this.tramp;
    if (!t) return false;
    if (nearTrampGate(t.x, t.y)) this.leaveTramp(null);
    else {
      const now = this.host.scene.time.now;
      if (now - this.gateToastAt > 2000) {
        this.gateToastAt = now;
        this.host.toast("사다리(입구) 앞에서 내려요");
      }
    }
    return true;
  }

  /** 맵 상호작용 (트램펄린 매트 가장자리 · 미끄럼 사다리 밑) */
  use(o: { kind: string }): boolean {
    if (o.kind === "tramp") this.boardTramp();
    else if (o.kind === "slide") this.startSlide();
    else return false;
    return true;
  }

  /** 안내 ("E 트램펄린 뛰기" — 다 찼으면 그 안내) */
  hint(prefix: string, kind: string | null): { x: number; y: number; text: string } | null {
    if (kind === "slide") {
      const busy = this.taken(SLIDE_ID);
      return { x: CAMP_SLIDE_SEAT.x, y: CAMP_SLIDE_SEAT.y + 2, text: busy ? "누가 타고 있어요" : `${prefix}${this.host.snowy() ? "눈썰매 타기" : "워터 슬라이드 타기"}` };
    }
    if (kind === "tramp") return { x: CAMP_TRAMP_GATE.x, y: CAMP_TRAMP_GATE.y + 2, text: this.pickTramp() ? `${prefix}트램펄린 뛰기` : "트램펄린이 꽉 찼어요" };
    return null;
  }

  /** 탄 동안의 안내 (사다리 앞이면 내리기) */
  rideHint(prefix: string): { x: number; y: number; text: string } | null {
    const t = this.tramp;
    if (!t || !nearTrampGate(t.x, t.y)) return null;
    return { x: CAMP_TRAMP_GATE.x, y: CAMP_TRAMP_GATE.y + 2, text: `${prefix}트램펄린에서 내리기` };
  }

  private taken(id: string): boolean {
    const h = this.host;
    if (!h.online()) return false;
    const o = h.seats().get(id);
    return o !== undefined && o !== h.mySid();
  }

  /** 빈 트램펄린 자리 id (여덟 명까지) */
  private pickTramp(): string | null {
    for (let i = 0; i < CAMP_TRAMP_SEATS; i++) {
      const id = campTrampSeatId(i);
      if (!this.taken(id)) return id;
    }
    return null;
  }

  /** 사다리(입구)에서 올라탄다 — 매트 안 첫 자리로 폴짝 */
  private boardTramp(): void {
    const h = this.host;
    const pl = h.player();
    if (this.tramp || pl.anchored || pl.airborne || pl.inBoat || pl.inWater || pl.sitting) return;
    const id = this.pickTramp();
    if (!id) {
      h.toast("트램펄린이 꽉 찼어요. 잠깐 뒤에 다시 와요");
      return;
    }
    if (!h.beforeRide()) return;
    const now = h.scene.time.now;
    const p = CAMP_TRAMP_IN;
    pl.board(id, p.x, p.y, DIR.up, now, h.seatReq());
    pl.state = "trampoline";
    pl.view.apply(pl.state, DIR.up, now);
    this.tramp = { id, x: p.x, y: p.y, dir: DIR.up };
    if (h.online()) h.sit(id);
    this.sound.play("boing", 0.45, 1.1);
  }

  /** 사다리 앞으로 내려선다 (abort면 안내) */
  private leaveTramp(abort: string | null): void {
    const t = this.tramp;
    if (!t) return;
    this.tramp = null;
    const h = this.host;
    const pl = h.player();
    pl.view.ride = null;
    this.mineStyled = false;
    pl.dir = DIR.down;
    pl.leaveBoat(CAMP_TRAMP_GATE.x, CAMP_TRAMP_GATE.y + 2, h.scene.time.now);
    if (h.online()) h.seatReq().stand();
    this.sound.play("boing", 0.4, 1.15 + Math.random() * 0.1);
    if (abort) h.toast(abort);
  }

  private startSlide(): void {
    const h = this.host;
    const pl = h.player();
    if (this.slide || pl.anchored || pl.airborne || pl.inBoat || pl.inWater) return;
    if (this.taken(SLIDE_ID)) {
      h.toast("누가 타고 있어요. 잠깐만 기다려요");
      return;
    }
    if (!h.beforeRide()) return;
    const now = h.scene.time.now;
    pl.board(SLIDE_ID, CAMP_SLIDE_SEAT.x, CAMP_SLIDE_SEAT.y, DIR.up, now, h.seatReq());
    this.slide = { t0: now, snowy: h.snowy(), splashed: false, fxAt: 0 };
    if (h.online()) h.sit(SLIDE_ID);
  }

  /** 미끄럼을 끝낸다 (풀가·언덕 밑에 내려선다). abort면 사다리 밑으로 */
  private endSlide(abort: string | null): void {
    const s = this.slide;
    if (!s) return;
    this.slide = null;
    const h = this.host;
    const pl = h.player();
    const to = abort ? { x: CAMP_SLIDE_SEAT.x, y: CAMP_SLIDE_SEAT.y + 2 } : slideRidePose(SLIDE_RIDE_MS, s.snowy).out;
    pl.view.ride = null;
    this.mineStyled = false;
    pl.dir = DIR.down;
    pl.leaveBoat(to.x, to.y, h.scene.time.now);
    if (h.online()) h.seatReq().stand();
    if (abort) h.toast(abort);
  }

  // ── 서버 좌석 소식 ──

  onSeat(seatId: string, sid: Sid | null): void {
    const h = this.host;
    if (sid === null || sid === h.mySid()) return;
    if (seatId === SLIDE_ID && this.slide) this.endSlide("누가 먼저 탔어요");
    else if (isTramp(seatId) && this.tramp?.id === seatId) this.leaveTramp("트램펄린이 꽉 찼어요");
  }

  onSeatDenied(seatId: string): boolean {
    if (seatId === SLIDE_ID && this.slide) {
      this.endSlide("지금은 탈 수 없어요. 다시 눌러 주세요");
      return true;
    }
    if (isTramp(seatId) && this.tramp?.id === seatId) {
      this.leaveTramp("지금은 탈 수 없어요. 다시 눌러 주세요");
      return true;
    }
    return false;
  }

  // ── 매 프레임 (아바타 그리기 전에) ──

  update(move: MoveInput, dtMs: number): void {
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    const wall = h.clock();
    // 순간이동 등으로 배 자리(움직이는 자리)에서 풀렸으면 트램펄린도 끝
    if (this.tramp && !pl.inBoat) {
      this.tramp = null;
      pl.view.ride = null;
      this.mineStyled = false;
    }
    // 내 미끄럼
    // 순간이동(친구한테 가기 등)으로 배 자리에서 풀렸으면 미끄럼도 끝
    if (this.slide && !pl.inBoat) {
      this.slide = null;
      pl.view.ride = null;
      this.mineStyled = false;
    }
    const s = this.slide;
    const sledUnder: { x: number; y: number; who: object }[] = [];
    if (s) {
      const t = now - s.t0;
      if (t >= SLIDE_RIDE_MS) this.endSlide(null);
      else {
        const p = slideRidePose(t, s.snowy);
        pl.boatTo(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.dir, now);
        pl.view.ride = { ox: 0, lift: 0, depth: SLIDE_DEPTH, alt: p.alt };
        this.mineStyled = true;
        if (s.snowy && p.alt === null) sledUnder.push({ x: pl.x, y: pl.y, who: pl });
        if (p.inPool && !s.splashed) {
          s.splashed = true;
          s.fxAt = now + 220;
          h.splash(p.x, p.y);
          h.splashSound(0.7);
        } else if (p.inPool && now >= s.fxAt && !h.reduced) {
          s.fxAt = now + 260;
          h.splash(p.x, p.y);
        }
      }
    } else if (this.tramp) {
      this.stepTramp(this.tramp, move, dtMs, now, wall);
    } else if (this.mineStyled) {
      this.mineStyled = false;
      if (pl.state !== "boat") pl.view.ride = null;
    }
    // 원격: 트램펄린 자리(qJ)·미끄럼(qZ)에 있는 사람
    const styled = new Set<RemoteAvatar>();
    for (const r of h.remotes().values()) {
      const id = r.seatId;
      if (isTramp(id) && r.stateId === STATE.trampoline) {
        r.view.ride = { ox: 0, lift: TRAMPOLINE_MAT + trampolineHeight(wall + campTrampPhase(id)), depth: r.y + 1 };
        styled.add(r);
      } else if (id === SLIDE_ID) {
        const alt = remoteSlideAlt(r.x, r.y, h.snowy(), now);
        r.view.ride = { ox: 0, lift: 0, depth: SLIDE_DEPTH, alt };
        styled.add(r);
        if (alt === null && h.snowy()) sledUnder.push({ x: r.x, y: r.y, who: r });
      }
    }
    for (const r of this.styled) if (!styled.has(r)) r.view.ride = null;
    this.styled = styled;
    this.placeSleds(sledUnder);
  }

  /** 눈썰매: 미끄러지는(앉은) 동안 탄 사람 밑에 빨간 썰매 (언덕 그림 위, 사람 아래). 다른 사람에게도 같은 규칙으로 보인다 */
  private placeSleds(list: readonly { x: number; y: number; who: object }[]): void {
    const keep = new Set<object>();
    for (const q of list) {
      keep.add(q.who);
      let img = this.sleds.get(q.who);
      if (!img) {
        img = this.host.scene.add.image(0, 0, valleyTex(this.host.scene, "sledRide", "default")).setOrigin(0.5, 1);
        this.sleds.set(q.who, img);
      }
      img.setPosition(Math.round(q.x), Math.round(q.y) + SLED_DY).setDepth(SLIDE_DEPTH - 0.3);
    }
    for (const [who, img] of this.sleds)
      if (!keep.has(who)) {
        img.destroy();
        this.sleds.delete(who);
      }
  }

  /** 내 트램펄린 한 프레임: 매트 안 걷기·뛰기 (밖으로는 못 나간다) + 부딪히면 튕김 + 서버 시계 박자로 튀기. 사다리 앞에서 아래로 가면 내린다 */
  private stepTramp(t: { id: string; x: number; y: number; dir: DirId }, move: MoveInput, dtMs: number, now: number, wall: number): void {
    const h = this.host;
    const pl = h.player();
    const m = Math.hypot(move.ax, move.ay);
    if (m > 0.2) {
      if (move.ay > 0.5 && nearTrampGate(t.x, t.y)) {
        this.leaveTramp(null);
        return;
      }
      const sp = ((move.run ? TRAMP_RUN : TRAMP_WALK) * dtMs) / 1000;
      t.x += (move.ax / Math.max(1, m)) * sp;
      t.y += (move.ay / Math.max(1, m)) * sp;
      t.dir = Math.abs(move.ax) > Math.abs(move.ay) ? (move.ax < 0 ? DIR.left : DIR.right) : move.ay < 0 ? DIR.up : DIR.down;
    }
    // 다른 사람과 부딪히면 서로 튕겨 난다 (각자 자기 화면에서 밀려나 — 둘 다 같은 만큼)
    for (const r of h.remotes().values()) {
      if (!isTramp(r.seatId) || r.stateId !== STATE.trampoline) continue;
      const dx = t.x - r.x;
      const dy = (t.y - r.y) * 1.4;
      const d = Math.hypot(dx, dy);
      if (d >= TRAMP_BUMP) continue;
      const k = (TRAMP_BUMP - d + 2) / Math.max(0.5, d);
      t.x += d > 0.1 ? dx * k * 0.5 : 3;
      t.y += d > 0.1 ? (dy / 1.4) * k * 0.5 : 0;
      if (now - this.bumpAt > 500) {
        this.bumpAt = now;
        this.sound.play("boing", 0.35, 1.3 + Math.random() * 0.1);
      }
    }
    const c = clampToArea(CAMP_TRAMP_AREA, t.x, t.y);
    t.x = c.x;
    t.y = c.y;
    pl.boatTo(Math.round(t.x * 10) / 10, Math.round(t.y * 10) / 10, t.dir, now);
    const ph = wall + campTrampPhase(t.id);
    pl.view.ride = { ox: 0, lift: TRAMPOLINE_MAT + trampolineHeight(ph), depth: t.y + 1 };
    this.mineStyled = true;
    const low = trampolineHeight(ph) < 1 && ((ph % TRAMPOLINE_PERIOD_MS) + TRAMPOLINE_PERIOD_MS) % TRAMPOLINE_PERIOD_MS < TRAMPOLINE_PERIOD_MS * 0.2;
    if (low && !this.lowPrev) this.sound.play("boing", 0.5, 0.92 + Math.random() * 0.16);
    this.lowPrev = low;
  }

  /** 장면을 떠날 때 (버스·친구한테 가기): 미끄럼 중이면 바로 내린다 */
  stop(): void {
    if (this.slide) this.endSlide(null);
    if (this.tramp) this.leaveTramp(null);
  }

  destroy(): void {
    this.placeSleds([]);
    this.slide = null;
    this.tramp = null;
    for (const r of this.styled) r.view.ride = null;
    this.styled.clear();
    this.sound.destroy();
  }
}

/** 원격 미끄럼 자세: 사다리(오른쪽 기둥) 위면 오르는 걸음, 풀 안이면 헤엄, 그 밖은 앉은 자세 */
function remoteSlideAlt(x: number, y: number, snowy: boolean, now: number): StateName | null {
  if (x >= CAMP_SLIDE_SEAT.x - 5 && y > CAMP_SLIDE.y - 38) return Math.floor(now / 180) % 2 ? "walk" : "idle";
  const P = CAMP_SLIDE.pool;
  if (!snowy && ((x - P.x) / P.rx) ** 2 + ((y - P.y) / P.ry) ** 2 <= 1) return "swim";
  return null;
}
