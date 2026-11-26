// 11/26 캠핑장 폭포 계곡 그림 (6차 시안에서 옮김): 폭포 절벽·물줄기(움직이는 시트)·거품·물보라·무지개·카라반 셋(티어드롭·에어스트림·버스 개조)·차양·번호 팻말·폭포 다리.
// 캠핑장 그림 규칙 그대로 (campArt): 코드로 그린 픽셀, 윤곽 0x2c2018, 왼쪽 위 빛, 바닥 그림자 타원, 원점 = 바닥 가운데.
// 겨울 판: 지붕·윗면 눈은 winterArt(snowRoof·snowCap)를 그대로 쓴다.

import { darken, Grid, hash2, lighten, mix, rng, vnoise, type Color } from "../sprites/pixel";
import { ICE, SNOW } from "../sprites/winterArt";
import * as L from "./campLayout";

const OUT = 0x2c2018;
const SNOW_EDGE = 0x55606c;
const WOOD = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e } as const;
const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228, ring: 0xe0c08a } as const;
const COLD = { deep: 0x24485a, mid: 0x2e5a6c, light: 0x7aaabc, foam: 0xdcecf2 } as const;

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, a);
    }
}
function frame(g: Grid, x: number, y: number, w: number, h: number, c: Color): void {
  g.hline(x, x + w - 1, y, c);
  g.hline(x, x + w - 1, y + h - 1, c);
  g.vline(x, y, y + h - 1, c);
  g.vline(x + w - 1, y, y + h - 1, c);
}
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
}
const DIGITS: readonly string[] = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function drawNumber(g: Grid, n: number, x: number, y: number, c: Color): void {
  String(n)
    .split("")
    .forEach((ch, i) => {
      const bits = DIGITS[Number(ch)];
      for (let k = 0; k < 15; k++) if (bits[k] === "1") g.set(x + i * 4 + (k % 3), y + Math.floor(k / 3), c);
    });
}

// ════════════════════════ 폭포 절벽 ════════════════════════

/** 절벽 그림 자리 (왼쪽 위 원점, 월드 좌표) */
export const CLIFF_BOX = { x: L.CLIFF_X0 - 2, y: 0, w: L.CLIFF_X1 - L.CLIFF_X0 + 4, h: 300 } as const;

/** 물줄기에서 가로로 얼마나 떨어졌는지 (y가 그 줄기 높이 안일 때만) */
function strandDist(x: number, y: number, snowy = true): number {
  let best = 99;
  for (const s of L.FALLS) {
    if (y < s.top - 2 || y > s.bottom + 2) continue;
    const t = Math.max(0, Math.min(1, (y - s.top) / (s.bottom - s.top)));
    const xl = s.xt[0] + (s.xb[0] - s.xt[0]) * t * t;
    const xr = s.xt[1] + (s.xb[1] - s.xt[1]) * t * t;
    const d = x < xl ? xl - x : x > xr ? x - xr : 0;
    if ((s.kind !== "ice" || !snowy) && d < best) best = d;
  }
  return best;
}

const ROCK = { hi: 0xcac5ba, mid: 0xa39e95, lo: 0x807b75, deep: 0x625f66, crev: 0x3c3a44 } as const;
const MOSS = { hi: 0x9aa65a, mid: 0x7c8a4a, lo: 0x5a6a3a } as const;
/** 2×2 순서 디더 (픽셀 그림 명암 단계 사이를 부드럽게) */
const BAYER = [0, 0.5, 0.75, 0.25];

/** 바위 덩이 높이 (세로로 길쭉한 큰 덩어리 — 기둥처럼 불룩한 면) */
function rockH(m: L.Mass, x: number, y: number): number {
  return vnoise(x, y * 0.3, 44, 941 + m.seed) * 0.72 + vnoise(x, y * 0.45, 18, 947 + m.seed) * 0.28;
}
/** 층 턱 (덩이마다 2~3줄, 군데군데 끊긴다): 그 x에서 턱의 y (없으면 null) */
function ledgesAt(m: L.Mass, x: number, faceTop: number, base: number): number[] {
  const out: number[] = [];
  const n = m.id === "M0" ? 4 : 3;
  for (let k = 0; k < n; k++) {
    if (vnoise(x, k * 50, 40, 961 + m.seed) < 0.3) continue;
    const t = (k + 1) / (n + 1) + (hash2(k, m.seed, 963) - 0.5) * 0.12;
    out.push(Math.round(faceTop + (base - faceTop) * t + Math.sin(x * 0.05 + k * 2 + m.seed) * 3 + (vnoise(x, k, 9, 965) - 0.5) * 4));
  }
  return out;
}
/** 큰 금 (덩이마다 몇 줄만) */
function cracksOf(m: L.Mass): { x: number; y0: number; y1: number }[] {
  const r = rng(971 + m.seed * 13);
  const out: { x: number; y0: number; y1: number }[] = [];
  const n = m.id === "M0" ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const x = Math.round(m.x0 + 20 + r() * (m.x1 - m.x0 - 40));
    if (Math.abs(x - L.FALL_X) < 46 && m.id === "M0") continue;
    const y0 = m.cap + m.thick + 8 + Math.round(r() * 40);
    out.push({ x, y0, y1: y0 + 20 + Math.round(r() * 50) });
  }
  return out;
}

/**
 * 절벽: 바위 덩이(MASSES)를 뒤 → 앞으로 겹쳐 그린다. 덩이마다
 *  - 윗면: 눈 덮인 마루 (일반 판은 풀·낙엽 마루) + 앞 끝 눈 처마·고드름
 *  - 앞면: 조각 이음매 없이 큰 덩어리 명암 — 세로로 불룩한 바위 높이 마당의 기울기로 왼쪽 위 빛을 받는다(볕·그늘이 크게 번진다)
 *    층 턱은 2~3줄만 군데군데 (윗면 눈/이끼 + 밑 그늘 + 고드름), 큰 금은 몇 줄, 밑으로 갈수록·덩이 오른쪽 끝일수록 그늘
 *  - 테두리: 윤곽색 한 줄
 * 가운데 덩이 윗면은 위 마루 강이 가로질러 폭포 입구로. 1단 물줄기 아래 둥근 바위 혹 (거품은 위에 따로).
 */
