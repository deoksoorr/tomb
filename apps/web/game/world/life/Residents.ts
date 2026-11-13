import type * as Phaser from "phaser";
import { SEATS, WALK_SPEED, type Seat, type Sid } from "@tomb/protocol";
import { activeResidentCount, normalizeResidentSettings, RESIDENTS_DEFAULT, type ResidentSettings } from "@/lib/residents";
import { AvatarView } from "../../entities/AvatarView";
import type { Player } from "../../entities/Player";
import { SAY_MS } from "../../entities/SpeechBubble";
import { faceToward } from "../../logic/movement";
import type { GlyphAtlas } from "../../text/GlyphAtlas";
import { pickLine, RESIDENTS, type LineContext } from "./residentData";
import { blankResidentPose, restActOf, ResidentSim, seatMoodOf, type RestAct, type ResidentPose } from "./residentSim";

// 돌아다니는 마을 주민 그리기·말 걸기. VillageLife가 들고 있다 (WorldScene은 따로 부르지 않는다).
// - 위치: residentSim (채널 시드 + 서버 시계) → 같은 채널 모두가 같은 자리. 네트워크·서버 비용 0.
// - 모습: 사람 아바타 그림(AvatarView)을 그대로 쓰고, 이름표만 연한 초록으로 구분한다. 처음 화면에 들어올 때 만든다.
// - 말 걸기(E·모바일 상호작용): 머리 위 말풍선은 내 화면에만. 말하는 동안 멈춰 나를 보고, 끝나면 공유 자리로 슬며시 돌아간다.
// - 관리자 설정(켜기/끄기·주민 수)은 /api/residents를 1~2분마다 확인하고, 바뀌면 흐려지며 나타나거나 사라진다.

/** 주민 이름표 색 (사람 이름표보다 연한 초록) */
export const RESIDENT_LABEL = 0xa8e6a0;
const TALK_RADIUS = 18;
/** 벤치에 앉은 주민은 더 가까이 가야 (옆자리에 앉으려는 E와 겹치지 않게) */
const TALK_RADIUS_SEATED = 11;
const CULL = 40;
const FADE_MS = 900;
/** 설정 확인 간격 */
const POLL_MS = 90_000;

type ResidentView = {
  sim: ResidentSim;
  pose: ResidentPose;
  view: AvatarView | null;
  alpha: number;
  /** 말하는 중 (내 화면 시계) — 이때는 멈춰 서서 나를 본다 */
  talkUntil: number;
  holdX: number;
  holdY: number;
  holdState: ResidentPose["state"];
  holdDir: ResidentPose["dir"];
  /** 말이 끝난 뒤 공유 자리로 돌아가는 화면 오프셋 */
  ox: number;
  oy: number;
  lastLine: string | null;
  /** 쉼 몸짓 (구간마다 한 번) */
  actLeg: number;
  act: RestAct;
  prevRest: number;
  mood: string | null;
  /** 화면에 그린 자리 */
  x: number;
  y: number;
  visible: boolean;
};

