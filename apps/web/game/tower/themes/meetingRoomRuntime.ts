import * as Phaser from "phaser";
import { MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { towerPlan } from "@/lib/rpg/tower";
import { mtLoopInfo } from "@/lib/rpg/towerThemes/meetingRoom";
import { monsterFrameSize, monsterSheet } from "../../rpg/monsterArt";
import { RTEX } from "../../rpg/sprites";
import { MT_ARENAS, type MeetingArena } from "./meetingRoomArena";
import { inkShadowCanvas, outlineOnly, penShotCanvas, slideShotCanvas } from "./meetingRoomArt";
import type { ThemeFactory, ThemeHost, ThemeMon, TowerThemeRuntime } from "./runtime";

// 11/15 끝없는 회의실 몬스터 행동 (야근 빌딩 테마 실행부 — runtime.ts 연결점):
//  참조 메일(갈라짐은 catalog split) · 화이트보드 마커(지나간 자리에 몇 초 벽) · 의견 없음(움직일 때만 외곽선) · 발표 자료(레이저 포인터 조준 → 한 장)
//  시계 보는 사람(가까우면 공격 느려짐) · 단톡방 알림(좌우로 흔들며 파고듦) · 빔프로젝터(뜨거운 화면이 따라옴) · 의자 인턴(직선 돌진·벽 튕김)
//  커피 쏟는 사람(느려지는 웅덩이) · 마이크 하울링(소리 고리가 밀어냄) · 정예 안건 추가(살아 있는 동안 몬스터가 들어옴)
//  중간 우두머리 회의록 담당(내 지난 움직임을 되밟는 그림자) · 우두머리 회의 주재자(단계마다 "한 가지만 더" → 방이 좁아짐, 끝에 의자를 돌리며 사방 사격)
//  바퀴마다 붙는 특성: 카페인 각성(가끔 확 빨라짐) · 회의록 공유(쓰러지면 옆 몬스터 회복)

const WATCH_R = 54;
const WATCH_SLOW = 1.6;
const PROJ_W = 44;
const PROJ_H = 28;
const HOWL_R = 92;
const MARKER_WALL_MS = 3200;
const MINUTES_DELAY_MS = 1800;

type St = {
  px: number;
  py: number;
  /** 다음 행동 시각 · 단계 (몬스터마다 뜻이 다르다) */
  at: number;
  mode: number;
  until: number;
  vx: number;
  vy: number;
  hitAt: number;
  ang: number;
  wall?: { x: number; y: number };
  proj?: { x: number; y: number; born: number };
  phase: number;
  boost: number;
  bounces: number;
};

const tex = (scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string => {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  return key;
};

export class MeetingRuntime implements TowerThemeRuntime {
  private st = new WeakMap<ThemeMon, St>();
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly gAdd: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Image;
  private path: { t: number; x: number; y: number }[] = [];
  private adds = new Map<number, { id: MonsterId; n: number }[]>();
  private slowed = false;
  private slowTold = false;
  private caffeAt = 0;

  constructor(private readonly host: ThemeHost) {
    const sc = host.scene;
    this.g = sc.add.graphics().setDepth(-460);
    this.gAdd = sc.add.graphics().setDepth(9060).setBlendMode(Phaser.BlendModes.ADD);
    this.shadow = sc.add.image(0, 0, tex(sc, "mt-ink", inkShadowCanvas)).setOrigin(0.5, 0.95).setAlpha(0).setDepth(0);
    tex(sc, "mt-slide-shot", slideShotCanvas);
    tex(sc, "mt-pen-shot", penShotCanvas);
  }

  private get arena(): MeetingArena | undefined {
    return MT_ARENAS.get(this.host.scene);
  }

  private s(m: ThemeMon): St {
    let s = this.st.get(m);
    if (!s) {
      s = { px: m.x, py: m.y, at: this.host.now() + 1200 + Math.random() * 1500, mode: 0, until: 0, vx: 0, vy: 0, hitAt: 0, ang: Math.random() * 6.28, phase: 0, boost: 0, bounces: 0 };
      this.st.set(m, s);
    }
    return s;
  }

  spawned(m: ThemeMon): void {
    const s = this.s(m);
    const H = this.host;
    if (m.id === "mt_no_opinion") {
      // 외곽선만 남긴 시트로 바꾼다 (같은 12프레임)
      const src = RTEX.monster(m.id);
      const key = `${src}-ghost`;
      if (!H.scene.textures.exists(key)) {
        const fw = monsterFrameSize(m.id);
        const t = H.scene.textures.addCanvas(key, outlineOnly(monsterSheet(m.id), 0xd8f4ff));
        if (t) for (let i = 0; i < 12; i++) t.add(i, 0, i * fw, 0, fw, fw);
      }
      m.sprite.setTexture(key, 0);
    }
    if (m.id === "mt_agenda") {
      s.at = H.now() + 2400;
      H.flash("정예 「안건 추가」 — 살아 있는 동안 회의실 문이 계속 열려요!", 2200);
    }
    if (m.id === "mt_minutes") H.flash("중간 우두머리 「회의록 담당」 — 내가 지나온 길을 그림자가 되밟아요!", 2400);
    if (m.id === "mt_chair_intern") s.at = H.now() + 700 + Math.random() * 800;
  }

  /** 의자 인턴: 직선으로 굴러오다 벽에 튕긴다 (걸음을 맡는다) */
  move(m: ThemeMon, dt: number): boolean {
    if (m.id !== "mt_chair_intern") return false;
    const H = this.host;
    const s = this.s(m);
    const now = H.now();
    const P = H.player();
    if (s.mode === 0) {
      // 쉬는 중 → 겨눈다
      if (now >= s.at) {
        s.mode = 1;
        s.until = now + 480;
        m.windUntil = s.until;
        const a = Math.atan2(P.y - m.y, P.x - m.x);
        s.vx = Math.cos(a) * 170;
        s.vy = Math.sin(a) * 170;
      }
      return true;
    }
    if (s.mode === 1) {
      m.sprite.setAngle(Math.sin(now / 25) * 6);
      if (now >= s.until) {
        s.mode = 2;
        s.until = now + 2300;
        s.bounces = 0;
        H.sfx("swish", 0.35);
      }
      return true;
    }
    const bx = m.x + s.vx * dt;
    const by = m.y + s.vy * dt;
    H.moveMon(m, s.vx * dt, s.vy * dt);
    let hit = false;
    if (Math.abs(m.x - bx) > 0.6) {
      s.vx = -s.vx;
      hit = true;
    }
    if (Math.abs(m.y - by) > 0.6) {
      s.vy = -s.vy;
      hit = true;
    }
    if (hit) {
      s.bounces++;
      H.sfx("thud", 0.3);
      H.shake(50, 0.0015);
    }
    s.ang += dt * 900;
    m.sprite.setAngle(s.ang);
    if (Math.hypot(P.x - m.x, P.y - m.y) < MONSTERS[m.id].size / 2 + 6 && now >= s.hitAt) {
      s.hitAt = now + 650;
      H.strike(m, 1.1);
    }
    if (now >= s.until || s.bounces > 3) {
      s.mode = 0;
      s.at = now + 650 + Math.random() * 500;
      m.sprite.setAngle(0);
    }
    return true;
  }

  /** 회의록 공유(새벽 회의부터): 쓰러지면 가까운 몬스터 둘의 체력이 찬다 */
  killed(m: ThemeMon): void {
    const s = this.st.get(m);
    if (s?.proj) this.st.delete(m);
    if ((this.arena?.loop ?? 0) < 2 || m.boss) return;
    const near = this.host
      .mons()
      .filter((o) => o !== m && o.alive && !o.boss && Math.hypot(o.x - m.x, o.y - m.y) < 80)
      .sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))
      .slice(0, 2);
    for (const o of near) {
      o.hp = Math.min(o.st.maxHp, o.hp + o.st.maxHp * 0.15);
      const line = this.host.scene.add.graphics().setDepth(9070).setBlendMode(Phaser.BlendModes.ADD);
      line.lineStyle(1, 0x6aff8a, 0.9).lineBetween(m.x, m.y - 6, o.x, o.y - 8);
      this.host.scene.tweens.add({ targets: line, alpha: 0, duration: 420, onComplete: () => line.destroy() });
      this.host.float(o.x, o.y - MONSTERS[o.id].size - 4, "+회의록", "#6aff8a");
    }
  }

  /** 층 이름 뒤: "17:25 · 교육장 · 노을 회의 (특성 …)" */
  title(): string {
    const A = this.arena;
    if (!A) return "";
    const L = mtLoopInfo(A.loop);
    return `${A.title} · ${L.name}${L.trait ? ` (특성 「${L.trait}」)` : ""}`;
  }

  /** 시계 보는 사람 곁: 공격 간격 배율 */
  atkCdMul(): number {
    return this.slowed ? WATCH_SLOW : 1;
  }

  update(now: number, dt: number): void {
    const A = this.arena;
    const H = this.host;
    if (!A) return;
    const P = H.player();
    const mons = H.mons();
    const g = this.g.clear();
    const ga = this.gAdd.clear();
    this.slowed = false;
    // 그림자가 되밟을 내 발자국
    const last = this.path[this.path.length - 1];
    if (!last || now - last.t >= 50) this.path.push({ t: now, x: P.x, y: P.y });
    while (this.path.length && this.path[0].t < now - 4000) this.path.shift();
    let minutes = false;
    // 카페인 각성 (야근 회의부터): 가끔 한 마리가 커피 김을 뿜으며 확 빨라진다
    if (A.loop >= 1 && now >= this.caffeAt) {
      this.caffeAt = now + 4200 + Math.random() * 2600;
      const pick = mons.filter((m) => m.alive && !m.boss && !m.hidden);
      if (pick.length) {
        const m = pick[Math.floor(Math.random() * pick.length)];
        this.s(m).boost = now + 1000;
        H.float(m.x, m.y - MONSTERS[m.id].size - 6, "카페인!", "#ffd07a");
      }
    }
    for (const m of mons) {
      if (!m.alive) continue;
      const s = this.s(m);
      const def = MONSTERS[m.id];
      const moved = Math.hypot(m.x - s.px, m.y - s.py);
      if (s.boost > now && !m.hidden && now >= m.stunUntil) {
        const a = Math.atan2(P.y - m.y, P.x - m.x);
        H.moveMon(m, Math.cos(a) * m.st.speed * 1.4 * dt, Math.sin(a) * m.st.speed * 1.4 * dt);
        if (Math.random() < dt * 14) this.puff(m.x + (Math.random() - 0.5) * 6, m.y - def.size, 0xf2f2ee);
      }
      switch (m.id) {
        case "mt_marker": {
          // 지나간 자리에 초록 선 (몇 초 동안 나를 막는 벽)
          const w = s.wall ?? (s.wall = { x: m.x, y: m.y });
          if (Math.hypot(m.x - w.x, m.y - w.y) >= 5) {
            A.addWall(w.x, w.y - 1, m.x, m.y - 1, now + MARKER_WALL_MS);
            s.wall = { x: m.x, y: m.y };
          }
          break;
        }
        case "mt_no_opinion": {
          const moving = moved > 0.12 && !m.hidden;
          const shimmer = 0.35 + 0.4 * Math.abs(Math.sin(now / 70 + m.x * 0.1));
          m.sprite.setAlpha(moving ? shimmer : 0.03 + 0.02 * Math.sin(now / 300));
          (m as { shadow?: Phaser.GameObjects.Image }).shadow?.setAlpha(moving ? 0.25 : 0);
          if (moving) A.veiled.delete(m);
          else A.veiled.add(m);
          break;
        }
        case "mt_slides":
          this.slides(m, s, now, g, ga);
          break;
        case "mt_clock_watcher": {
          const near = Math.hypot(P.x - m.x, P.y - m.y) < WATCH_R;
          if (near) this.slowed = true;
          const a0 = now / 600;
          g.lineStyle(1, near ? 0xffc040 : 0xe8c050, near ? 0.75 : 0.35).strokeEllipse(m.x, m.y - 2, WATCH_R * 2, WATCH_R * 1.4);
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2 + a0 * 0.2;
            g.fillStyle(0xe8c050, k % 3 ? 0.35 : 0.8).fillRect(m.x + Math.cos(a) * WATCH_R - 1, m.y - 2 + Math.sin(a) * WATCH_R * 0.7 - 1, 2, 2);
          }
          g.lineStyle(1, 0xffe08a, 0.6).lineBetween(m.x, m.y - 2, m.x + Math.cos(a0) * WATCH_R * 0.8, m.y - 2 + Math.sin(a0) * WATCH_R * 0.56);
          break;
        }
        case "mt_chat_ping": {
          // 좌우로 흔들며 파고든다
          if (m.hidden || now < m.stunUntil) break;
          const a = Math.atan2(P.y - m.y, P.x - m.x) + Math.PI / 2;
          const w = Math.sin(now / 110 + s.ang * 3) * 70;
          H.moveMon(m, Math.cos(a) * w * dt, Math.sin(a) * w * dt);
          break;
        }
        case "mt_projector":
          this.projector(m, s, now, dt, ga, P);
          break;
        case "mt_coffee":
          if (now >= s.at && !m.hidden) {
            s.at = now + 3000 + Math.random() * 1400;
            A.addPuddle(m.x + 4, m.y + 2, now + 7000);
            if (Math.random() < 0.35) H.float(m.x, m.y - 20, "아 죄송해요!", "#e8c8a0");
          }
          break;
        case "mt_howl":
          this.howl(m, s, now, g, ga, P, A);
          break;
        case "mt_agenda":
          this.agenda(m, s, now, A);
          break;
        case "mt_minutes":
          minutes = true;
          break;
        case "mt_chair":
          this.chair(m, s, now, ga, A);
          break;
      }
      s.px = m.x;
      s.py = m.y;
    }
    // 회의록 담당이 살아 있으면: 1.8초 전 내 자리를 되밟는 잉크 그림자
    const ghost = minutes ? this.path.find((p) => p.t >= now - MINUTES_DELAY_MS) : undefined;
    if (ghost && this.path[0].t <= now - MINUTES_DELAY_MS) {
      this.shadow.setPosition(ghost.x, ghost.y).setDepth(ghost.y - 0.5).setAlpha(0.55 + 0.2 * Math.sin(now / 90));
      ga.fillStyle(0x8a5aff, 0.18).fillEllipse(ghost.x, ghost.y, 18, 8);
      if (Math.random() < dt * 10) this.puff(ghost.x, ghost.y - 4, 0x3a2a6a);
      const src = mons.find((m) => m.id === "mt_minutes" && m.alive);
      if (src && Math.hypot(P.x - ghost.x, P.y - ghost.y) < 9) {
        const s = this.s(src);
        if (now >= s.hitAt) {
          s.hitAt = now + 750;
          H.strike(src, 0.8);
        }
      }
    } else this.shadow.setAlpha(0);
    if (this.slowed && !this.slowTold) {
      this.slowTold = true;
      H.flash("시계 보는 사람 곁에선 초조해서 공격이 느려져요 — 금색 원 밖으로!", 1800);
    }
    if (this.slowed && Math.random() < dt * 4) H.float(P.x + 8, P.y - 26, "째깍", "#ffd04a");
  }

  /** 발표 자료: 레이저 포인터로 1초 짚고(따라온다) → 0.25초 고정 → 한 장 쏜다 */
  private slides(m: ThemeMon, s: St, now: number, g: Phaser.GameObjects.Graphics, ga: Phaser.GameObjects.Graphics): void {
    const H = this.host;
    const P = H.player();
    const lx = m.x + (P.x < m.x ? -7 : 7);
    const ly = m.y - 9;
    if (s.mode === 0) {
      if (now >= s.at && !m.hidden && now >= m.stunUntil && Math.hypot(P.x - m.x, P.y - m.y) < 210) {
        s.mode = 1;
        s.until = now + 1000;
      }
      return;
    }
    if (s.mode === 1) {
      s.ang = Math.atan2(P.y - 6 - ly, P.x - lx);
      if (now >= s.until) {
        s.mode = 2;
        s.until = now + 260;
      }
    }
    const len = 260;
    const ex = lx + Math.cos(s.ang) * len;
    const ey = ly + Math.sin(s.ang) * len;
    const lock = s.mode === 2;
    const fl = lock && !H.reduced ? (Math.floor(now / 50) % 2 ? 1 : 0.5) : 0.55;
    g.lineStyle(1, 0xff2a2a, fl * 0.8).lineBetween(lx, ly, ex, ey);
    ga.lineStyle(lock ? 3 : 2, 0xff3a2a, lock ? 0.35 : 0.15).lineBetween(lx, ly, ex, ey);
    if (s.mode === 1) ga.fillStyle(0xff2020, 0.9).fillCircle(P.x, P.y - 6, 2).fillStyle(0xff6a5a, 0.3).fillCircle(P.x, P.y - 6, 5);
    if (lock && now >= s.until) {
      H.shoot(m, s.ang, 260, 1.15, "mt-slide-shot");
      H.sfx("flick", 0.45);
      s.mode = 0;
      s.at = now + 2200 + Math.random() * 1200;
    }
  }

  /** 빔프로젝터: 바닥에 뜨거운 화면을 비추고 천천히 나를 따라 옮긴다 (안에 있으면 탄다) */
  private projector(m: ThemeMon, s: St, now: number, dt: number, ga: Phaser.GameObjects.Graphics, P: { x: number; y: number }): void {
    if (!s.proj) {
      const a = Math.atan2(P.y - m.y, P.x - m.x);
      s.proj = { x: m.x + Math.cos(a) * 50, y: m.y + Math.sin(a) * 40, born: now };
    }
    const pr = s.proj;
    // 여러 대가 같은 자리를 비추지 않게 저마다 조금 비껴 겨눈다
    const tx = P.x + Math.cos(s.ang) * 16;
    const ty = P.y + Math.sin(s.ang) * 10;
    const d = Math.hypot(tx - pr.x, ty - pr.y) || 1;
    const sp = Math.min(d, 28 * dt * (m.hidden ? 0 : 1));
    pr.x += ((tx - pr.x) / d) * sp;
    pr.y += ((ty - pr.y) / d) * sp;
    const on = Math.min(1, (now - pr.born) / 1200);
    const lens = { x: m.x + (pr.x < m.x ? -6 : 6), y: m.y - 8 };
    const x0 = pr.x - PROJ_W / 2;
    const y0 = pr.y - PROJ_H / 2;
    ga.fillStyle(0xfff0b0, 0.05 * on).fillTriangle(lens.x, lens.y, x0, y0, x0 + PROJ_W, y0 + PROJ_H);
    const hot = on >= 1;
    const pulse = this.host.reduced ? 1 : 0.85 + 0.15 * Math.sin(now / 80);
    ga.fillStyle(hot ? 0xffd890 : 0xfff4d0, (hot ? 0.13 : 0.06) * pulse).fillRect(x0, y0, PROJ_W, PROJ_H);
    ga.lineStyle(1, hot ? 0xff8a3a : 0xfff0b0, 0.9 * on).strokeRect(x0, y0, PROJ_W, PROJ_H);
    if (hot) ga.lineStyle(1, 0xff5a2a, 0.35 * pulse).strokeRect(x0 - 1, y0 - 1, PROJ_W + 2, PROJ_H + 2);
    // 화면 속 슬라이드 (제목 줄 + 막대)
    ga.fillStyle(0x6aa0ff, 0.3 * on).fillRect(x0 + 3, y0 + 3, PROJ_W - 6, 4);
    for (let i = 0; i < 3; i++) ga.fillStyle(0xff8a5a, 0.25 * on).fillRect(x0 + 6 + i * 10, y0 + PROJ_H - 5 - (6 + i * 4), 6, 6 + i * 4);
    if (hot && Math.abs(P.x - pr.x) <= PROJ_W / 2 && Math.abs(P.y - pr.y) <= PROJ_H / 2 && now >= s.hitAt) {
      s.hitAt = now + 520;
      this.host.strike(m, 0.42);
      this.puff(P.x, P.y - 10, 0xff8a3a);
    }
  }

  /** 마이크 하울링: 0.8초 삐— (고리가 떨린다) → 소리 고리가 퍼지며 닿으면 밀어낸다 */
  private howl(m: ThemeMon, s: St, now: number, g: Phaser.GameObjects.Graphics, ga: Phaser.GameObjects.Graphics, P: { x: number; y: number }, A: MeetingArena): void {
    const H = this.host;
    if (s.mode === 0) {
      if (now >= s.at && !m.hidden && Math.hypot(P.x - m.x, P.y - m.y) < 150) {
        s.mode = 1;
        s.until = now + 800;
        H.float(m.x, m.y - 22, "삐이이—", "#7ad0ff");
        H.sfx("warn", 0.3);
      }
      return;
    }
    if (s.mode === 1) {
      const k = 1 - (s.until - now) / 800;
      const jit = H.reduced ? 0 : Math.sin(now / 20) * 2;
      g.lineStyle(1, 0x7ad0ff, 0.25 + 0.5 * k).strokeEllipse(m.x, m.y - 4, HOWL_R * 2 + jit, HOWL_R * 1.4 + jit);
      ga.fillStyle(0x7ad0ff, 0.06 + 0.1 * k).fillEllipse(m.x, m.y - 4, HOWL_R * 2 * k, HOWL_R * 1.4 * k);
      if (now >= s.until) {
        s.mode = 2;
        s.until = now + 450;
        s.hitAt = 0;
        H.sfx("slam", 0.4);
      }
      return;
    }
    const k = 1 - (s.until - now) / 450;
    const r = 6 + (HOWL_R - 6) * k;
    for (let i = 0; i < 3; i++) {
      const rr = Math.max(2, r - i * 7);
      ga.lineStyle(3 - i, 0x9ae8ff, (0.7 - i * 0.2) * (1 - k * 0.6)).strokeEllipse(m.x, m.y - 4, rr * 2, rr * 1.4);
    }
    const dx = P.x - m.x;
    const dy = (P.y - (m.y - 4)) / 0.7;
    const d = Math.hypot(dx, dy) || 1;
    if (!s.hitAt && Math.abs(d - r) < 9) {
      s.hitAt = 1;
      A.kick((dx / d) * 260, ((P.y - m.y) / (Math.hypot(P.x - m.x, P.y - m.y) || 1)) * 260);
      H.strike(m, 0.6);
    }
    if (now >= s.until) {
      s.mode = 0;
      s.at = now + 3600 + Math.random() * 1200;
    }
  }

  /** 정예 안건 추가: 살아 있는 동안 4.5초마다 그 층 몬스터 하나가 회의실로 들어온다 (층 계획 adds 상한까지) */
  private agenda(m: ThemeMon, s: St, now: number, A: MeetingArena): void {
    const H = this.host;
    let left = this.adds.get(m.wave);
    if (!left) {
      left = (towerPlan(A.runSeed, A.floor, A.start)[m.wave]?.adds ?? []).map((a) => ({ ...a }));
      this.adds.set(m.wave, left);
    }
    if (now < s.at || m.hidden) return;
    s.at = now + 4500;
    const next = left.filter((a) => a.n > 0).sort((a, b) => b.n - a.n)[0];
    if (!next) return;
    next.n--;
    const P = H.player();
    const spots = A.plan.spawns.map(([x, y]) => A.clampPt(x, y, 8)).filter((p) => Math.hypot(p.x - P.x, p.y - P.y) > 80);
    const at = spots.length ? spots[Math.floor(Math.random() * spots.length)] : A.clampPt(m.x, m.y - 30, 8);
    const p = H.place(at.x, at.y, MONSTERS[next.id].size / 2);
    H.spawn(next.id, p.x, p.y, m.wave, true);
    H.float(p.x, p.y - 18, "안건 +1", "#ffd04a");
    const note = H.scene.add.rectangle(m.x, m.y - 20, 6, 6, 0xf0d040).setDepth(9070);
    H.scene.tweens.add({ targets: note, x: p.x, y: p.y - 10, angle: 360, duration: 380, onComplete: () => note.destroy() });
    H.sfx("tick", 0.4);
  }

  /** 회의 주재자: 단계가 오를 때마다 "한 가지만 더" → 방이 좁아진다. 마지막 단계는 의자를 돌리며 사방으로 쏜다 */
  private chair(m: ThemeMon, s: St, now: number, ga: Phaser.GameObjects.Graphics, A: MeetingArena): void {
    const H = this.host;
    if (m.phase > s.phase) {
      s.phase = m.phase;
      A.forceShrink(now);
      if (m.phase >= 3) {
        s.mode = 0;
        s.at = now + 1200;
      }
    }
    if (m.phase < 3) return;
    if (s.mode === 0 && now >= s.at && !m.hidden) {
      s.mode = 1;
      s.until = now + 1900;
      s.hitAt = now;
      H.flash("의자를 돌린다! 탄 사이 틈으로", 1000);
      H.sfx("roar", 0.5);
    }
    if (s.mode !== 1) return;
    const t = 1 - (s.until - now) / 1900;
    m.sprite.scaleX = Math.cos(now / 45) >= 0 ? Math.max(0.25, Math.abs(Math.cos(now / 45))) : -Math.max(0.25, Math.abs(Math.cos(now / 45)));
    ga.lineStyle(2, 0xffd050, 0.3).strokeEllipse(m.x, m.y - 2, 70 + t * 10, 46);
    if (now >= s.hitAt) {
      s.hitAt = now + 150;
      s.ang += 0.34;
      for (let k = 0; k < 4; k++) H.shoot(m, s.ang + (k * Math.PI) / 2, 92, 0.45, "mt-pen-shot");
      H.sfx("flick", 0.2);
    }
    if (now >= s.until) {
      s.mode = 0;
      s.at = now + 2600;
      m.sprite.scaleX = 1;
    }
  }

  private puff(x: number, y: number, col: number): void {
    const sc = this.host.scene;
    const img = sc.add.image(x, y, RTEX.glow).setTint(col).setScale(0.12).setAlpha(0.8).setDepth(9065);
    sc.tweens.add({ targets: img, y: y - 8, scale: 0.25, alpha: 0, duration: 520, onComplete: () => img.destroy() });
  }

  destroy(): void {
    this.g.destroy();
    this.gAdd.destroy();
    this.shadow.destroy();
    this.path = [];
    this.adds.clear();
  }
}

/** 야근 빌딩 테마 실행부 목록에 끼우는 만들기 함수 */
export const meetingRuntime: ThemeFactory = (host) => new MeetingRuntime(host);