export function cliffArt(snowy = true): Grid {
  const B = CLIFF_BOX;
  const g = new Grid(B.w, B.h);
  for (const m of L.MASSES) {
    const tmp = new Grid(B.w, B.h);
    const cracks = cracksOf(m);
    for (let wx = m.x0; wx <= m.x1; wx++) {
      const cap = L.massCap(m, wx);
      const base = L.massBase(m, wx);
      const faceTop = cap + m.thick + Math.round((hash2(wx >> 2, m.seed, 957) - 0.5) * 2);
      const rel = (wx - m.x0) / (m.x1 - m.x0);
      const side = rel < 0.18 ? (0.18 - rel) * 1.4 : rel > 0.7 ? -(rel - 0.7) * 1.5 : 0;
      const river = m.id === "M0" ? Math.abs(wx - L.upperRiverX(cap + 4)) : 99;
      const ledges = ledgesAt(m, wx, faceTop, base);
      const crackL = cracks.filter((c) => Math.abs(wx - c.x) <= 12);
      for (let wy = cap; wy < base; wy++) {
        let c: Color;
        let soft = false; // 눈·이끼·얼음 (명암을 다시 칠하지 않는다)
        if (wy < faceTop) {
          // 윗면
          soft = true;
          const k = (wy - cap) / Math.max(1, faceTop - cap);
          if (river < L.UPPER_RIVER_HW - 1) c = river > L.UPPER_RIVER_HW - 4 ? (snowy ? ICE.mid : 0x6cb4c0) : hash2(wx, wy >> 1, 963) < 0.2 ? COLD.light : snowy ? COLD.mid : 0x4a92a4;
          else if (snowy) c = k > 0.86 ? SNOW.lo : hash2(wx >> 2, wy >> 1, 965 + m.seed) < 0.05 ? ROCK.lo : vnoise(wx, wy, 9, 967) > 0.55 ? SNOW.hi : SNOW.mid;
          else c = k > 0.8 ? MOSS.lo : hash2(wx >> 1, wy >> 1, 969) < 0.18 ? [0xd65632, 0xe68a38, 0xf2c444][Math.floor(hash2(wx, wy, 970) * 3)] : vnoise(wx, wy, 7, 967) > 0.5 ? MOSS.hi : MOSS.mid;
        } else {
          const v = (wy - faceTop) / Math.max(1, base - faceTop);
          const h = (xx: number, yy: number) => rockH(m, xx, yy);
          const dhx = h(wx + 2, wy) - h(wx - 2, wy);
          const dhy = h(wx, wy + 2) - h(wx, wy - 2);
          let lit = 0.5 + (0.55 * dhx + 0.65 * dhy) * 11 + (h(wx, wy) - 0.5) * 0.2;
          // 빗물 자국 (세로로 옅게 어두운 줄 — 바위 결)
          if (vnoise(wx * 3, wy * 0.08, 6, 951 + m.seed) > 0.72) lit -= 0.08;
          lit += side * 0.9 - Math.pow(v, 1.5) * 0.42 + 0.06;
          if (m.id === "M0") lit -= 0.12;
          lit = 0.5 + (lit - 0.5) * 1.28;
          // 6차 층리 (가로 결): 결마다 어두운 이음 줄 + 그 아래 볕 받는 입술 + 다음 줄로 갈수록 그늘
          const sy = wy + Math.sin(wx * 0.045 + m.seed) * 4 + (vnoise(wx, 0, 26, 990 + m.seed) - 0.5) * 10 + (vnoise(wx, wy, 11, 989 + m.seed) - 0.5) * 3;
          const bandH = m.id === "M0" ? 14 : 11;
          const band = ((sy % bandH) + bandH) % bandH;
          const strataOn = vnoise(wx, Math.floor(sy / bandH) * 7, 16, 991 + m.seed) > (m.id === "M0" ? 0.5 : 0.36);
          if (strataOn) {
            if (band < 1) lit -= 0.26;
            else if (band < 2) lit += 0.13;
            else if (band > bandH - 4) lit -= 0.035 * (band - (bandH - 4));
          }
          // 결 사이 세로 이음매 (블록처럼 쪼개진 면 — 이음 왼쪽은 밝게, 오른쪽 끝은 그늘)
          const blk = Math.floor(sy / bandH);
          const jw = 30 + Math.floor(hash2(blk, m.seed, 993) * 30);
          const jx = (((wx + Math.floor(hash2(blk, m.seed, 995) * 40)) % jw) + jw) % jw;
          const jointOn = hash2(Math.floor((wx + Math.floor(hash2(blk, m.seed, 995) * 40)) / jw), blk, 997 + m.seed) < 0.3;
          if (jointOn && band >= 1) {
            if (jx === 0) lit -= 0.24;
            else if (jx === 1) lit += 0.1;
            else if (jx >= jw - 3) lit -= 0.05;
          }
          const q = lit + (BAYER[(wx & 1) + (wy & 1) * 2] - 0.375) * 0.07;
          c = q > 0.8 ? lighten(ROCK.hi, 0.06) : q > 0.66 ? ROCK.hi : q > 0.52 ? mix(ROCK.hi, ROCK.mid, 0.5) : q > 0.38 ? ROCK.mid : q > 0.25 ? ROCK.lo : q > 0.12 ? ROCK.deep : mix(ROCK.deep, ROCK.crev, 0.6);
          // 결 입술에 낀 눈 / 이끼 (군데군데)
          if (strataOn && band >= 1 && band < 2.2 && hash2(wx >> 1, Math.floor(sy), 999 + m.seed) < 0.22 && v > 0.05) {
            soft = true;
            c = snowy ? SNOW.mid : hash2(wx, wy, 1001) < 0.5 ? MOSS.mid : MOSS.hi;
          }
          // 층 턱: 윗면(눈·이끼) 1~2줄 + 밑 그늘 + 턱 아래 살짝 어두운 띠
          for (const ly of ledges) {
            const d = wy - ly;
            const tuft = !snowy && d === -2 && hash2(wx, ly, 1003) < 0.35;
            if (d === -2 && (snowy ? hash2(wx >> 1, ly, 1005) < 0.6 : tuft)) {
              soft = true;
              c = snowy ? SNOW.hi : hash2(wx, ly, 1007) < 0.5 ? MOSS.hi : 0xb4b45a;
            } else if (d === -1 || d === 0) {
              soft = true;
              c = snowy ? (d === -1 ? SNOW.hi : SNOW.lo) : d === -1 ? MOSS.hi : MOSS.mid;
            } else if (d === 1) c = ROCK.crev;
            else if (d === 2) c = mix(c, ROCK.crev, 0.6);
            else if (d > 2 && d < 9) c = mix(c, 0x262c3a, 0.46 - d * 0.05);
            // 이끼가 턱 아래로 흘러내린 자국 (일반 판)
            if (!snowy && d > 1 && d < 3 + hash2(wx >> 1, ly, 1009) * 8 && hash2(wx >> 1, ly, 1011) < 0.18) {
              soft = true;
              c = d < 4 ? MOSS.mid : MOSS.lo;
            }
            // 고드름
            const ic = hash2(wx, ly, 975);
            if (snowy && ic < 0.14 && d >= 1 && d < 2 + ic * 30) {
              soft = true;
              c = d < 3 ? ICE.hi : ICE.mid;
            }
          }
          // 큰 금 (어두운 줄 + 왼쪽 볕 한 줄)
          for (const crack of crackL) {
            if (wy < crack.y0 || wy > crack.y1) continue;
            const cxp = crack.x + Math.round(Math.sin(wy * 0.17 + crack.x) * 2 + (wy - crack.y0) * 0.06);
            const wide = wy - crack.y0 < (crack.y1 - crack.y0) * 0.5 ? 1 : 0;
            if (wx >= cxp && wx <= cxp + wide) c = ROCK.crev;
            else if (wx === cxp - 1) c = mix(c, 0xf2eee6, 0.32);
            else if (wx === cxp + wide + 1) c = mix(c, ROCK.crev, 0.35);
            // 갈래 (가운데쯤에서 비스듬히)
            const by = Math.round((crack.y0 + crack.y1) / 2);
            const bl = wy - by;
            if (bl >= 0 && bl < 10 && wx === cxp + 1 + bl * (crack.x % 2 ? 1 : -1)) c = ROCK.crev;
          }
          // 눈 처마 밑 (윗면 바로 아래) + 고드름
          if (wy - faceTop < 2) c = wy === faceTop ? (snowy ? SNOW_EDGE : 0x3a3428) : mix(c, ROCK.crev, 0.5);
          const ic = hash2(wx, m.seed, 975);
          if (snowy && ic < 0.2 && wy - faceTop >= 1 && wy - faceTop < 2 + ic * 22) {
            soft = true;
            c = wy - faceTop < 3 ? ICE.hi : ICE.mid;
          }
          if (!soft) {
            // 가운데 뒤 벽은 물보라에 젖어 차갑다
            if (m.id === "M0") c = mix(c, 0x34465a, 0.28);
            // 물줄기 둘레는 젖어 짙고 번들거린다
            const sd = strandDist(wx, wy, snowy);
            if (sd < 9) {
              const k = 1 - sd / 9;
              c = mix(c, 0x1c2a36, 0.55 * k);
              if (hash2(wx, wy, 977) < 0.06 * k) c = 0xb8dcea;
            }
            if (base - wy <= 2) c = mix(c, 0x161c26, base - wy === 1 ? 0.6 : 0.35);
          }
        }
        tmp.set(wx - B.x, wy - B.y, c);
      }
      // 윗면 앞 끝 처마 (늘어진 눈 / 늘어진 풀)
      const drape = Math.floor(vnoise(wx, m.seed, 4, 979) * 3);
      const fy = cap + m.thick + Math.round((hash2(wx >> 2, m.seed, 957) - 0.5) * 2);
      for (let k = 0; k < drape; k++) tmp.set(wx - B.x, fy + k - B.y, snowy ? (k === drape - 1 ? SNOW.lo : SNOW.mid) : k === drape - 1 ? MOSS.lo : MOSS.mid);
    }
    tmp.outline(snowy ? 0x3e4452 : 0x3a3428);
    g.draw(tmp, 0, 0);
  }
  // 둥근 바위 혹 (1단 물줄기가 부딪는 자리 — 젖어 짙고 왼쪽 위만 번들)
  const K = L.KNOB;
  const knob = new Grid(B.w, B.h);
  for (let y = Math.floor(K.y - K.ry); y <= Math.ceil(K.y + K.ry); y++)
    for (let x = Math.floor(K.x - K.rx); x <= Math.ceil(K.x + K.rx); x++) {
      const dx = (x + 0.5 - K.x) / K.rx;
      const dy = (y + 0.5 - K.y) / K.ry;
      const q = dx * dx + dy * dy;
      if (q > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - q));
      const lit = (0.55 * -dx + 0.65 * -dy) * 0.5 + nz * 0.45 + (BAYER[(x & 1) + (y & 1) * 2] - 0.375) * 0.12;
      let c: Color = lit > 0.62 ? ROCK.hi : lit > 0.42 ? ROCK.mid : lit > 0.22 ? ROCK.lo : ROCK.deep;
      c = mix(c, 0x1c2a36, 0.38);
      if (lit > 0.7 && hash2(x, y, 981) < 0.3) c = 0xb8dcea;
      knob.set(x - B.x, y - B.y, c);
    }
  knob.outline(0x1e2430);
  g.draw(knob, 0, 0);
  return g;
}

