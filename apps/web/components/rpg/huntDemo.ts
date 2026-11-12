import { AV_ANIM, AV_H, AV_W, buildAvatarSheet } from "@/game/sprites/avatar";
import {
  bandTex,
  cardSheet,
  coinSheet,
  crackSheet,
  crossSheet,
  FX_FRAME,
  heavyArcSheet,
  impactSheet,
  inkBoltTex,
  inkSheet,
  orbTex,
  puffSheet,
  streakSheet,
  swingArcSheet,
} from "@/game/rpg/fxArt";
import { iconCanvas } from "@/game/rpg/icons";
import { MON_FRAMES, monsterFrameSize, monsterOrigin, monsterSheet } from "@/game/rpg/monsterArt";
import { TELEGRAPH_COLOR, TELEGRAPH_FLASH_FILL, TELEGRAPH_FLASH_LINE, TELEGRAPH_FLASH_MS, telegraphAlpha, telegraphFlash } from "@/game/rpg/telegraphArt";
import { GEAR, HOTBAR_SIZE, POTIONS, SKILLS, skillById, type IconArt, type MonsterId, type SkillId } from "@/lib/rpg/catalog";
import { DEFAULT_BOSS_PHASES, type TelegraphShape } from "@/lib/rpg/patterns";
import { FINISHER_EVERY, WEAPON_STYLES, weaponStyleOf, type WeaponStyleId } from "@/lib/rpg/weapons";

// 사냥 안내서 쪽마다 도는 짧은 시연 (동영상 대신 게임 그림으로 직접 그린다).
// 아바타·몬스터·이펙트·아이콘 그림은 게임이 쓰는 Grid 그림을 그대로 쓰고(Phaser 없음), 움직임만 여기서 짠다.
// 논리 화면 W×H 픽셀을 SCALE배로 키워 그린다. 글자는 배율 없이 실제 픽셀로 그려 또렷하게.

export const DEMO_W = 176;
export const DEMO_H = 96;
export const DEMO_SCALE = 2;
const FONT = '"Galmuri11", "Galmuri9", monospace';

type Sheet = { img: HTMLCanvasElement; fw: number; fh: number };
type Art = {
  av: HTMLCanvasElement;
  fx: Record<"impact" | "arc" | "heavy" | "crack" | "cross" | "puff" | "coin" | "orb" | "ink" | "card", Sheet> & { streak: Sheet; band: HTMLCanvasElement; inkBolt: HTMLCanvasElement };
  mon: Map<MonsterId, Sheet>;
  icon: Map<string, HTMLCanvasElement>;
};

let art: Art | null = null;

/** 그림은 처음 그릴 때 한 번만 만든다 (브라우저에서만) */
function getArt(): Art {
  if (art) return art;
  const sq = (img: HTMLCanvasElement, f: number): Sheet => ({ img, fw: f, fh: f });
  art = {
    av: buildAvatarSheet("#9fb8d8", [], "hood"),
    fx: {
      impact: sq(impactSheet().toCanvas(), FX_FRAME.impact),
      arc: sq(swingArcSheet().toCanvas(), FX_FRAME.arc),
      heavy: sq(heavyArcSheet().toCanvas(), FX_FRAME.arc),
      crack: sq(crackSheet().toCanvas(), FX_FRAME.crack),
      cross: sq(crossSheet().toCanvas(), FX_FRAME.cross),
      puff: sq(puffSheet().toCanvas(), FX_FRAME.puff),
      coin: sq(coinSheet().toCanvas(), FX_FRAME.coin),
      orb: sq(orbTex().toCanvas(), FX_FRAME.orb),
      ink: sq(inkSheet().toCanvas(), FX_FRAME.ink),
      card: { img: cardSheet().toCanvas(), fw: FX_FRAME.card.w, fh: FX_FRAME.card.h },
      streak: { img: streakSheet().toCanvas(), fw: FX_FRAME.streak.w, fh: FX_FRAME.streak.h },
      band: bandTex().toCanvas(),
      inkBolt: inkBoltTex().toCanvas(),
    },
    mon: new Map(),
    icon: new Map(),
  };
  return art;
}

// ── 그리기 도우미 ──