export class Residents {
  private list: ResidentView[] = [];
  private seed = -1;
  private settings: ResidentSettings | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private talkAt = -Infinity;
  private destroyed = false;
  private readonly seatById = new Map<string, Seat>(SEATS.map((s) => [s.id, s]));

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly reduced: boolean,
  ) {
    this.poll();
    if (typeof window !== "undefined") this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  /** 관리자 설정 확인 (화면이 보일 때만). 처음 받기 전·실패하면 기본값(켜기·12명) */
  private poll(): void {
    if (this.destroyed || typeof fetch !== "function") return;
    if (this.settings && typeof document !== "undefined" && document.visibilityState !== "visible") return;
    fetch("/api/residents", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: unknown) => this.setSettings(normalizeResidentSettings(j)))
      .catch(() => {
        if (!this.settings) this.setSettings({ ...RESIDENTS_DEFAULT });
      });
  }

  /** 설정 반영 (테스트·QA에서도 부른다) */
  setSettings(s: ResidentSettings): void {
    this.settings = s;
  }

  setSeed(seed: number): void {
    if (seed === this.seed) return;
    this.seed = seed;
    for (const r of this.list) r.view?.destroy();
    this.list = RESIDENTS.map((def, i) => ({
      sim: new ResidentSim(def, i, seed),
      pose: blankResidentPose(),
      view: null,
      alpha: 0,
      talkUntil: 0,
      holdX: 0,
      holdY: 0,
      holdState: "idle",
      holdDir: 0,
      ox: 0,
      oy: 0,
      lastLine: null,
      actLeg: -1,
      act: null,
      prevRest: 0,
      mood: null,
      x: 0,
      y: 0,
      visible: false,
    }));
  }

  update(t: number, dt: number, view: Phaser.Geom.Rectangle, labelScale: number, pl: Player, seats: ReadonlyMap<string, Sid>): void {
    if (this.destroyed) return;
    const now = this.scene.time.now;
    const pnow = performance.now();
    const n = this.settings ? Math.min(RESIDENTS.length, activeResidentCount(this.settings)) : 0;
    const k = Math.min(1, (dt / 1000) * 2.5);
    // 사람이 앉은 자리: 서버 좌석표 + (오프라인이어도) 내 캐릭터가 앉은 자리
    const taken = (id: string): boolean => {
      if (seats.has(id)) return true;
      if (!pl.sitting) return false;
      const s = this.seatById.get(id);
      return !!s && Math.abs(s.x - pl.x) < 4 && Math.abs(s.y - pl.y) < 4;
    };
    for (let i = 0; i < this.list.length; i++) {
      const r = this.list[i];
      const target = i < n ? 1 : 0;
      if (r.alpha !== target) r.alpha = this.reduced ? target : target > r.alpha ? Math.min(1, r.alpha + dt / FADE_MS) : Math.max(0, r.alpha - dt / FADE_MS);
      if (r.alpha <= 0) {
        if (r.visible) r.view?.setVisible(false);
        r.visible = false;
        continue;
      }
      const p = r.sim.at(t, taken, r.pose);
      let x = p.x;
      let y = p.y;
      let state = p.state;
      let dir = p.dir;
      const talking = pnow < r.talkUntil;
      if (talking) {
        x = r.holdX;
        y = r.holdY;
        state = r.holdState;
        dir = r.holdDir;
        // 끝나면 이 자리에서 공유 자리로 돌아가게 오프셋을 잡아 둔다 (아래에서 줄여 간다)
        r.ox = r.holdX - p.x;
        r.oy = r.holdY - p.y;
      } else {
        // 말이 끝나면 멈췄던 자리에서 공유 자리로 슬며시
        r.ox += -r.ox * k;
        r.oy += -r.oy * k;
        if (Math.abs(r.ox) < 0.3 && Math.abs(r.oy) < 0.3) r.ox = r.oy = 0;
        x += r.ox;
        y += r.oy;
        if (state !== "walk" && state !== "run" && state !== "swim" && (r.ox || r.oy)) state = "walk";
      }
      r.x = x;
      r.y = y;
      const inView = x > view.x - CULL && x < view.right + CULL && y > view.y - CULL && y < view.bottom + CULL * 1.5;
      r.visible = inView;
      if (!inView) {
        r.view?.setVisible(false);
        continue;
      }
      const v = (r.view ??= this.makeView(r, x, y));
      v.fade = r.alpha;
      v.depthOverride = state === "sitChair" ? y + 1 : null;
      v.apply(state, dir, now);
      v.place(x, y);
      v.setVisible(true);
      this.restLife(r, v, p, state, talking, now);
      v.sync(now, labelScale);
    }
  }

  private makeView(r: ResidentView, x: number, y: number): AvatarView {
    const def = r.sim.def;
    const v = new AvatarView(this.scene, this.atlas, x, y, def.color, def.name, false, def.look, def.body);
    v.label.setTint(RESIDENT_LABEL);
    // 사람보다 천천히 걷는 만큼 발도 천천히
    v.sprite.anims.timeScale = Math.max(0.5, Math.min(1, def.speed / WALK_SPEED + 0.15));
    return v;
  }

  /** 쉬는 동안의 몸짓(손 흔들기·이모티콘)과 벤치 상태 아이콘 */
  private restLife(r: ResidentView, v: AvatarView, p: ResidentPose, state: ResidentPose["state"], talking: boolean, now: number): void {
    const mood = state === "sitChair" && !talking ? seatMoodOf(r.sim.def, r.sim.seed, r.sim.index, p.leg) : null;
    if (mood !== r.mood) {
      r.mood = mood;
      v.setMood(mood);
    }
    if (r.actLeg !== p.leg) {
      r.actLeg = p.leg;
      r.act = restActOf(r.sim.seed, r.sim.index, p.leg);
      r.prevRest = p.restMs;
      return;
    }
    const a = r.act;
    if (a && !this.reduced && !talking && (state === "idle" || state === "sitGround" || state === "sitChair") && r.prevRest < a.atMs && p.restMs >= a.atMs) {
      if (a.icon === "wave") v.playAct("wave", now);
      else v.emote(a.icon, now);
    }
    r.prevRest = p.restMs;
  }

  /** 바로 옆 주민 (말 걸 수 있는) */
  private nearest(px: number, py: number): ResidentView | null {
    let best: ResidentView | null = null;
    let bd = TALK_RADIUS;
    for (const r of this.list) {
      if (!r.visible || r.alpha < 0.6) continue;
      const d = Math.hypot(r.x - px, r.y - py);
      if (r.pose.state === "sitChair" && d > TALK_RADIUS_SEATED) continue;
      if (d <= bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  /** E·모바일 상호작용: 가까운 주민에게 말 걸기. 했으면 true */
  talk(pl: Player, ctx: LineContext): boolean {
    const r = this.nearest(pl.x, pl.y);
    if (!r || !r.view) return false;
    const pnow = performance.now();
    if (pnow - this.talkAt < 700) return true;
    this.talkAt = pnow;
    const now = this.scene.time.now;
    // 멈춰 서서 나를 본다 (벤치에 앉아 있었으면 앉은 채로, 헤엄치던 중이면 물에 뜬 채로)
    const sitting = r.pose.state === "sitChair" || r.pose.state === "sitGround";
    if (pnow >= r.talkUntil) {
      r.holdX = r.x;
      r.holdY = r.y;
      r.holdState = sitting || r.pose.state === "swim" ? r.pose.state : "idle";
      r.holdDir = sitting && r.pose.state === "sitChair" ? r.pose.dir : faceToward(r.x, r.y, pl.x, pl.y, r.pose.dir);
    }
    r.talkUntil = pnow + SAY_MS + 600;
    const line = pickLine(r.sim.def, ctx, Math.random, r.lastLine);
    r.lastLine = line;
    r.view.say(line, now);
    pl.faceTo(r.x, r.y, now);
    return true;
  }

  /** 발밑 안내 ("E 사육사 말 걸기") */
  hint(prefix: string, px: number, py: number): { text: string; dist: number } | null {
    const r = this.nearest(px, py);
    if (!r) return null;
    return {
      text: `${prefix}${r.sim.def.name} 말 걸기`,
      dist: Math.hypot(r.x - px, r.y - py),
    };
  }

  /** 지금 (보기에만) 앉아 있는 주민의 좌석 id를 out에 채운다 (고양이가 그 자리는 비킨다) */
  seated(out: Set<string>): Set<string> {
    out.clear();
    for (const r of this.list) if (r.alpha > 0.5 && r.pose.seat) out.add(r.pose.seat.id);
    return out;
  }

  /** 미니맵용: 보이는(나와 있는) 주민 자리 [x, y, x, y, …] */
  dots(out: number[] = []): number[] {
    out.length = 0;
    for (const r of this.list) if (r.alpha > 0.5) out.push(Math.round(r.pose.x), Math.round(r.pose.y));
    return out;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    for (const r of this.list) r.view?.destroy();
    this.list = [];
  }
}