// ════════════════════════ 물줄기 (움직이는 시트) ════════════════════════

export const FALLS_BOX = { x: 506, y: -12, w: 298, h: 234 } as const;
export const FALL_FRAMES = 8;
/** 한 프레임에 줄무늬가 내려가는 픽셀 (주기 48 = 8 × 6 → 8장이 이음매 없이 돈다) */
const FALL_STEP = 6;
const FALL_P = FALL_FRAMES * FALL_STEP;
const WATER = { glass: 0x3a6c84, glassHi: 0x9ad0e0, body: 0xbfe2ee, dark: 0x7fb2c8, light: 0xeaf7fa, white: 0xffffff, edge: 0x4e82a0 } as const;

function strandEdges(s: L.FallStrand, y: number, f: number): [number, number] {
  const t = (y - s.top) / (s.bottom - s.top);
  const sid = s.id.charCodeAt(0) * 7 + s.id.length;
  const wob = s.kind === "ice" ? 0 : Math.sin(y * 0.21 + f * ((Math.PI * 2) / FALL_FRAMES)) * 0.6 * t;
  let xl = s.xt[0] + (s.xb[0] - s.xt[0]) * t * t + wob;
  let xr = s.xt[1] + (s.xb[1] - s.xt[1]) * t * t + wob;
  // 가장자리가 곧은 자가 아니게: 줄마다 조금씩 들쭉날쭉 (아래로 갈수록 더)
  xl += (hash2(y >> 1, sid, 53) - 0.5) * (0.6 + t * 2.2);
  xr += (hash2(y >> 1, sid, 57) - 0.5) * (0.6 + t * 2.2);
  // 입구: 물이 턱을 넘으며 불룩하게 퍼진다
  const ly = y - s.top;
  if (s.id === "f1" && ly < 6) {
    const k = (6 - ly) / 6;
    xl -= k * 1.2;
    xr += k * 1.2;
  }
  // 가는 줄기는 중간 턱에서 한 번 옆으로 꺾인다
  if (s.id === "rib" && y > 150) {
    xl += 4;
    xr += 4;
  }
  return [xl, xr];
}

function drawStrand(g: Grid, ox: number, s: L.FallStrand, f: number): void {
  const len = s.bottom - s.top;
  const sid = s.id.charCodeAt(0) * 7 + s.id.length;
  for (let y = s.top; y <= s.bottom; y++) {
    const t = (y - s.top) / len;
    const [xl, xr] = strandEdges(s, y, f);
    // 떨어질수록 빨라진다: 위상 g(y)의 기울기가 줄어든다 (줄무늬가 아래로 갈수록 길쭉)
    const gy = (y - s.top) - (0.32 * (y - s.top) ** 2) / (2 * len);
    const ph = (((gy - f * FALL_STEP) % FALL_P) + FALL_P) % FALL_P;
    for (let x = Math.floor(xl); x <= Math.ceil(xr); x++) {
      const e = Math.min(x - xl, xr - x);
      if (e < -0.4) continue;
      // 2단은 둥근 바위 혹 앞 둥근 테를 넘어 떨어진다 (가운데가 더 아래에서 시작 — 반듯한 윗선이 없게)
      if (s.id === "f2a" || s.id === "f2b") {
        const kx = (x + 0.5 - L.KNOB.x) / (L.KNOB.rx + 4);
        if (y < L.KNOB.y - L.KNOB.ry * 0.85 * Math.sqrt(Math.max(0, 1 - kx * kx)) + 2 + (hash2(x, 0, 73) - 0.5) * 1.5) continue;
      }
      const col = Math.floor((x - s.xt[0]) / 2);
      let c: Color = WATER.body;
      let a = 255;
      if (s.kind === "thin") {
        // 가는 줄기: 끊어지는 물방울 줄
        const on = (ph + col * 13) % 16 < 11;
        if (!on) continue;
        c = (ph + col * 5) % 16 < 4 ? WATER.white : WATER.light;
        a = 235;
      } else {
        // 굵은 물: 1px 세로 줄무늬 (줄마다 다른 자리·길이) + 아래로 내려가는 옅은 물결 띠
        const cc = x - Math.floor(s.xt[0]);
        for (let k = 0; k < 3; k++) {
          const st = hash2(cc, k, sid) * FALL_P;
          const ln = 4 + hash2(cc, k + 9, sid) * (k === 2 ? 7 : 15);
          const d = (((ph - st) % FALL_P) + FALL_P) % FALL_P;
          if (d < ln) {
            c = k === 2 ? WATER.dark : d < 2 ? WATER.white : WATER.light;
            break;
          }
        }
        // 물결 띠: 주기 안에 두 번, 줄마다 살짝 휘어
        const band = (((ph + Math.sin(cc * 0.7) * 2) % (FALL_P / 2)) + FALL_P / 2) % (FALL_P / 2);
        if (band < 2 && c === WATER.body) c = WATER.light;
        // 입구: 강물이 턱을 넘는 매끈한 띠 → 금방 하얗게 부서진다
        const ly = y - s.top;
        if (s.id === "f1") {
          if (ly < 2) c = COLD.mid;
          else if (ly === 2) c = WATER.glassHi;
          else if (ly < 5 && c === WATER.body) c = mix(WATER.glass, WATER.body, (ly - 2) / 3);
        } else if (ly < 4) c = hash2(x, ly + f, 71) < 0.6 ? WATER.white : WATER.light; // 선반 거품에서 바로 하얗게
        // 아래쪽은 물거품으로 하얗게 (공기가 섞인다)
        if (t > 0.7) c = mix(c, WATER.white, (t - 0.7) * 1.7);
        // 가장자리: 얇게 비치는 테 (프레임마다 조금씩 흔들려 하늘거린다)
        const fe = e + (hash2(y, f, sid + 61) - 0.5) * 0.9;
        if (fe < 0.5) {
          c = mix(WATER.edge, WATER.light, hash2(y, f, sid + 67));
          a = 170;
        } else if (fe < 1.5) c = mix(c, WATER.edge, 0.3);
      }
      g.set(ox + x - FALLS_BOX.x, y - FALLS_BOX.y, c, a);
    }
    // 바깥 물방울 (아래로 갈수록 많이 튄다 — 프레임마다 다르게)
    if (s.kind === "main" && t > 0.3) {
      for (const side of [-1, 1]) {
        if (hash2(y, f * 3 + (side > 0 ? 1 : 0), sid + 31) < 0.12 + t * 0.25) {
          const x = side < 0 ? Math.floor(xl) - 1 - Math.floor(hash2(y, f, 43) * 2) : Math.ceil(xr) + 1 + Math.floor(hash2(y, f, 47) * 2);
          g.set(ox + x - FALLS_BOX.x, y - FALLS_BOX.y, WATER.light, 200);
        }
      }
    }
  }
  // 가는 줄기 꺾이는 턱의 작은 튐
  if (s.id === "rib") for (let k = 0; k < 5; k++) g.set(ox + 518 + k - FALLS_BOX.x, 150 + (k % 2) - FALLS_BOX.y, hash2(k, f, 51) < 0.6 ? WATER.white : WATER.light);
}