const css = (n: number, a = 1) => `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * clamp01(k);
/** t가 [a, a+d) 안에서 얼마나 지났나 (0..1) */
const span = (t: number, a: number, d: number) => clamp01((t - a) / d);

function floor(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#26331f";
  ctx.fillRect(0, 0, DEMO_W, DEMO_H);
  ctx.fillStyle = "#2c3a24";
  for (let y = 0; y < DEMO_H; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < DEMO_W; x += 16) ctx.fillRect(x, y, 8, 8);
  ctx.fillStyle = "#3b4d2e";
  for (let i = 0; i < 26; i++) ctx.fillRect((i * 37) % DEMO_W, (i * 53) % DEMO_H, 1, 1);
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

type FrameOpts = { rot?: number; sx?: number; sy?: number; alpha?: number; vertical?: boolean; ox?: number };

/** 시트의 i번째 프레임을 (cx, cy) 가운데에 그린다 */
function frameAt(ctx: CanvasRenderingContext2D, s: Sheet, i: number, cx: number, cy: number, o: FrameOpts = {}) {
  const { rot = 0, sx = 1, sy = 1, alpha = 1, vertical = false, ox = 0.5 } = o;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  const fx = vertical ? 0 : i * s.fw;
  const fy = vertical ? i * s.fh : 0;
  ctx.drawImage(s.img, fx, fy, s.fw, s.fh, -s.fw * ox, -s.fh / 2, s.fw, s.fh);
  ctx.restore();
}

/** 프레임 애니메이션: 시작 at부터 frames장을 ms 간격으로 (끝나면 안 그린다) */
function playFx(ctx: CanvasRenderingContext2D, t: number, at: number, s: Sheet, frames: number, ms: number, x: number, y: number, o: FrameOpts = {}) {
  if (t < at) return;
  const i = Math.floor((t - at) / ms);
  if (i >= frames) return;
  frameAt(ctx, s, i, x, y, { ...o, alpha: (o.alpha ?? 1) * (i === frames - 1 ? 0.7 : 1) });
}

type Dir = "down" | "left" | "right" | "up";
const ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

/** 아바타: 발바닥이 (x, y). pose = idle | walk | run */
function avatar(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir, pose: "idle" | "walk" | "run", t: number, alpha = 1) {
  const a = AV_ANIM[pose];
  const col = a.col + (Math.floor((t * a.fps) / 1000) % a.frames);
  ctx.save();
  ctx.globalAlpha *= alpha;
  shadow(ctx, x, y, 5);
  ctx.drawImage(getArt().av, col * AV_W, ROW[dir] * AV_H, AV_W, AV_H, Math.round(x - AV_W / 2), Math.round(y - AV_H + 1), AV_W, AV_H);
  ctx.restore();
}

function monSheet(id: MonsterId): Sheet {
  const m = getArt().mon;
  let s = m.get(id);
  if (!s) {
    const f = monsterFrameSize(id);
    s = { img: monsterSheet(id), fw: f, fh: f };
    m.set(id, s);
  }
  return s;
}

/** 몬스터: 발밑이 (x, y). 그림은 오른쪽을 본다 (faceLeft면 뒤집는다) */
function monster(ctx: CanvasRenderingContext2D, id: MonsterId, frame: number, x: number, y: number, faceLeft: boolean, alpha = 1) {
  const s = monSheet(id);
  const [ox, oy] = monsterOrigin(id);
  ctx.save();
  ctx.globalAlpha *= alpha;
  shadow(ctx, x, y, s.fw * 0.3);
  ctx.translate(Math.round(x), Math.round(y));
  if (faceLeft) ctx.scale(-1, 1);
  ctx.drawImage(s.img, frame * s.fw, 0, s.fw, s.fh, -Math.round(s.fw * ox), -Math.round(s.fh * oy), s.fw, s.fh);
  ctx.restore();
}

const idleFrame = (t: number) => MON_FRAMES.idle + (Math.floor(t / 420) % 2);
const moveFrame = (t: number) => MON_FRAMES.move + (Math.floor(t / 110) % 4);

function icon(ctx: CanvasRenderingContext2D, a: IconArt | undefined, x: number, y: number, size = 16, alpha = 1) {
  if (!a) return;
  const m = getArt().icon;
  const k = `${a.shape}|${a.main}|${a.accent}`;
  let c = m.get(k);
  if (!c) {
    c = iconCanvas(a);
    m.set(k, c);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(c, Math.round(x), Math.round(y), size, size);
  ctx.restore();
}

/** 글자: 배율 없이 실제 픽셀로 (논리 좌표를 받는다) */
function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = "#f2ead3", o: { size?: number; align?: CanvasTextAlign; alpha?: number; stroke?: boolean } = {}) {
  const { size = 11, align = "center", alpha = 1, stroke = true } = o;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(20, 16, 24, 0.9)";
  const px = Math.round(x * DEMO_SCALE);
  const py = Math.round(y * DEMO_SCALE);
  if (stroke) ctx.strokeText(s, px, py);
  ctx.fillStyle = color;
  ctx.fillText(s, px, py);
  ctx.restore();
}

/** 화면 귀퉁이 키 안내 (눌린 동안 밝게) */
function keyCap(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, down: boolean) {
  const w = Math.max(12, label.length * 4 + 6);
  ctx.fillStyle = down ? "#e8c66a" : "rgba(242, 234, 211, 0.18)";
  ctx.fillRect(x, y + (down ? 1 : 0), w, 10);
  ctx.fillStyle = down ? "#8a6a20" : "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(x, y + 10, w, down ? 1 : 2);
  text(ctx, label, x + w / 2, y + 5 + (down ? 1 : 0), down ? "#2a2010" : "#f2ead3", { size: 10, stroke: !down });
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * clamp01(ratio)), h);
}

/** 발밑 공격 게이지 (차오르다 다 차면 반짝) */
function gauge(ctx: CanvasRenderingContext2D, x: number, y: number, ratio: number, t: number) {
  const full = ratio >= 1;
  bar(ctx, x - 8, y + 3, 16, 2, ratio, full ? (Math.floor(t / 90) % 2 ? "#ffffff" : "#8be07a") : "#5aa04a");
}

function floatNum(ctx: CanvasRenderingContext2D, t: number, at: number, s: string, x: number, y: number, color = "#ffffff", size = 11) {
  const k = span(t, at, 600);
  if (t < at || k >= 1) return;
  text(ctx, s, x, y - 4 - k * 10 - Math.sin(k * Math.PI) * 3, color, { size, alpha: 1 - Math.max(0, k - 0.6) / 0.4 });
}

/** 바닥 경고: p(0..1)만큼 찼다. fired면 번쩍임(flash 1→0) */
function telegraph(ctx: CanvasRenderingContext2D, shape: TelegraphShape, x: number, y: number, ang: number, p: number, now: number, flash = -1) {
  const path = (k: number) => {
    ctx.beginPath();
    switch (shape.kind) {
      case "circle":
        ctx.arc(x, y, shape.r * k, 0, Math.PI * 2);
        break;
      case "ring":
        ctx.arc(x, y, shape.r1 * (k < 1 ? shape.r0 / shape.r1 + (1 - shape.r0 / shape.r1) * k : 1), 0, Math.PI * 2);
        ctx.arc(x, y, shape.r0, 0, Math.PI * 2, true);
        break;
      case "cone": {
        const h = (shape.arcDeg / 2) * (Math.PI / 180);
        ctx.moveTo(x, y);
        ctx.arc(x, y, shape.r * k, ang - h, ang + h);
        ctx.closePath();
        break;
      }
      case "line": {
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const nx = -uy * (shape.width / 2);
        const ny = ux * (shape.width / 2);
        const len = shape.len * k;
        ctx.moveTo(x + nx, y + ny);
        ctx.lineTo(x + ux * len + nx, y + uy * len + ny);
        ctx.lineTo(x + ux * len - nx, y + uy * len - ny);
        ctx.lineTo(x - nx, y - ny);
        ctx.closePath();
        break;
      }
    }
  };
  ctx.lineWidth = 1;
  if (flash >= 0) {
    const f = telegraphFlash(flash);
    path(1);
    ctx.fillStyle = css(TELEGRAPH_FLASH_FILL, f.fill);
    ctx.fill("evenodd");
    ctx.strokeStyle = css(TELEGRAPH_FLASH_LINE, f.line);
    ctx.stroke();
    return;
  }
  const a = telegraphAlpha(p, now);
  path(1);
  ctx.fillStyle = css(TELEGRAPH_COLOR, a.base);
  ctx.fill("evenodd");
  ctx.strokeStyle = css(TELEGRAPH_COLOR, a.line);
  ctx.stroke();
  path(Math.max(0.02, p));
  ctx.fillStyle = css(TELEGRAPH_COLOR, a.fill);
  ctx.fill("evenodd");
}

/** 무기 궤적 (게임 CombatFx.motion과 같은 그림·크기 규칙) */
function motion(ctx: CanvasRenderingContext2D, t: number, at: number, style: WeaponStyleId, x: number, y: number, ang: number, reach: number, finisher = false, arcDeg = 120) {
  const fx = getArt().fx;
  switch (style) {
    case "swing":
    case "smash": {
      const k = Math.max(0.8, reach / 18);
      playFx(ctx, t, at, style === "smash" ? fx.heavy : fx.arc, 4, style === "smash" ? 60 : 50, x, y, { rot: ang, sx: k, sy: k * Math.min(1.5, Math.max(0.8, arcDeg / 130)) });
      break;
    }
    case "thrust":
      playFx(ctx, t, at, fx.streak, 3, 60, x, y, { rot: ang, sx: reach / 52, sy: finisher ? 1.6 : 1, vertical: true, ox: 0 });
      break;
    case "combo":
      playFx(ctx, t, at, fx.cross, 2, 70, x + Math.cos(ang) * reach * 0.55, y + Math.sin(ang) * reach * 0.55, { rot: ang, sx: reach / 16, sy: reach / 16 });
      break;
    case "shot":
    case "card":
      playFx(ctx, t, at, fx.puff, 3, 60, x + Math.cos(ang) * 6, y + Math.sin(ang) * 6);
      break;
    case "magic":
      playFx(ctx, t, at, fx.impact, 4, 60, x, y - 4, { sx: 0.6, sy: 0.6 });
      break;
  }
}

/** 맞은 자리: 별 충격 + 숫자 */
function hit(ctx: CanvasRenderingContext2D, t: number, at: number, x: number, y: number, dmg: string, big = false) {
  playFx(ctx, t, at, getArt().fx.impact, 4, 45, x, y, { sx: big ? 1.3 : 0.9, sy: big ? 1.3 : 0.9 });
  floatNum(ctx, t, at, dmg, x, y - 8, big ? "#ff9a3c" : "#ffffff", big ? 14 : 11);
}

/** 이 시각에 맞고 있나 (맞음 프레임·밀림) */
const hurtAt = (t: number, hits: readonly number[]) => hits.some((h) => t >= h && t < h + 160);
const knock = (t: number, hits: readonly number[]) => hits.reduce((s, h) => s + (t >= h ? lerp(0, 3, (t - h) / 80) - (t >= h + 160 ? lerp(0, 3, (t - h - 160) / 200) : 0) : 0), 0);

function label(ctx: CanvasRenderingContext2D, s: string, color = "#f2ead3") {
  ctx.fillStyle = "rgba(14, 12, 18, 0.55)";
  ctx.fillRect(0, 0, DEMO_W, 12);
  text(ctx, s, DEMO_W / 2, 6, color, { size: 11 });
}

// ── 쪽별 시연 ──

type Scene = { period: number; still: number; draw: (ctx: CanvasRenderingContext2D, t: number, now: number) => void };

const SWING = WEAPON_STYLES.swing;
const skillArt = (id: SkillId) => skillById(id)?.art;
const weaponArt = (id: WeaponStyleId) => GEAR.find((g) => g.kind === "weapon" && weaponStyleOf(g).id === id)?.art;

/** 1쪽: 걸어가서 꾹 눌러 연속 공격 → 3번째는 마무리 */
const moveAttack: Scene = {
  period: 4600,
  still: 2640,
  draw(ctx, t) {
    floor(ctx);
    const walking = t < 1200;
    const px = lerp(22, 76, t / 1200);
    const py = 60;
    const hits = [1400, 1950, 2500];
    const mx = 100 + knock(t, hits);
    // 쓰러졌다가 잠시 뒤 다시 나온다
    if (t < 2620 || t >= 3800) monster(ctx, "tech_debt_slime", hurtAt(t, hits) ? MON_FRAMES.hurt : idleFrame(t), mx, py, true, t < 3800 ? 1 : span(t, 3800, 400));
    else if (t < 3040) {
      const k = Math.min(2, Math.floor((t - 2620) / 140));
      monster(ctx, "tech_debt_slime", MON_FRAMES.death + k, mx, py, true, k === 2 ? 0.6 : 1);
    }
    avatar(ctx, px, py, "right", walking ? "walk" : "idle", t);
    // 공격: 꾹 누르는 동안 간격마다
    const last = [...hits].reverse().find((h) => t >= h - 100);
    hits.forEach((h, i) => {
      const fin = i === FINISHER_EVERY - 1;
      const area = fin ? { range: SWING.finisher.range ?? SWING.area.range, arcDeg: SWING.finisher.arcDeg ?? SWING.area.arcDeg } : SWING.area;
      motion(ctx, t, h - 100, "swing", px + 4, py - 9, 0, area.range, fin, area.arcDeg);
      hit(ctx, t, h, mx, py - 8, fin ? "31" : String(11 + i), fin);
    });
    if (t >= 2400 && t < 3000) text(ctx, SWING.finisher.label, px + 4, py - 34, "#ffd04a", { size: 11 });
    if (!walking && t < 3000) gauge(ctx, px, py, last === undefined ? 1 : (t - last + 100) / 550, t);
    keyCap(ctx, "→", 4, 82, walking);
    keyCap(ctx, "Space 꾹", 22, 82, t >= 1300 && t < 2700);
    if (t < 1200) text(ctx, "이동", 88, 90, "#c8d8b8", { size: 10 });
    else if (t < 2700) text(ctx, "꾹 누르면 계속 공격", 104, 90, "#c8d8b8", { size: 10 });
    if (t < 3000) bar(ctx, mx - 8, py - 22, 16, 2, t < 1400 ? 1 : t < 1950 ? 0.7 : t < 2500 ? 0.4 : 0, "#e05a4a");
  },
};

/** 2쪽: 스킬 쓰기 → 쿨타임 그림자 → 포션 */
const skillPotion: Scene = {
  period: 5200,
  still: 1300,
  draw(ctx, t, now) {
    floor(ctx);
    const px = 58;
    const py = 54;
    const use = 700;
    const cd = 2600;
    const pot = 3300;
    const sk = SKILLS[0];
    const ring = span(t, use, 360);
    const hits = [use + 180];
    monster(ctx, "scope_creep", hurtAt(t, hits) ? MON_FRAMES.hurt : idleFrame(t), 110 + knock(t, hits), 48, true);
    monster(ctx, "scope_creep", hurtAt(t, hits) ? MON_FRAMES.hurt : idleFrame(t + 200), 120 + knock(t, hits), 66, true);
    if (t >= use && ring < 1) {
      ctx.strokeStyle = `rgba(122, 168, 255, ${1 - ring})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, py - 4, 8 + ring * 60, (8 + ring * 60) * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    avatar(ctx, px, py, "right", "idle", t);
    hit(ctx, t, use + 180, 110, 38, "48");
    hit(ctx, t, use + 220, 120, 56, "45");
    // 포션: 김이 오르고 HP가 찬다
    floatNum(ctx, t, pot, "+HP", px, py - 26, "#8be07a");
    // HP·SP 막대
    const hp = t < pot ? 0.38 : lerp(0.38, 0.9, (t - pot) / 300);
    const sp = t < use ? 0.9 : 0.55;
    bar(ctx, 4, 4, 44, 4, hp, "#e05a4a");
    bar(ctx, 4, 11, 44, 3, sp, "#4a8ae0");
    text(ctx, "HP", 54, 6, "#f2ead3", { size: 9, align: "left" });
    text(ctx, "SP", 54, 12.5, "#f2ead3", { size: 9, align: "left" });
    // 단축키 줄: 1~HOTBAR_SIZE 스킬 + 포션
    const n = HOTBAR_SIZE;
    const x0 = Math.round((DEMO_W - (n + 1) * 19) / 2);
    const y0 = 76;
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * 19;
      const potion = i === n;
      ctx.fillStyle = "rgba(14, 12, 18, 0.7)";
      ctx.fillRect(x - 1, y0 - 1, 18, 18);
      icon(ctx, potion ? POTIONS[0]?.art : SKILLS[i]?.art, x, y0);
      const pressed = potion ? t >= pot && t < pot + 160 : i === 0 && ((t >= use && t < use + 160) || (t >= 1700 && t < 1860));
      if (pressed) {
        ctx.strokeStyle = "#e8c66a";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 0.5, y0 - 0.5, 17, 17);
      }
      // 쿨타임: 그림자가 시계 방향으로 걷힌다
      const from = potion ? pot : use;
      const len = potion ? 1800 : cd;
      if ((potion || i === 0) && t >= from && t < from + len) {
        const left = 1 - (t - from) / len;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.beginPath();
        ctx.moveTo(x + 8, y0 + 8);
        ctx.arc(x + 8, y0 + 8, 12, -Math.PI / 2 + (1 - left) * Math.PI * 2, Math.PI * 1.5);
        ctx.closePath();
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y0, 16, 16);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(x + 8, y0 + 8);
        ctx.arc(x + 8, y0 + 8, 12, -Math.PI / 2 + (1 - left) * Math.PI * 2, Math.PI * 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      text(ctx, potion ? (POTIONS[0]?.key ?? "Q") : String(i + 1), x + 14, y0 + 14, "#f2ead3", { size: 9 });
    }
    if (t >= use - 200 && t < 1500) text(ctx, `1 → ${sk?.name ?? "스킬"}`, DEMO_W / 2, 20, "#bcd8ff", { size: 11 });
    else if (t >= 1700 && t < 2500) text(ctx, "쿨타임 중엔 못 써요", DEMO_W / 2, 20, Math.floor(now / 200) % 2 ? "#ffb0a0" : "#ff8a70", { size: 11 });
    else if (t >= pot - 200 && t < pot + 1200) text(ctx, `${POTIONS[0]?.key ?? "Q"} → ${POTIONS[0]?.name ?? "포션"}`, DEMO_W / 2, 20, "#8be07a", { size: 11 });
  },
};

/** 3쪽: 무기 방식마다 공격 모양 (범위를 바닥에 옅게 + 궤적) */
const STYLE_ORDER = Object.keys(WEAPON_STYLES) as WeaponStyleId[];
const SEG = 1300;
const weapons: Scene = {
  period: STYLE_ORDER.length * SEG,
  still: 380,
  draw(ctx, t) {
    floor(ctx);
    const k = Math.floor(t / SEG);
    const id = STYLE_ORDER[k];
    const w = WEAPON_STYLES[id];
    const u = t - k * SEG;
    const px = 40;
    const py = 58;
    const hx = px + 4;
    const hy = py - 9;
    // 화면에 맞게 사거리를 줄여 그린다 (먼 무기는 가장자리까지)
    const range = Math.min(w.area.range, DEMO_W - hx - 14);
    const ranged = !!w.projectile || !!w.blast;
    const tx = ranged ? hx + range - 12 : hx + Math.max(18, range - 4);
    // 범위 미리 보기 (옅은 부채꼴)
    const half = (w.area.arcDeg / 2) * (Math.PI / 180);
    ctx.fillStyle = "rgba(232, 198, 106, 0.12)";
    ctx.strokeStyle = "rgba(232, 198, 106, 0.4)";
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.arc(hx, hy, range, -half, half);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const hitsAt = id === "combo" ? [360, 560] : ranged ? [w.blast ? 760 : 520] : [360];
    monster(ctx, "scope_creep", hurtAt(u, hitsAt) ? MON_FRAMES.hurt : idleFrame(t), tx + 6 + knock(u, hitsAt) * (w.kb > 1 ? 2 : 1), hy + 8, true);
    avatar(ctx, px, py, "right", "idle", t);
    const fx = getArt().fx;
    motion(ctx, u, 260, id, hx, hy, 0, range, false, w.area.arcDeg);
    if (id === "combo") motion(ctx, u, 460, id, hx, hy, 0, range, false, w.area.arcDeg);
    if (id === "smash") playFx(ctx, u, 360, fx.crack, 3, 90, hx + range * 0.6, py);
    if (id === "shot" || id === "card") {
      const f = span(u, 280, 240);
      if (u >= 280 && f < 1) {
        const x = lerp(hx + 6, tx, f);
        if (id === "shot") ctx.drawImage(fx.band, Math.round(x - 3), Math.round(hy - 2));
        else frameAt(ctx, fx.card, Math.floor(u / 60) % 2, x, hy);
      }
    }
    if (id === "magic") {
      const r = w.blast ?? 16;
      const p = span(u, 300, 460);
      if (u >= 300 && p < 1) {
        ctx.fillStyle = `rgba(122, 168, 255, ${0.15 + 0.25 * p})`;
        ctx.strokeStyle = "rgba(122, 168, 255, 0.8)";
        ctx.beginPath();
        ctx.ellipse(tx, hy + 8, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(tx, hy + 8, r * p, r * 0.6 * p, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      playFx(ctx, u, 760, fx.ink, 4, 70, tx, hy + 8, { sx: r / 15, sy: r / 15 });
      if (u >= 760 && u < 1060) {
        const q = span(u, 760, 300);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          ctx.globalAlpha = 1 - q;
          ctx.drawImage(fx.inkBolt, Math.round(tx + Math.cos(a) * r * q - 3), Math.round(hy + 4 + Math.sin(a) * r * 0.6 * q - 6 * q - 3));
          ctx.globalAlpha = 1;
        }
      }
    }
    hitsAt.forEach((h, i) => hit(ctx, u, h, tx + 6, hy, String(14 + i * 3)));
    label(ctx, `${k + 1}/${STYLE_ORDER.length} ${w.name}`);
    icon(ctx, weaponArt(id), 2, 14, 16);
    text(ctx, ranged ? `사거리 ${w.area.range}` : `범위 ${w.area.range} · ${w.area.arcDeg}°`, DEMO_W - 4, 90, "#c8d8b8", { size: 10, align: "right" });
  },
};

/** 4쪽: 경고가 차오르는 동안 밖으로 피한다 (모양 4가지) */
type Dodge = { name: string; shape: TelegraphShape; at: "me" | "mon"; from: [number, number]; to: [number, number] };
const MX = 122;
const MY = 52;
const DODGES: Dodge[] = [
  { name: "원 — 밖으로", shape: { kind: "circle", r: 22 }, at: "me", from: [70, 60], to: [70, 86] },
  { name: "줄 — 옆으로 비켜서기", shape: { kind: "line", len: 96, width: 18 }, at: "mon", from: [62, 52], to: [62, 78] },
  { name: "부채꼴 — 뒤나 옆으로", shape: { kind: "cone", r: 46, arcDeg: 80 }, at: "mon", from: [92, 54], to: [92, 86] },
  { name: "고리 — 바짝 붙으면 안전", shape: { kind: "ring", r0: 13, r1: 44 }, at: "mon", from: [92, 58], to: [MX - 9, MY + 3] },
];
const DSEG = 2200;
const patterns: Scene = {
  period: DODGES.length * DSEG,
  still: 900,
  draw(ctx, t, now) {
    floor(ctx);
    const k = Math.floor(t / DSEG);
    const d = DODGES[k];
    const u = t - k * DSEG;
    const start = 200;
    const fire = 1300;
    // 피하기: 경고를 보고 움직여 밖으로 → 끝나면 제자리로
    const go = span(u, 650, 450);
    const back = span(u, 1700, 450);
    const x = lerp(lerp(d.from[0], d.to[0], go), d.from[0], back);
    const y = lerp(lerp(d.from[1], d.to[1], go), d.from[1], back);
    const moving = (u >= 650 && u < 1100) || (u >= 1700 && u < 2150);
    const tx = d.at === "me" ? d.from[0] : MX;
    const ty = d.at === "me" ? d.from[1] : MY;
    const ang = Math.atan2(d.from[1] - MY, d.from[0] - MX);
    if (u >= start && u < fire) telegraph(ctx, d.shape, tx, ty, ang, (u - start) / (fire - start), now);
    else if (u >= fire && u < fire + TELEGRAPH_FLASH_MS) telegraph(ctx, d.shape, tx, ty, ang, 1, now, 1 - (u - fire) / TELEGRAPH_FLASH_MS);
    const dx = x - MX;
    const dir: "left" | "right" | "up" | "down" = moving ? (Math.abs(y - d.from[1]) > 1 && Math.abs(dx) < 40 && go < 1 ? (d.to[1] > d.from[1] ? "down" : "up") : dx < 0 ? "right" : "left") : dx < 0 ? "right" : "left";
    const charging = d.shape.kind === "line" && u >= fire && u < fire + 300;
    const mx = charging ? MX - Math.sin(span(u, fire, 300) * Math.PI) * 60 : MX;
    const atk = u >= start && u < fire + 200;
    const items: [number, () => void][] = [
      [MY, () => monster(ctx, "opposing_lead", atk ? MON_FRAMES.attack + (u >= fire ? 1 : 0) : idleFrame(t), mx, MY, true)],
      [y, () => avatar(ctx, x, y, dir, moving ? "walk" : "idle", t)],
    ];
    items.sort((a, b) => a[0] - b[0]).forEach(([, f]) => f());
    if (d.shape.kind === "circle") playFx(ctx, u, fire, getArt().fx.impact, 4, 50, tx, ty - 4, { sx: 1.4, sy: 1.4 });
    if (u >= fire && u < fire + 500) text(ctx, "안전!", x, y - 34, "#8be07a", { size: 11 });
    label(ctx, `${d.name}`);
    if (u >= start && u < fire) text(ctx, "안쪽이 다 차면 맞아요", DEMO_W / 2, 90, "#ffb0a0", { size: 10 });
  },
};

/** 5쪽: 우두머리 HP가 줄면 화가 나 붉은 기운 + 졸개 + 경고가 늘어난다 */
const boss: Scene = {
  period: 6400,
  still: 3600,
  draw(ctx, t, now) {
    floor(ctx);
    const bx = 124;
    const by = 64;
    const px = 66;
    const py = 66;
    const end = 5400;
    const hp = t < end ? lerp(1, 0.28, t / 4800) : lerp(0.28, 1, (t - end) / 600);
    const phase = DEFAULT_BOSS_PHASES.filter((p) => hp < p.below).length;
    const enter = DEFAULT_BOSS_PHASES.map((p) => (4800 * (1 - p.below)) / 0.72);
    // 붉은 기운
    if (phase > 0 && t < end) {
      const pulse = 0.25 + 0.15 * Math.sin(now / 120) + phase * 0.1;
      const g = ctx.createRadialGradient(bx, by - 14, 4, bx, by - 14, 34);
      g.addColorStop(0, `rgba(255, 60, 40, ${pulse})`);
      g.addColorStop(1, "rgba(255, 60, 40, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(bx - 40, by - 50, 80, 64);
    }
    // 경고: 단계가 오를수록 자주·여러 개
    const every = phase === 0 ? 1600 : phase === 1 ? 1000 : 700;
    const cyc = t % every;
    if (t > 600 && t < end && cyc < 620) {
      const n = 1 + phase;
      for (let i = 0; i < n; i++) {
        const cx = 40 + ((Math.floor(t / every) * 37 + i * 53) % 100);
        const cy = 40 + ((Math.floor(t / every) * 23 + i * 29) % 44);
        telegraph(ctx, { kind: "circle", r: 13 }, cx, cy, 0, cyc / 620, now);
      }
    }
    // 졸개 (단계가 오를 때 나온다)
    enter.forEach((at, i) => {
      if (t < at || t >= end) return;
      const k = span(t, at, 900);
      monster(ctx, "scope_creep", k < 1 ? moveFrame(t) : idleFrame(t + i * 100), lerp(DEMO_W + 8, 100 - i * 6, k), 44 + i * 34, true, k < 1 ? k * 2 : 1);
    });
    const hits = Array.from({ length: 12 }, (_, i) => 400 + i * 400).filter((h) => h < end);
    monster(ctx, "prod_dragon", hurtAt(t, hits) ? MON_FRAMES.hurt : idleFrame(t), bx, by, true);
    avatar(ctx, px, py, "right", "idle", t);
    hits.forEach((h, i) => {
      motion(ctx, t, h - 80, "thrust", px + 4, py - 9, -0.15, 44, (i + 1) % FINISHER_EVERY === 0);
      hit(ctx, t, h, bx - 10, by - 18, String(40 + ((i * 7) % 15)));
    });
    // 이름 + HP 막대
    ctx.fillStyle = "rgba(14, 12, 18, 0.6)";
    ctx.fillRect(0, 0, DEMO_W, 16);
    text(ctx, "우두머리", 4, 5, "#ffd04a", { size: 10, align: "left" });
    bar(ctx, 40, 4, 132, 4, hp, phase === 0 ? "#e05a4a" : phase === 1 ? "#ff7a3a" : "#ff3b30");
    for (const p of DEFAULT_BOSS_PHASES) {
      ctx.fillStyle = "#f2ead3";
      ctx.fillRect(40 + Math.round(132 * p.below), 3, 1, 6);
    }
    const shout = enter.findIndex((at) => t >= at && t < at + 900);
    if (shout >= 0) text(ctx, DEFAULT_BOSS_PHASES[shout].label, bx - 6, by - 44, Math.floor(now / 120) % 2 ? "#ff6a50" : "#ffd04a", { size: 13 });
    text(ctx, phase === 0 ? "HP를 깎으면…" : `HP ${Math.round(DEFAULT_BOSS_PHASES[phase - 1].below * 100)}% 아래 · 패턴↑ 졸개↑`, DEMO_W / 2, 90, "#ffb0a0", { size: 10 });
  },
};

/** 6쪽: 상태 이상 4가지를 차례로 (머리 위 아이콘 + 남은 시간) */
const STATES: { id: SkillId; name: string }[] = [
  { id: "rollback", name: "무적 — 깜빡이며 피해 0" },
  { id: "cache_hit", name: "빨라짐" },
  { id: "pair_prog", name: "도우미 — 같이 때려요" },
  { id: "code_review", name: "약화 — 몬스터가 느려져요" },
];
const SSEG = 1700;
const status: Scene = {
  period: STATES.length * SSEG,
  still: 700,
  draw(ctx, t, now) {
    floor(ctx);
    const k = Math.floor(t / SSEG);
    const st = STATES[k];
    const u = t - k * SSEG;
    const py = 60;
    let px = 70;
    if (k === 0) {
      // 무적: 몬스터가 쳐도 0
      const hits = [600, 1200];
      monster(ctx, "scope_creep", hits.some((h) => u >= h - 200 && u < h) ? MON_FRAMES.attack + 1 : idleFrame(t), 92, py, true);
      avatar(ctx, px, py, "right", "idle", t, Math.floor(now / 70) % 2 ? 0.35 : 1);
      hits.forEach((h) => floatNum(ctx, u, h, "0", px, py - 26, "#bcd8ff"));
    } else if (k === 1) {
      // 빨라짐: 뛰며 잔상
      px = lerp(24, 150, u / SSEG);
      for (let i = 3; i >= 1; i--) avatar(ctx, px - i * 9, py, "right", "run", t - i * 40, 0.12 * (4 - i));
      avatar(ctx, px, py, "right", "run", t);
    } else if (k === 2) {
      // 도우미 유령이 곁에서 같이 공격
      const hits = [400, 900, 1400];
      monster(ctx, "endless_meeting", hurtAt(u, hits) ? MON_FRAMES.hurt : idleFrame(t), 106 + knock(u, hits), py, true);
      const gy = py - 14 + Math.sin(now / 200) * 2;
      avatar(ctx, px + 6, gy, "right", "idle", t, 0.45);
      avatar(ctx, px, py, "right", "idle", t);
      hits.forEach((h, i) => {
        motion(ctx, u, h - 100, "swing", px + 4, py - 9, 0, 26);
        if (i !== 1) motion(ctx, u, h - 60, "combo", px + 10, gy - 9, 0.3, 22);
        hit(ctx, u, h, 106, py - 10, String(12 + i));
      });
    } else {
      // 약화: 보라 고리가 퍼지고 몬스터가 느릿느릿
      const r = span(u, 150, 400);
      if (u >= 150 && r < 1) {
        ctx.strokeStyle = `rgba(190, 120, 255, ${1 - r})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px, py - 4, 10 + r * 56, (10 + r * 56) * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const slow = u > 500;
      const mx = 150 - (slow ? 30 + (u - 500) * 0.012 : u * 0.06);
      monster(ctx, "req_change", slow ? MON_FRAMES.move + (Math.floor(t / 330) % 4) : moveFrame(t), mx, py - 4, true);
      if (slow) {
        icon(ctx, skillArt("code_review"), mx - 6, py - 38, 12);
        text(ctx, "느려짐", mx, py - 44, "#d8b0ff", { size: 10 });
      }
      avatar(ctx, px, py, "right", "idle", t);
    }
    // 머리 위·화면 위 상태 표시 (아이콘 + 남은 시간)
    label(ctx, st.name);
    if (k < 3) icon(ctx, skillArt(st.id), px - 6, py - 44, 12);
    icon(ctx, skillArt(st.id), 4, 16, 16);
    bar(ctx, 22, 26, 30, 2, 1 - u / SSEG, "#e8c66a");
  },
};

/** 7쪽: 처치 → 동전·경험치 구슬이 빨려 오고, 장비가 떨어진다 */
const drops: Scene = {
  period: 4600,
  still: 1700,
  draw(ctx, t) {
    floor(ctx);
    const py = 62;
    const walk = span(t, 2500, 500);
    const px = lerp(56, 92, walk);
    const mx = 88;
    const hits = [500, 900];
    const fx = getArt().fx;
    if (t < 1000) monster(ctx, "scope_creep", hurtAt(t, hits) ? MON_FRAMES.hurt : idleFrame(t), mx + knock(t, hits), py, true);
    else if (t < 1420) monster(ctx, "scope_creep", MON_FRAMES.death + Math.min(2, Math.floor((t - 1000) / 140)), mx, py, true, t > 1280 ? 0.6 : 1);
    hits.forEach((h, i) => {
      motion(ctx, t, h - 100, "swing", 60, py - 9, 0, 26);
      hit(ctx, t, h, mx, py - 8, i ? "처치" : "16", !!i);
    });
    // 장비: 튀어 올랐다 바닥에 떨어져 반짝
    const gearArt = GEAR.find((g) => g.kind === "acc")?.art;
    if (t >= 1050 && t < 3000) {
      const k = span(t, 1050, 500);
      const gx = lerp(mx, 110, k);
      const gy = py - 6 - Math.sin(k * Math.PI) * 18;
      shadow(ctx, gx, py, 5);
      icon(ctx, gearArt, gx - 6, gy - 6, 12);
      if (k >= 1 && Math.floor(t / 160) % 2) {
        ctx.fillStyle = "#fff6c8";
        ctx.fillRect(Math.round(gx + 5), Math.round(gy - 7), 1, 3);
        ctx.fillRect(Math.round(gx + 4), Math.round(gy - 6), 3, 1);
      }
    }
    // 동전·구슬: 사방으로 튀었다가 나에게 빨려 온다
    for (let i = 0; i < 6; i++) {
      const out = span(t, 1050, 420);
      const suck = span(t, 1650, 380);
      if (t < 1050 || suck >= 1) continue;
      const a = -Math.PI / 2 + (i - 2.5) * 0.55;
      const ox = mx + Math.cos(a) * 18 * out;
      const oy = py - 8 + Math.sin(a) * 12 * out - Math.sin(out * Math.PI) * 6;
      const x = lerp(ox, 56, suck * suck);
      const y = lerp(oy, py - 10, suck * suck);
      if (i % 2) frameAt(ctx, fx.coin, Math.floor(t / 120) % 2, x, y);
      else frameAt(ctx, fx.orb, 0, x, y);
    }
    floatNum(ctx, t, 2000, "+EXP", 56, py - 26, "#bdf08a");
    floatNum(ctx, t, 2150, "+P", 56, py - 34, "#ffd04a");
    avatar(ctx, px, py, "right", t >= 2500 && t < 3000 ? "walk" : "idle", t);
    if (t >= 3000 && t < 4000) {
      icon(ctx, gearArt, px - 6, py - 44 - span(t, 3000, 300) * 4, 12);
      text(ctx, "장비를 주웠어요!", px, py - 52, "#ffd04a", { size: 11 });
    }
    text(ctx, `${t < 2500 ? "잡을수록 드롭 기회" : "가방에 쏙"}`, DEMO_W / 2, 90, "#c8d8b8", { size: 10 });
  },
};

/** 안내서 쪽 순서와 같다 */
export const DEMO_SCENES: readonly Scene[] = [moveAttack, skillPotion, weapons, patterns, boss, status, drops];

/** 한 장면을 그린다 (ctx는 DEMO_W·H × DEMO_SCALE 크기). reduced면 대표 장면 한 장 */
export function drawDemo(ctx: CanvasRenderingContext2D, page: number, now: number, reduced: boolean): void {
  const s = DEMO_SCENES[page];
  if (!s) return;
  ctx.setTransform(DEMO_SCALE, 0, 0, DEMO_SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const t = reduced ? s.still : now % s.period;
  s.draw(ctx, t, reduced ? s.still : now);
}