/** 얼어붙은 줄기 (움직이지 않는다): 길고 짧은 고드름 기둥이 늘어진 얼음 커튼 + 밑동 얼음 무덤 */
function drawIce(g: Grid, ox: number, s: L.FallStrand): void {
  const r = rng(961);
  const len = s.bottom - s.top;
  for (let x = s.xb[0]; x < s.xb[1]; ) {
    const w = 2 + Math.floor(r() * 4);
    const mid = 1 - Math.abs((x + w / 2 - (s.xb[0] + s.xb[1]) / 2) / ((s.xb[1] - s.xb[0]) / 2));
    // 가운데 기둥은 바닥까지 (얼어붙은 물줄기), 가장자리는 짧은 고드름
    const reach = mid > 0.55 && r() < 0.8 ? 1 : 0.25 + r() * 0.6 * (0.4 + mid);
    const y0 = s.top + Math.floor(r() * 5);
    const y1 = s.top + Math.floor(len * reach);
    for (let y = y0; y <= y1; y++) {
      const toEnd = y1 - y;
      const taper = reach < 1 && toEnd < w * 3 ? Math.max(1, Math.round((toEnd / (w * 3)) * w)) : w;
      const bulge = reach >= 1 && Math.sin(y * 0.13 + x) > 0.75 ? 1 : 0;
      const ww = Math.min(w + bulge, taper + bulge);
      const x0 = x + Math.floor((w - ww) / 2);
      for (let i = 0; i < ww; i++) {
        const c = i === 0 ? ICE.hi : i === ww - 1 ? ICE.lo : hash2(x0 + i, y >> 2, 963) < 0.25 ? 0xffffff : ICE.mid;
        g.set(ox + x0 + i - FALLS_BOX.x, y - FALLS_BOX.y, y - y0 < 2 ? SNOW.hi : c, 245);
      }
      if (ww > 0) {
        g.set(ox + x0 - 1 - FALLS_BOX.x, y - FALLS_BOX.y, 0x6a90a8, 160);
        g.set(ox + x0 + ww - FALLS_BOX.x, y - FALLS_BOX.y, 0x5a7c94, 200);
      }
    }
    x += w + (r() < 0.25 ? 1 : 0);
  }
  // 밑동 얼음 무덤 (떨어진 물이 쌓여 언 덩이)
  const cx = (s.xb[0] + s.xb[1]) / 2;
  for (let y = s.bottom - 8; y <= s.bottom + 2; y++)
    for (let x = s.xb[0] - 6; x <= s.xb[1] + 6; x++) {
      const dx = (x - cx) / ((s.xb[1] - s.xb[0]) / 2 + 6);
      const dy = (y - (s.bottom + 2)) / 10;
      if (dx * dx + dy * dy > 1) continue;
      const c = dy < -0.7 ? SNOW.hi : dx < -0.3 ? ICE.hi : dx > 0.5 ? ICE.lo : ICE.mid;
      g.set(ox + x - FALLS_BOX.x, y - FALLS_BOX.y, c, 250);
    }
}

/** 물줄기 시트 (가로로 FALL_FRAMES장, 한 장 = FALLS_BOX) */
export function fallsSheet(snowy = true): { grid: Grid; frameW: number; frameH: number } {
  const W = FALLS_BOX.w;
  const H = FALLS_BOX.h;
  const g = new Grid(W * FALL_FRAMES, H);
  for (let f = 0; f < FALL_FRAMES; f++)
    for (const s of L.FALLS) {
      // 얼어붙은 줄기는 겨울·크리스마스 판만 (일반 판은 가늘게 흐르는 줄기)
      if (s.kind === "ice" && snowy) drawIce(g, f * W, s);
      else if (s.kind === "ice") drawStrand(g, f * W, { ...s, id: "rib2", kind: "thin", xt: [777, 783], xb: [777, 785] }, f);
      else drawStrand(g, f * W, s, f);
    }
  return { grid: g, frameW: W, frameH: H };
}

// ════════════════════════ 거품 (움직이는 시트) ════════════════════════

export const FOAM_FRAMES = 6;
/** 웅덩이 위 거품 (폭포가 떨어지는 자리) / 선반 위 거품 */
export function foamSheet(w: number, h: number, seed: number, density = 1): { grid: Grid; frameW: number; frameH: number } {
  const g = new Grid(w * FOAM_FRAMES, h);
  for (let f = 0; f < FOAM_FRAMES; f++) {
    const r = rng(seed * 31 + f * 7);
    const ox = f * w;
    const n = Math.round(((w * h) / 34) * density);
    for (let i = 0; i < n; i++) {
      // 가운데로 몰린 거품 덩이 (타원 안에서 고르게)
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      const cx = w / 2 + Math.cos(a) * d * (w / 2 - 3);
      const cy = h / 2 + Math.sin(a) * d * (h / 2 - 2);
      const rr = 1.2 + r() * (3.6 - d * 2);
      for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++)
        for (let x = Math.floor(cx - rr * 1.4); x <= Math.ceil(cx + rr * 1.4); x++) {
          const dx = (x + 0.5 - cx) / (rr * 1.4);
          const dy = (y + 0.5 - cy) / rr;
          const q = dx * dx + dy * dy;
          if (q > 1 || x < 0 || y < 0 || x >= w || y >= h) continue;
          const c = dy < -0.3 ? SNOW.hi : q > 0.7 ? ICE.mid : 0xeef6fa;
          g.set(ox + x, y, c, Math.round(255 * (1 - d * 0.35)));
        }
    }
    // 바깥 물방울 점
    for (let i = 0; i < n / 2; i++) {
      const x = Math.floor(r() * w);
      const y = Math.floor(r() * h);
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h / 2) / (h / 2);
      if (dx * dx + dy * dy < 1.05) g.set(ox + x, y, 0xffffff, 220);
    }
  }
  return { grid: g, frameW: w, frameH: h };
}

/** 물보라 한 점 (2×2) · 물결 고리 (타원 테) */
export function dropArt(): Grid {
  const g = new Grid(2, 2);
  g.rect(0, 0, 2, 2, 0xf2faff);
  g.set(1, 1, 0xc4e0ee);
  return g;
}
export function rippleArt(): Grid {
  const W = 40;
  const H = 14;
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x + 0.5 - W / 2) / (W / 2 - 0.5), (y + 0.5 - H / 2) / (H / 2 - 0.5));
      if (d <= 1 && d > 0.84) g.set(x, y, y < H / 2 ? 0xbfe0ec : 0x8cbccc, y < H / 2 ? 200 : 140);
    }
  return g;
}
/** 무지개 (물안개 속 옅은 호, 아래 가운데 원점) */
export function rainbowArt(): Grid {
  const W = 132;
  const H = 70;
  const g = new Grid(W, H);
  const bands = [0xff7a6a, 0xffb05a, 0xffe27a, 0x8ee08a, 0x7ac8ff, 0xa88cf0];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - W / 2, (y + 0.5 - H) * 1.05);
      const i = Math.floor((64 - d) / 2.2);
      if (i < 0 || i >= bands.length) continue;
      // 양 끝(물안개 밖)으로 갈수록 옅게
      const ang = Math.atan2(H - y, x - W / 2);
      const fade = Math.sin(ang) ** 0.7;
      g.set(x, y, bands[i], Math.round(255 * fade));
    }
  return g;
}

// ════════════════════════ 카라반 셋 ════════════════════════

export type CaravanPal = { body: Color; hi: Color; lo: Color };
export const TEARDROP_PALS: readonly CaravanPal[] = [
  { body: 0x9ed6c0, hi: 0xc4ecdc, lo: 0x6eaa94 }, // 민트
  { body: 0xe8806a, hi: 0xf8aa94, lo: 0xb85a48 }, // 산호
  { body: 0xf0c050, hi: 0xffe08a, lo: 0xc89432 }, // 겨자
  { body: 0x8ac4e8, hi: 0xb8e0f8, lo: 0x5a94bc }, // 하늘
];
export const BUS_PALS: readonly CaravanPal[] = [
  { body: 0x6cb0d4, hi: 0x9cd0ec, lo: 0x4a88ac }, // 하늘
  { body: 0x86b894, hi: 0xaed8b8, lo: 0x5e9070 }, // 세이지
];
export const AIR_ACCENT: readonly Color[] = [0x3a5a8a, 0xc84a3a];
const ALU = { hi: 0xeef2f6, a: 0xd6dce2, b: 0xbcc4cc, c: 0xa2acb6, lo: 0x86909c, seam: 0x98a2ac } as const;
const WIN = { warm: 0xffd890, warm2: 0xffc070, glass: 0x5a7a90, glassHi: 0x9cc4d8, curtain: 0xd8786a } as const;

export type CaravanArt = { grid: Grid; roof: Uint8Array; door: { x: number; y: number }; windows: { x: number; y: number }[] };

/** 지붕 마스크로 눈 얹을 자리 표시 */
function roofMask(g: Grid, test: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.filled(x, y) && test(x, y)) m[y * g.w + x] = 1;
  return m;
}

/** 작은 티어드롭 (앞은 둥글게 솟고 뒤는 물방울처럼 흘러내린다). 문은 오른쪽(차양 쪽) */
export const TEARDROP_W = 56;
export const TEARDROP_H = 42;
export function teardropArt(i: number): CaravanArt {
  const W = TEARDROP_W;
  const H = TEARDROP_H;
  const g = new Grid(W, H);
  const pal = TEARDROP_PALS[i % TEARDROP_PALS.length];
  const x0 = 9;
  const x1 = W - 4;
  const yb = H - 8;
  const hgt = 26;
  const topAt = (x: number): number => {
    const t = (x - x0) / (x1 - x0);
    const sh = t < 0.36 ? Math.sqrt(Math.max(0, 1 - ((0.36 - t) / 0.36) ** 2)) : 1 - ((t - 0.36) / 0.64) ** 2.2 * 0.82;
    return Math.round(yb - hgt * sh);
  };
  for (let x = x0; x <= x1; x++) {
    const ty = topAt(x);
    for (let y = ty; y < yb; y++) {
      const d = y - ty;
      let c: Color = d < 2 ? pal.hi : pal.body;
      if (d === 2) c = mix(pal.hi, pal.body, 0.5);
      if (y >= yb - 6) c = y >= yb - 2 ? ALU.lo : y === yb - 6 ? ALU.hi : ALU.b; // 알루미늄 아래 띠
      g.set(x, y, c);
    }
  }
  // 둥근 창 (불빛) · 문 (둥근 위) · 뒤 짐칸 문 줄
  g.ellipse(x0 + 11, yb - 14, 4.2, 3.6, darken(pal.lo, 0.25));
  g.ellipse(x0 + 11, yb - 14, 3, 2.5, WIN.warm);
  g.set(x0 + 10, yb - 15, 0xfff4d0);
  const dx = x0 + 22;
  g.rect(dx, yb - 18, 9, 17, darken(pal.lo, 0.1));
  g.rect(dx + 1, yb - 17, 7, 15, pal.lo);
  g.rect(dx + 2, yb - 15, 5, 4, WIN.warm2);
  g.set(dx + 6, yb - 8, 0xe8e0d0);
  for (let x = x1 - 12; x <= x1 - 2; x++) {
    const ty = topAt(x) + 3;
    g.set(x, ty + Math.round((x - (x1 - 12)) * 0.4), darken(pal.body, 0.25));
  }
  // 바퀴 + 흙받이
  const wx = x0 + 26;
  g.ellipse(wx, yb + 1, 5, 4, 0x2e2a28);
  g.ellipse(wx, yb + 1, 2, 1.6, 0xb8b4ac);
  for (let x = wx - 6; x <= wx + 6; x++) g.set(x, yb - 4 + Math.round(((x - wx) / 6) ** 2 * 2), ALU.hi);
  // 연결 고리 (앞, 왼쪽) + 받침 바퀴
  line(g, x0, yb - 3, 1, yb, 0x4a4a50);
  line(g, x0, yb - 1, 1, yb, 0x4a4a50);
  g.rect(2, yb, 2, 4, 0x4a4a50);
  g.ellipse(3, yb + 4, 1.6, 1.2, 0x2e2a28);
  // 지붕 등 (작은 환기창)
  const vx = x0 + 18;
  g.rect(vx, topAt(vx) - 1, 6, 2, 0xd8dde2);
  const roof = roofMask(g, (x, y) => y < topAt(x) + 3 && x >= x0 && x <= x1);
  g.outline(OUT);
  shadow(g, (x0 + x1) / 2, yb + 4, (x1 - x0) / 2 + 2, 2.6, 64);
  return { grid: g, roof, door: { x: dx + 4, y: yb }, windows: [{ x: x0 + 11, y: yb - 14 }] };
}

/** 은색 에어스트림 (둥근 빵 모양 알루미늄, 리벳 줄·반사광). 앞은 왼쪽(둘러싼 창) */
export const AIRSTREAM_W = 80;
export const AIRSTREAM_H = 46;
export function airstreamArt(i: number): CaravanArt {
  const W = AIRSTREAM_W;
  const H = AIRSTREAM_H;
  const g = new Grid(W, H);
  const acc = AIR_ACCENT[i % AIR_ACCENT.length];
  const x0 = 7;
  const x1 = W - 4;
  const yt = 9;
  const yb = H - 8;
  const R = 12;
  const inside = (x: number, y: number) => {
    if (x < x0 || x > x1 || y < yt || y >= yb) return false;
    const cx = x < x0 + R ? x0 + R : x > x1 - R ? x1 - R : x;
    const cy = y < yt + R ? yt + R : y;
    if (cx === x && cy === y) return true;
    return Math.hypot((x - cx) / R, (y - cy) / (R * 1.05)) <= 1 || (cy === y && Math.abs(x - cx) <= R && y >= yt + R);
  };
  for (let y = yt; y < yb; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      const v = (y - yt) / (yb - yt);
      let c: Color = v < 0.12 ? ALU.hi : v < 0.3 ? ALU.a : v < 0.55 ? ALU.b : v < 0.8 ? ALU.c : ALU.lo;
      // 하늘 반사 (위쪽 푸르스름) · 눈밭 반사 (아래쪽 밝게)
      if (v > 0.12 && v < 0.4) c = mix(c, 0xb8d4ec, 0.18);
      if (v > 0.86) c = mix(c, 0xdfe8f0, 0.35);
      // 세로 반사광 두 줄
      const rx = (x - x0) / (x1 - x0);
      if (Math.abs(rx - 0.22) < 0.025 || Math.abs(rx - 0.64) < 0.018) c = mix(c, 0xffffff, 0.55);
      // 가로 이음매 + 리벳
      const ly = y - yt;
      if (ly > 2 && ly % 6 === 0) c = (x + ly) % 3 === 0 ? ALU.hi : ALU.seam;
      if ((x - x0) % 13 === 0 && v > 0.15) c = mix(c, ALU.seam, 0.6);
      g.set(x, y, c);
    }
  // 색 띠 (가는 줄)
  for (let x = x0 + 3; x <= x1 - 3; x++) if (inside(x, yb - 9)) g.set(x, yb - 9, acc);
  // 앞 둘러싼 창 (왼쪽 끝 둥근 면)
  for (let y = yt + 8; y < yt + 15; y++)
    for (let x = x0 + 1; x < x0 + 12; x++) if (inside(x - 1, y) && inside(x + 1, y)) g.set(x, y, y === yt + 8 ? WIN.glassHi : WIN.glass);
  // 옆 창 둘 (둥근 모서리, 따뜻한 불빛 + 커튼)
  const wins = [x0 + 22, x0 + 36];
  for (const wx of wins) {
    g.rect(wx, yt + 8, 10, 7, darken(ALU.lo, 0.3));
    g.rect(wx + 1, yt + 9, 8, 5, WIN.warm);
    g.rect(wx + 1, yt + 9, 3, 5, WIN.curtain);
    g.set(wx, yt + 8, ALU.b);
    g.set(wx + 9, yt + 8, ALU.b);
  }
  // 문 (오른쪽, 둥근 위 + 작은 창) + 말아 둔 차양 막대
  const dx = x1 - 20;
  g.rect(dx, yt + 7, 10, yb - yt - 7, darken(ALU.lo, 0.15));
  g.rect(dx + 1, yt + 8, 8, yb - yt - 9, ALU.b);
  g.rect(dx + 2, yt + 10, 6, 4, WIN.warm2);
  g.set(dx + 7, yt + 19, 0xf6f6f0);
  g.rect(dx - 8, yt + 4, 26, 2, acc);
  g.hline(dx - 8, dx + 17, yt + 4, lighten(acc, 0.3));
  // 바퀴 (치마에 반쯤 가린다)
  for (const wx of [x0 + 30, x0 + 40]) {
    g.ellipse(wx, yb + 1, 4.4, 3.6, 0x2e2a28);
    g.ellipse(wx, yb + 1, 1.8, 1.4, 0xc8ccd0);
  }
  g.rect(x0 + 24, yb - 2, 22, 2, ALU.lo);
  // 연결 고리 (앞)
  line(g, x0 + 2, yb - 3, 1, yb, 0x4a4a50);
  g.rect(1, yb, 2, 4, 0x4a4a50);
  // 지붕 환기 상자 · 에어컨
  g.rect(x0 + 30, yt - 2, 12, 3, 0xe4e8ec);
  g.hline(x0 + 30, x0 + 41, yt - 2, 0xffffff);
  const roof = roofMask(g, (_x, y) => y < yt + 3);
  g.outline(OUT);
  shadow(g, (x0 + x1) / 2, yb + 4, (x1 - x0) / 2 + 2, 2.6, 64);
  return { grid: g, roof, door: { x: dx + 5, y: yb }, windows: wins.map((x) => ({ x: x + 5, y: yt + 11 })) };
}

/** 버스 개조 캠핑카 (두 색 몸통, 팝업 지붕 텐트, 지붕 위 스키, 둥근 앞코). 앞은 오른쪽 */
export const BUS_W = 88;
export const BUS_H = 58;
export function busCamperArt(i: number): CaravanArt {
  const W = BUS_W;
  const H = BUS_H;
  const g = new Grid(W, H);
  const pal = BUS_PALS[i % BUS_PALS.length];
  const CREAM = { hi: 0xfcf6e8, mid: 0xf2e8d2, lo: 0xd8cbb0 };
  const x0 = 4;
  const x1 = W - 5;
  const yt = 20;
  const yb = H - 9;
  const mid = yt + 14;
  const nose = 12;
  for (let y = yt; y < yb; y++)
    for (let x = x0; x <= x1; x++) {
      // 앞(오른쪽) 위 모서리 둥글게, 뒤 위 모서리 조금
      const fr = x > x1 - nose && y < yt + nose && Math.hypot(x - (x1 - nose), (y - (yt + nose)) * 1.1) > nose;
      const br = x < x0 + 4 && y < yt + 4 && Math.hypot(x - (x0 + 4), y - (yt + 4)) > 4;
      if (fr || br) continue;
      // 앞코 V자 색 경계 (VW 버스처럼)
      const vx = x - (x1 - 14);
      const split = vx > 0 ? mid - Math.min(6, vx * 0.6) : mid;
      let c: Color = y < split ? (y < yt + 2 ? CREAM.hi : CREAM.mid) : y < split + 1 ? lighten(pal.body, 0.2) : pal.body;
      if (y >= yb - 3) c = pal.lo;
      g.set(x, y, c);
    }
  // 크롬 띠 (몸통 가운데)
  for (let x = x0 + 1; x < x1 - 14; x++) g.set(x, mid, 0xe8ecf0);
  // 옆 창 넷 (불빛 + 커튼)
  const wins: number[] = [x0 + 8, x0 + 22, x0 + 36, x0 + 50];
  for (const wx of wins) {
    g.rect(wx, yt + 3, 11, 8, darken(CREAM.lo, 0.35));
    g.rect(wx + 1, yt + 4, 9, 6, WIN.warm);
    g.rect(wx + 1, yt + 4, 9, 2, WIN.curtain);
    g.set(wx + 2, yt + 6, 0xfff0c8);
  }
  // 앞유리 (둘로 나뉜)
  g.rect(x1 - 11, yt + 4, 10, 7, WIN.glass);
  g.vline(x1 - 6, yt + 4, yt + 10, CREAM.lo);
  g.hline(x1 - 11, x1 - 2, yt + 4, WIN.glassHi);
  // 미닫이 문 (오른쪽 가운데 — 차양 쪽)
  const dx = x0 + 62;
  frame(g, dx, mid + 1, 12, yb - mid - 4, darken(pal.lo, 0.25));
  g.hline(dx + 2, dx + 9, mid + 4, lighten(pal.body, 0.3));
  // 전조등 · 범퍼
  g.ellipse(x1 - 3, yb - 7, 2, 2, 0xfff6d0);
  g.hline(x0 - 1, x1 + 1, yb - 1, 0xc8ccd0);
  g.hline(x0 - 1, x1 + 1, yb - 2, 0xe8ecf0);
  // 뒤 예비 바퀴
  g.ellipse(x0 + 1, mid + 6, 2.5, 5, 0x3a3634);
  // 바퀴 (흰 휠캡)
  for (const wx of [x0 + 16, x1 - 16]) {
    g.ellipse(wx, yb + 1, 5.5, 4.4, 0x2a2624);
    g.ellipse(wx, yb + 1, 2.6, 2, 0xf2f2ec);
    g.set(wx, yb + 1, 0x9a9a94);
  }
  // 팝업 지붕 텐트 (줄무늬 천, 지퍼 창) + 지붕 위 스키 둘
  const px0 = x0 + 10;
  const px1 = x0 + 50;
  for (let y = yt - 9; y < yt; y++)
    for (let x = px0 + (yt - y) * 0; x <= px1 - Math.max(0, yt - 6 - y) * 2; x++) {
      const stripe = Math.floor((x - px0) / 4) % 2 === 0;
      g.set(x, y, y === yt - 9 ? 0xe86a4a : stripe ? 0xf4a060 : 0xfaf0dc);
    }
  g.rect(px0 + 14, yt - 7, 8, 4, 0x5a6a78);
  g.hline(px0 - 1, px1 + 1, yt - 1, 0x8a8478);
  // 루프랙 + 스키
  g.hline(x1 - 30, x1 - 12, yt - 2, 0x5a5a60);
  for (const k of [0, 3]) {
    g.hline(x1 - 32, x1 - 10, yt - 4 - k, k ? 0xd84a3a : 0x3a7ac8);
    g.set(x1 - 9, yt - 5 - k, k ? 0xd84a3a : 0x3a7ac8);
  }
  const roof = roofMask(g, (x, y) => y < yt + 2 || (y < yt && x >= px0 && x <= px1));
  g.outline(OUT);
  shadow(g, (x0 + x1) / 2, yb + 4, (x1 - x0) / 2 + 3, 2.8, 66);
  return { grid: g, roof, door: { x: dx + 6, y: yb }, windows: wins.map((x) => ({ x: x + 5, y: yt + 7 })) };
}

/** 줄무늬 차양 (캠핑카 옆면에서 앞으로 내민 천 + 기둥 둘). 원점 = 바닥 가운데 */
export const AWNING_W = 46;
export const AWNING_H = 40;
const AWNING_COLORS: readonly [Color, Color][] = [
  [0xd84a3a, 0xf6ecdc],
  [0x3a7ac8, 0xf6ecdc],
  [0x4f9a6a, 0xf2ead0],
  [0xe8a03a, 0xfaf2de],
];
export function awningArt(i: number): Grid {
  const W = AWNING_W;
  const H = AWNING_H;
  const g = new Grid(W, H);
  const [a, b] = AWNING_COLORS[i % AWNING_COLORS.length];
  const top = 2;
  const val = 15;
  // 천 (위는 벽에 붙고 앞으로 내려온다 — 앞으로 갈수록 살짝 넓게)
  for (let y = top; y < val; y++) {
    const inset = Math.round((val - y) * 0.25);
    for (let x = 2 + inset; x < W - 2 - inset; x++) {
      const st = Math.floor((x - 2) / 5) % 2 === 0;
      let c = st ? a : b;
      if (y === top) c = lighten(c, 0.25);
      else if (y > val - 3) c = darken(c, 0.12);
      g.set(x, y, c);
    }
  }
  // 앞 늘어진 장식 (물결 테)
  for (let x = 2; x < W - 2; x++) {
    const st = Math.floor((x - 2) / 5) % 2 === 0;
    const d = (x - 2) % 5;
    const h = d === 0 || d === 4 ? 1 : 2;
    for (let k = 0; k < h + 1; k++) g.set(x, val + k, darken(st ? a : b, k ? 0.18 : 0.05));
  }
  // 기둥 둘 (앞 모서리 → 땅) + 받침
  for (const px of [3, W - 4]) {
    g.vline(px, val + 1, H - 4, 0x8a9096);
    g.set(px - 1, H - 4, 0x5a6066);
    g.set(px + 1, H - 4, 0x5a6066);
  }
  g.outline(OUT);
  for (const px of [3, W - 4]) g.set(px, H - 3, 0x1a1006, 60);
  return g;
}

/** 번호 말뚝 (자리 앞 왼쪽 모서리). sale = 분양 전 팻말 (빨간 리본 + 더 큰 판) */
/** 물가 앞줄 자리 = 물빛 번호판, 숲 뒷줄 = 나무색 (멀리서도 어느 줄인지 보이게) */
const ROW_PLATE = { front: { bg: 0xcfe6f2, band: 0x3a86b8 }, back: { bg: 0xf2e6c8, band: 0x5a9a5a } } as const;
export function sitePostArt(n: number, sale: boolean, front = false): Grid {
  const P = front ? ROW_PLATE.front : ROW_PLATE.back;
  const W = sale ? 26 : 16;
  const H = sale ? 30 : 22;
  const g = new Grid(W, H);
  const pw = n >= 10 ? 11 : 7;
  if (sale) {
    // 말뚝 둘 + 넓은 판 (번호 + 「분양」 자리 줄무늬)
    g.rect(4, 12, 2, H - 14, WOOD.lo);
    g.rect(W - 6, 12, 2, H - 14, WOOD.lo);
    g.rect(1, 3, W - 2, 12, P.bg);
    frame(g, 1, 3, W - 2, 12, WOOD.line);
    drawNumber(g, n, Math.round(W / 2 - pw / 2) + 1, 5, 0x3a2a1e);
    g.hline(3, W - 4, 12, P.band);
    g.hline(3, W - 4, 11, P.band);
    // 빨간 리본 (판 위 매듭)
    g.set(W / 2, 2, 0xd84a3a);
    g.set(W / 2 - 1, 1, 0xd84a3a);
    g.set(W / 2 + 1, 1, 0xd84a3a);
    g.set(W / 2 - 2, 2, 0xb83a2e);
    g.set(W / 2 + 2, 2, 0xb83a2e);
  } else {
    g.rect(3, 6, 2, H - 8, WOOD.lo);
    g.vline(3, 6, H - 3, WOOD.mid);
    g.rect(2, 1, pw + 2, 8, P.bg);
    frame(g, 2, 1, pw + 2, 8, WOOD.line);
    g.hline(3, pw + 2, 7, P.band);
    drawNumber(g, n, 4, 2, 0x3a2a1e);
  }
  g.outline(OUT);
  shadow(g, W / 2, H - 1.5, W / 2 - 2, 1.2, 50);
  return g;
}

/** 전기·물 연결 기둥 (자리마다 하나, 작은 회색 함 + 초록 불) */
export function hookupArt(): Grid {
  const g = new Grid(8, 14);
  g.rect(1, 2, 6, 10, 0x8a949e);
  g.rect(1, 2, 6, 2, 0xb8c0c8);
  g.rect(2, 5, 4, 3, 0x5a6470);
  g.set(5, 9, 0x7ae08a);
  g.outline(OUT);
  for (let x = 1; x < 7; x++) g.set(x, 13, 0x1a1006, 60);
  return g;
}

/** 폭포 다리 (웅덩이 바로 아래, 넓은 판자 + 양쪽 난간 + 네 모서리 등 기둥) */
export const VBRIDGE_W = 104;
export const VBRIDGE_H = 44;
export function viewBridgeArt(): Grid {
  const W = VBRIDGE_W;
  const H = VBRIDGE_H;
  const g = new Grid(W, H);
  const top = 10;
  const bot = H - 8;
  // 판자 (세로 — 사람은 가로로 건넌다)
  for (let x = 4; x < W - 4; x += 4)
    for (let y = top; y < bot; y++) {
      g.set(x, y, LOG.hi);
      g.set(x + 1, y, LOG.mid);
      g.set(x + 2, y, LOG.mid);
      g.set(x + 3, y, (x + y) % 9 === 0 ? 0x3a2a1c : LOG.lo);
    }
  // 앞 두께
  g.rect(3, bot, W - 6, 3, WOOD.lo);
  g.hline(3, W - 4, bot + 2, WOOD.line);
  // 뒤 난간 (기둥 + 가로대)
  for (let x = 4; x < W - 4; x += 16) g.rect(x, top - 9, 3, 10, WOOD.lo);
  g.rect(3, top - 9, W - 6, 2, WOOD.mid);
  g.hline(3, W - 4, top - 9, WOOD.hi);
  g.rect(3, top - 4, W - 6, 1, WOOD.lo);
  // 앞 난간
  for (let x = 4; x < W - 4; x += 16) g.rect(x, bot - 8, 3, 10, WOOD.mid);
  g.rect(3, bot - 8, W - 6, 2, WOOD.hi);
  g.hline(3, W - 4, bot - 3, WOOD.lo);
  // 네 모서리 등 기둥 (등갓 + 불빛 창)
  for (const [x, y] of [
    [1, top - 14],
    [W - 6, top - 14],
    [1, bot - 13],
    [W - 6, bot - 13],
  ] as const) {
    g.rect(x + 1, y + 5, 3, 12, WOOD.lo);
    g.rect(x, y, 5, 6, 0x3a3634);
    g.rect(x + 1, y + 1, 3, 4, WIN.warm);
    g.hline(x - 1, x + 5, y - 1, 0x2a2624);
  }
  g.outline(OUT);
  for (let x = 6; x < W - 6; x++) if (!g.filled(x, H - 3)) g.set(x, H - 3, 0x0e1e28, 80);
  return g;
}
/** 폭포 다리 등불 자리 (그림 안 좌표 → 밤 빛) */
export const VBRIDGE_LAMPS: readonly { x: number; y: number }[] = [
  { x: 3, y: -4 + 10 - 14 + 3 },
  { x: VBRIDGE_W - 4, y: -4 + 10 - 14 + 3 },
  { x: 3, y: VBRIDGE_H - 8 - 13 + 3 },
  { x: VBRIDGE_W - 4, y: VBRIDGE_H - 8 - 13 + 3 },
];

/** 위에서 본 판(다리)에 군데군데 쌓인 눈 (CampConceptDecor.snowFloor와 같은 생각) */
export function snowDust(src: Grid, cover = 0.42, seed = 0): Grid {
  const g = new Grid(src.w, src.h);
  g.px.set(src.px);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.get(x, y);
      if ((v & 255) < 200) continue;
      const c = v >>> 8;
      const L0 = 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
      if (L0 < 60) continue;
      const n = vnoise(x, y, 6, 461 + seed) * 0.75 + hash2(x, y, 463 + seed) * 0.25;
      if (n > 1 - cover) g.set(x, y, L0 < 110 ? SNOW.shade : L0 < 150 ? SNOW.lo : n > 0.82 ? SNOW.hi : SNOW.mid);
      else g.set(x, y, mix(c, 0xc8d4e0, 0.14));
    }
  return g;
}

/** 절벽 틈 작은 눈 덮인 덤불 (선반 위에 붙어 자라는 키 작은 침엽수) */
export function ledgeShrubArt(v: number, snowy = true): Grid {
  const g = new Grid(12, 10);
  const r = rng(971 + v);
  g.ellipse(6, 6, 5, 3.5, 0x2e4a34);
  g.ellipse(4 + r() * 3, 4.5, 3, 2.5, 0x3a5c3e);
  g.recolor((x, y) => !g.filled(x, y - 1) || !g.filled(x, y - 2), snowy ? SNOW.hi : 0x5a7c4a);
  g.outline(OUT);
  return g;
}

/** 물가 낚시 자리 표시 (설명판 전용: 작은 물고기 + 점선 고리) */
export function fishMarkArt(): Grid {
  const g = new Grid(15, 9);
  g.ellipse(6, 4.5, 4.5, 2.8, 0xffd25a);
  g.set(11, 3, 0xffd25a);
  g.set(11, 6, 0xffd25a);
  g.set(12, 2, 0xffd25a);
  g.set(12, 7, 0xffd25a);
  g.set(11, 4, 0xffd25a);
  g.set(11, 5, 0xffd25a);
  g.set(4, 3, 0x2c2018);
  g.outline(0x2c2018);
  return g;
}

/** 분양 전 자리 둘레 말뚝 + 빨강·흰 줄 (자리 크기 w×h, 원점 = 바닥 가운데 — 앞 줄이 바닥) */
export function plotRopeArt(w: number, h: number): Grid {
  const W = w + 4;
  const H = h + 8;
  const g = new Grid(W, H);
  const rope = (x0: number, y0: number, x1: number, y1: number, sag: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag);
      g.set(x, y, Math.floor(i / 3) % 2 ? 0xf6f0e6 : 0xd84a3a);
    }
  };
  const corners: [number, number][] = [
    [2, 6],
    [W - 3, 6],
    [2, H - 3],
    [W - 3, H - 3],
  ];
  // 줄 (말뚝 머리 높이 = 바닥에서 4px 위)
  rope(2, 2, W - 3, 2, 1.5);
  rope(2, 2, 2, H - 7, 0);
  rope(W - 3, 2, W - 3, H - 7, 0);
  rope(2, H - 7, W - 3, H - 7, 2);
  for (const [x, y] of corners) {
    g.rect(x - 1, y - 6, 2, 6, WOOD.lo);
    g.set(x - 1, y - 6, SNOW.hi);
    g.set(x, y - 6, SNOW.hi);
  }
  return g;
}

/** 길가 등 기둥 (나무 기둥 + 작은 등, 밤에 켜진다) */
export function lampPostArt(): Grid {
  const g = new Grid(9, 24);
  g.rect(3, 8, 3, 14, WOOD.lo);
  g.vline(3, 8, 21, WOOD.mid);
  g.rect(1, 2, 7, 7, 0x3a3634);
  g.rect(2, 3, 5, 5, WIN.warm);
  g.set(3, 4, 0xfff6d8);
  g.hline(0, 8, 1, 0x2a2624);
  g.set(4, 0, 0x2a2624);
  g.outline(OUT);
  shadow(g, 4.5, 22.5, 3.5, 1, 56);
  return g;
}

/** 마당 가장자리에 눕혀 둔 짧은 통나무 (경계 표시 — 테두리 대신 군데군데) */
export function edgeLogArt(len: number): Grid {
  const g = new Grid(len + 2, 7);
  g.rect(1, 1, len, 4, LOG.mid);
  g.hline(1, len, 1, LOG.hi);
  g.hline(1, len, 4, LOG.lo);
  g.ellipse(len, 3, 1.5, 2, LOG.ring);
  g.outline(OUT);
  for (let x = 1; x <= len; x++) g.set(x, 6, 0x1a1006, 50);
  return g;
}

/** 관리소 앞 「카라반 분양」 A자 입간판 (작은 카라반 그림 + 빨간 리본) */
export function saleStandArt(): Grid {
  const g = new Grid(22, 24);
  // 다리 (A자)
  line(g, 4, 21, 7, 8, WOOD.lo);
  line(g, 17, 21, 14, 8, WOOD.lo);
  g.rect(2, 3, 18, 13, 0xf6efe0);
  frame(g, 2, 3, 18, 13, WOOD.line);
  // 작은 카라반 그림 (물방울 모양)
  g.ellipse(9, 10, 4.5, 3, 0x9ed6c0);
  g.rect(5, 10, 9, 3, 0x9ed6c0);
  g.hline(5, 13, 12, 0x8a9096);
  g.set(8, 9, 0xffd890);
  g.ellipse(10, 13, 1.2, 1.2, 0x2e2a28);
  g.hline(14, 17, 12, 0x6a6a70);
  // 빨간 띠 (분양)
  g.hline(4, 17, 6, 0xd84a3a);
  g.set(11, 2, 0xd84a3a);
  g.set(10, 1, 0xd84a3a);
  g.set(12, 1, 0xd84a3a);
  g.outline(OUT);
  shadow(g, 11, 22.5, 8, 1.2, 56);
  return g;
}
