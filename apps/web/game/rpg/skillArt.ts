import * as Phaser from "phaser";

// 스킬별 고유 그림 (런타임 캔버스 텍스처). 스킬마다 모양·색 배합·문양을 따로 그려, 여러 스킬이 같은 그림을 돌려 쓰지 않게 한다.
//  - 색을 구워 넣는다 (틴트 없이 쓴다): 같은 불이라도 불씨 화살은 금빛 다트, 불꽃 부채는 진홍 주름 부채, 불기둥은 나선 기둥…
//  - 처음 쓸 때 한 번 그려 게임 텍스처 관리자에 캐시한다 (씬이 바뀌어도 재사용). 키는 "skart-<이름>"
//  - 선형 필터 (게임은 pixelArt라 기본이 최근접 → 크게 키우면 계단이 진다)

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
type Art = { w: number; h: number; draw: Draw };

const TAU = Math.PI * 2;

/** 고정 시드 난수 (그림이 매번 같게) */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** 가운데가 밝은 둥근 빛 */
function blob(c: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [t, col] of stops) g.addColorStop(t, col);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

/** 끝이 뾰족한 잎·불꽃 혀 (x,y 뿌리에서 ang 방향으로 len, 폭 w) */
function leaf(c: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number, bend = 0): void {
  const cx = Math.cos(ang);
  const sy = Math.sin(ang);
  const nx = -sy;
  const ny = cx;
  const tx = x + cx * len + nx * bend;
  const ty = y + sy * len + ny * bend;
  c.beginPath();
  c.moveTo(x + nx * w * 0.5, y + ny * w * 0.5);
  c.quadraticCurveTo(x + cx * len * 0.55 + nx * (w * 0.7 + bend * 0.5), y + sy * len * 0.55 + ny * (w * 0.7 + bend * 0.5), tx, ty);
  c.quadraticCurveTo(x + cx * len * 0.55 - nx * (w * 0.7 - bend * 0.5), y + sy * len * 0.55 - ny * (w * 0.7 - bend * 0.5), x - nx * w * 0.5, y - ny * w * 0.5);
  c.closePath();
}

/** 세로 그라디언트로 채운다 */
function vgrad(c: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

function hgrad(c: CanvasRenderingContext2D, x0: number, x1: number, stops: [number, string][]): CanvasGradient {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  for (const [t, col] of stops) g.addColorStop(t, col);
  return g;
}

/** 육각 눈송이 가지 하나 (가운데에서 위로, 곁가지 k쌍) */
function dendrite(c: CanvasRenderingContext2D, len: number, k: number, side: number, lw: number): void {
  c.lineWidth = lw;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -len);
  for (let i = 1; i <= k; i++) {
    const t = i / (k + 1);
    const sl = side * (1 - t * 0.6);
    c.moveTo(0, -len * t);
    c.lineTo(-sl * 0.8, -len * t - sl * 0.7);
    c.moveTo(0, -len * t);
    c.lineTo(sl * 0.8, -len * t - sl * 0.7);
  }
  c.stroke();
}

/** 불꽃 혀 세 겹 (색 묶음을 바꿔 스킬마다 다른 불을 만든다): 바깥 → 가운데 → 심지 */
function tongue3(c: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, bend: number, cols: [string, string, string]): void {
  const layers: [number, number, string][] = [
    [1, 1, cols[0]],
    [0.66, 0.74, cols[1]],
    [0.36, 0.46, cols[2]],
  ];
  for (const [kw, kh, col] of layers) {
    c.fillStyle = vgrad(c, base - h * kh, base, [
      [0, "rgba(0,0,0,0)"],
      [0.35, col],
      [1, col],
    ]);
    const ww = w * kw;
    const hh = h * kh;
    const b = bend * kh;
    c.beginPath();
    c.moveTo(x + b, base - hh);
    c.bezierCurveTo(x + b * 0.3 + ww * 0.25, base - hh * 0.6, x + ww * 0.62, base - hh * 0.4, x + ww * 0.5, base - ww * 0.5);
    c.arc(x, base - ww * 0.5, ww * 0.5, 0, Math.PI, false);
    c.bezierCurveTo(x - ww * 0.62, base - hh * 0.4, x + b * 0.3 - ww * 0.25, base - hh * 0.6, x + b, base - hh);
    c.closePath();
    c.fill();
  }
}

/** 별 (k 갈래, 안쪽 반지름 inner) */
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, inner: number, k: number, rot = -Math.PI / 2): void {
  c.beginPath();
  for (let i = 0; i <= k * 2; i++) {
    const a = rot + (i / (k * 2)) * TAU;
    const rr = i % 2 ? inner : r;
    if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/** 넋 몸 (둥근 머리 + 물결 꼬리), 머리가 위. 크기 w×h */
function ghostBody(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, waves: number): void {
  const r = w / 2;
  c.beginPath();
  c.arc(x, y + r, r, Math.PI, 0);
  c.lineTo(x + r, y + h * 0.75);
  for (let i = 0; i < waves; i++) {
    const x0 = x + r - (i / waves) * w;
    const x1 = x + r - ((i + 1) / waves) * w;
    c.quadraticCurveTo((x0 + x1) / 2, y + h * (i % 2 ? 0.82 : 1.02), x1, y + h * 0.78 + (i % 2) * h * 0.08);
  }
  c.closePath();
}

const ART: Record<string, Art> = {
  // ═══════ 모닥불지기 ═══════
  // 불씨 화살: 금빛 다트 (흰 머리 + 가늘어지는 금빛 꼬리 + 꼬리 불씨 셋). 오른쪽을 본다
  "kindle-dart": {
    w: 96,
    h: 28,
    draw: (c) => {
      c.fillStyle = hgrad(c, 0, 84, [
        [0, "rgba(255,150,40,0)"],
        [0.6, "rgba(255,190,70,0.85)"],
        [1, "rgba(255,240,170,1)"],
      ]);
      c.beginPath();
      c.moveTo(4, 14);
      c.quadraticCurveTo(50, 4, 84, 8);
      c.quadraticCurveTo(94, 14, 84, 20);
      c.quadraticCurveTo(50, 24, 4, 14);
      c.fill();
      blob(c, 80, 14, 11, [
        [0, "rgba(255,255,255,1)"],
        [0.5, "rgba(255,240,180,0.95)"],
        [1, "rgba(255,200,80,0)"],
      ]);
      for (const [x, y, r] of [
        [22, 8, 2.5],
        [36, 21, 2],
        [12, 17, 1.6],
      ])
        blob(c, x, y, r * 2, [
          [0, "rgba(255,250,210,1)"],
          [1, "rgba(255,170,40,0)"],
        ]);
    },
  },
  // 불씨 화살 착탄: 여섯 잎 금빛 불꽃 꽃 + 둘레 불씨 점 고리
  "kindle-burst": {
    w: 96,
    h: 96,
    draw: (c) => {
      c.translate(48, 48);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        c.fillStyle = "rgba(255,170,40,0.85)";
        leaf(c, 0, 0, a, 44, 22);
        c.fill();
        c.fillStyle = "rgba(255,236,150,0.95)";
        leaf(c, 0, 0, a, 30, 11);
        c.fill();
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + 0.26;
        blob(c, Math.cos(a) * 40, Math.sin(a) * 40, 3.5, [
          [0, "rgba(255,255,220,1)"],
          [1, "rgba(255,180,60,0)"],
        ]);
      }
      blob(c, 0, 0, 16, [
        [0, "rgba(255,255,255,1)"],
        [1, "rgba(255,230,140,0)"],
      ]);
    },
  },
  // 불꽃 부채: 진홍 부채 (뿌리가 왼쪽 가운데, 주름 살 9개 · 바깥 물결 가장자리). 오른쪽을 본다 (원점 0, 0.5)
  "fan-sheet": {
    w: 128,
    h: 128,
    draw: (c) => {
      const ox = 4;
      const oy = 64;
      const half = 0.9;
      const R = 120;
      const ribs = 9;
      for (let i = 0; i < ribs; i++) {
        const a0 = -half + (i / ribs) * half * 2;
        const a1 = -half + ((i + 1) / ribs) * half * 2;
        const g = c.createRadialGradient(ox, oy, 0, ox, oy, R);
        const dark = i % 2 === 0;
        g.addColorStop(0, "rgba(255,240,200,0.95)");
        g.addColorStop(0.35, dark ? "rgba(230,40,30,0.9)" : "rgba(255,90,40,0.9)");
        g.addColorStop(0.85, dark ? "rgba(170,10,30,0.75)" : "rgba(240,60,30,0.75)");
        g.addColorStop(1, "rgba(120,0,20,0)");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(ox, oy);
        const am = (a0 + a1) / 2;
        c.lineTo(ox + Math.cos(a0) * R * 0.88, oy + Math.sin(a0) * R * 0.88);
        c.quadraticCurveTo(ox + Math.cos(am) * R * 1.08, oy + Math.sin(am) * R * 1.08, ox + Math.cos(a1) * R * 0.88, oy + Math.sin(a1) * R * 0.88);
        c.closePath();
        c.fill();
      }
      // 주름 살 (밝은 금빛 선)
      c.strokeStyle = "rgba(255,220,140,0.8)";
      c.lineWidth = 1.5;
      for (let i = 0; i <= ribs; i++) {
        const a = -half + (i / ribs) * half * 2;
        c.beginPath();
        c.moveTo(ox, oy);
        c.lineTo(ox + Math.cos(a) * R * 0.86, oy + Math.sin(a) * R * 0.86);
        c.stroke();
      }
    },
  },
  // 불꽃 부채 끝의 열기 물결 (초승달 모양 불꽃 혀 줄). 오른쪽으로 볼록
  "fan-wave": {
    w: 48,
    h: 112,
    draw: (c) => {
      c.translate(8, 56);
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + (i / 6) * 1.8;
        const x = Math.cos(a) * 26 - 18;
        const y = Math.sin(a) * 50;
        c.fillStyle = i % 2 ? "rgba(255,80,40,0.85)" : "rgba(255,180,80,0.9)";
        leaf(c, x, y, a, 22, 12, i % 2 ? 4 : -4);
        c.fill();
      }
    },
  },
  // 장작 더 넣기: 불꽃 왕관 (고리 띠 위 일곱 갈래 호박색 불꽃) — 머리 위에 뜬다
  "stoke-crown": {
    w: 96,
    h: 72,
    draw: (c) => {
      c.fillStyle = vgrad(c, 50, 66, [
        [0, "rgba(255,200,90,1)"],
        [1, "rgba(160,70,20,1)"],
      ]);
      c.beginPath();
      c.ellipse(48, 58, 38, 9, 0, 0, TAU);
      c.fill();
      for (let i = 0; i < 7; i++) {
        const x = 18 + i * 10;
        const h = 22 + (3 - Math.abs(i - 3)) * 9;
        tongue3(c, x, 58, 12, h, (i - 3) * 1.2, ["rgba(220,110,20,0.95)", "rgba(255,190,70,1)", "rgba(255,250,210,1)"]);
      }
      c.fillStyle = "rgba(90,40,10,0.9)";
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(14 + i * 13.6, 60, 2.6, 0, TAU);
        c.fill();
      }
    },
  },
  // 장작 더 넣기 발밑 문양: 장작 셋이 엇갈린 삼각 문양 + 숯불 테두리
  "stoke-sigil": {
    w: 128,
    h: 128,
    draw: (c) => {
      c.translate(64, 64);
      c.strokeStyle = "rgba(255,170,60,0.9)";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 58, 0, TAU);
      c.stroke();
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(0, 0, 50, 0, TAU);
      c.stroke();
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate((i / 3) * TAU);
        c.fillStyle = "rgba(150,70,20,0.95)";
        c.fillRect(-36, -5, 72, 10);
        c.fillStyle = "rgba(255,200,90,0.9)";
        c.fillRect(-30, -1.5, 60, 3);
        c.restore();
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        blob(c, Math.cos(a) * 54, Math.sin(a) * 54, 5, [
          [0, "rgba(255,240,180,1)"],
          [1, "rgba(255,120,30,0)"],
        ]);
      }
    },
  },
  // 불의 고리: 위에서 본 불꽃 화환 (원 둘레에서 바깥으로 뻗는 붉은 불꽃 혀 18개 + 안쪽 숯 고리)
  "ring-wreath": {
    w: 192,
    h: 192,
    draw: (c) => {
      c.translate(96, 96);
      const r = seeded(17);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        const len = 26 + r() * 14;
        c.fillStyle = "rgba(210,30,20,0.85)";
        leaf(c, Math.cos(a) * 60, Math.sin(a) * 60, a, len, 16, (r() - 0.5) * 10);
        c.fill();
        c.fillStyle = "rgba(255,150,50,0.95)";
        leaf(c, Math.cos(a) * 60, Math.sin(a) * 60, a, len * 0.6, 8);
        c.fill();
      }
      c.strokeStyle = "rgba(255,100,40,1)";
      c.lineWidth = 8;
      c.beginPath();
      c.arc(0, 0, 60, 0, TAU);
      c.stroke();
      c.strokeStyle = "rgba(255,230,160,1)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(0, 0, 60, 0, TAU);
      c.stroke();
    },
  },
  // 장작 유성: 검은 껍질 사이로 용암이 갈라진 불덩이 + 왼쪽으로 길게 늘어진 검붉은 불꼬리. 오른쪽(진행 방향)을 본다
  "meteor-comet": {
    w: 160,
    h: 56,
    draw: (c) => {
      c.fillStyle = hgrad(c, 0, 130, [
        [0, "rgba(90,10,10,0)"],
        [0.45, "rgba(200,40,20,0.7)"],
        [0.85, "rgba(255,140,40,0.95)"],
        [1, "rgba(255,230,160,1)"],
      ]);
      c.beginPath();
      c.moveTo(0, 28);
      c.quadraticCurveTo(60, 6, 130, 12);
      c.lineTo(130, 44);
      c.quadraticCurveTo(60, 50, 0, 28);
      c.fill();
      // 바위 몸
      c.fillStyle = "#2a1410";
      c.beginPath();
      c.ellipse(132, 28, 20, 17, 0.3, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(255,170,50,1)";
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(118, 22);
      c.lineTo(130, 30);
      c.lineTo(126, 40);
      c.moveTo(130, 30);
      c.lineTo(145, 24);
      c.moveTo(136, 14);
      c.lineTo(132, 22);
      c.stroke();
      blob(c, 146, 28, 10, [
        [0, "rgba(255,255,230,1)"],
        [1, "rgba(255,170,60,0)"],
      ]);
    },
  },
  // 장작 유성 구덩이: 바닥에 패인 타원 구덩이 + 사방으로 갈라진 용암 금
  "meteor-crater": {
    w: 160,
    h: 96,
    draw: (c) => {
      c.translate(80, 48);
      c.fillStyle = "rgba(30,10,6,0.85)";
      c.beginPath();
      c.ellipse(0, 0, 44, 24, 0, 0, TAU);
      c.fill();
      const r = seeded(29);
      c.strokeStyle = "rgba(255,120,30,0.95)";
      c.lineCap = "round";
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * TAU + r() * 0.3;
        let x = Math.cos(a) * 30;
        let y = Math.sin(a) * 16;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += Math.cos(a + (r() - 0.5) * 0.8) * 14;
          y += Math.sin(a + (r() - 0.5) * 0.8) * 8;
          c.lineTo(x, y);
          c.lineWidth = 2 - k * 0.5;
        }
        c.stroke();
      }
      blob(c, 0, 0, 30, [
        [0, "rgba(255,200,90,0.9)"],
        [1, "rgba(255,80,20,0)"],
      ]);
    },
  },
  // 장작 유성 착탄: 왕관 모양으로 튀어 오르는 용암 물방울 (가운데 기둥 + 양옆 휘어진 줄기)
  "meteor-splash": {
    w: 160,
    h: 128,
    draw: (c) => {
      const base = 124;
      for (let i = 0; i < 9; i++) {
        const t = i / 8 - 0.5;
        const x0 = 80 + t * 40;
        const x1 = 80 + t * 140;
        const top = 30 + Math.abs(t) * 120;
        c.strokeStyle = vgrad(c, top, base, [
          [0, "rgba(255,240,180,1)"],
          [0.5, "rgba(255,110,30,0.9)"],
          [1, "rgba(140,20,10,0.4)"],
        ]);
        c.lineWidth = 9 - Math.abs(t) * 8;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(x0, base);
        c.quadraticCurveTo(x0 + t * 30, top, x1, top + 14);
        c.stroke();
        blob(c, x1, top + 14, 6, [
          [0, "rgba(255,250,220,1)"],
          [1, "rgba(255,140,40,0)"],
        ]);
      }
    },
  },
  // 화톳불: 푸른 밑불 위에 주황 불꽃이 선 가는 불꽃 (다른 불과 달리 밑동이 파랗다)
  "brazier-lick": {
    w: 32,
    h: 80,
    draw: (c) => {
      tongue3(c, 16, 78, 18, 74, 3, ["rgba(255,110,20,0.9)", "rgba(255,190,80,1)", "rgba(255,250,220,1)"]);
      blob(c, 16, 70, 10, [
        [0, "rgba(140,210,255,0.95)"],
        [1, "rgba(60,120,255,0)"],
      ]);
    },
  },
  // 화톳불 바닥: 숯 격자 (둥근 테 안에 엇갈린 숯 덩이들이 붉게 달아오름)
  "brazier-coals": {
    w: 128,
    h: 128,
    draw: (c) => {
      c.translate(64, 64);
      const r = seeded(41);
      for (let i = 0; i < 46; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * 56;
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        c.fillStyle = "rgba(40,16,10,0.9)";
        c.beginPath();
        c.ellipse(x, y, 5 + r() * 3, 4 + r() * 2, r() * 3, 0, TAU);
        c.fill();
        blob(c, x, y, 4 + r() * 3, [
          [0, "rgba(255,190,80,0.95)"],
          [1, "rgba(255,60,20,0)"],
        ]);
      }
      c.strokeStyle = "rgba(255,140,50,0.85)";
      c.lineWidth = 2;
      c.setLineDash([6, 5]);
      c.beginPath();
      c.arc(0, 0, 61, 0, TAU);
      c.stroke();
    },
  },
  // 큰 모닥불: 통나무를 원뿔로 세운 장작더미 + 그 위로 솟는 거대한 불꽃 (궁극 기 모으기)
  "bonfire-pyre": {
    w: 160,
    h: 200,
    draw: (c) => {
      // 장작 (원뿔로 기댄 통나무 7개)
      for (let i = 0; i < 7; i++) {
        const t = i / 6 - 0.5;
        c.save();
        c.translate(80 + t * 90, 196);
        c.rotate(-t * 1.0);
        c.fillStyle = i % 2 ? "#5a3018" : "#6e3c1e";
        c.fillRect(-6, -78, 12, 80);
        c.fillStyle = "#c08048";
        c.beginPath();
        c.ellipse(0, -78, 6, 3, 0, 0, TAU);
        c.fill();
        c.restore();
      }
      const r = seeded(7);
      for (let i = 0; i < 6; i++) tongue3(c, 50 + i * 12 + r() * 4, 170, 40 - Math.abs(i - 2.5) * 5, 130 + (2.5 - Math.abs(i - 2.5)) * 18, (r() - 0.5) * 16, ["rgba(230,50,10,0.85)", "rgba(255,170,40,0.95)", "rgba(255,250,215,1)"]);
    },
  },
  // 큰 모닥불 불기둥: 나선으로 꼬인 불 기둥 (가장자리가 일렁이는 주황 몸통 + 붉은 나선 띠 + 금빛 심지). 바닥 원점
  "bonfire-pillar": {
    w: 72,
    h: 256,
    draw: (c) => {
      c.fillStyle = vgrad(c, 0, 256, [
        [0, "rgba(255,80,20,0)"],
        [0.3, "rgba(240,80,20,0.55)"],
        [0.75, "rgba(255,130,30,0.85)"],
        [1, "rgba(255,190,70,0.95)"],
      ]);
      c.beginPath();
      c.moveTo(36, 0);
      for (let y = 0; y <= 256; y += 16) c.lineTo(36 + (8 + (y / 256) * 24) + Math.sin(y / 11) * 4, y);
      for (let y = 256; y >= 0; y -= 16) c.lineTo(36 - (8 + (y / 256) * 24) + Math.sin(y / 13 + 1) * 4, y);
      c.closePath();
      c.fill();
      // 붉은 나선 띠
      c.strokeStyle = "rgba(200,30,10,0.75)";
      c.lineWidth = 5;
      c.beginPath();
      for (let y = 250; y > 30; y -= 4) {
        const k = y / 256;
        const x = 36 + Math.sin(y / 16) * (6 + k * 20);
        if (y === 250) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      // 금빛 심지 (아래가 밝다)
      c.fillStyle = vgrad(c, 60, 256, [
        [0, "rgba(255,230,150,0)"],
        [1, "rgba(255,240,180,0.8)"],
      ]);
      c.beginPath();
      c.ellipse(36, 180, 7, 76, 0, 0, TAU);
      c.fill();
    },
  },
  // 큰 모닥불 화염 벽: 화면 아래를 덮는 굽이치는 화염 (꼭대기가 둥글게 말려 넘어간다)
  "bonfire-wall": {
    w: 256,
    h: 128,
    draw: (c) => {
      c.fillStyle = vgrad(c, 20, 128, [
        [0, "rgba(255,60,10,0)"],
        [0.3, "rgba(220,40,10,0.75)"],
        [0.7, "rgba(255,130,30,0.9)"],
        [1, "rgba(255,220,120,1)"],
      ]);
      c.beginPath();
      c.moveTo(0, 128);
      for (let i = 0; i <= 8; i++) {
        const x = i * 32;
        const top = 22 + (i % 2) * 26 + Math.sin(i * 1.7) * 8;
        c.quadraticCurveTo(x - 16, top - 18, x, top);
      }
      c.lineTo(256, 128);
      c.closePath();
      c.fill();
      // 화염 속 불꽃 혀 (밝은 금빛, 위로 솟는다)
      const r = seeded(13);
      for (let i = 0; i < 10; i++) tongue3(c, 12 + i * 26 + r() * 6, 128, 20 + r() * 8, 50 + r() * 40, (r() - 0.5) * 10, ["rgba(255,110,30,0.6)", "rgba(255,190,80,0.75)", "rgba(255,240,190,0.85)"]);
    },
  },
  // 큰 모닥불 해 바퀴 (축제 문양): 바닥에 깔리는 열두 살 해 바퀴 + 불꽃 톱니
  "bonfire-sun": {
    w: 256,
    h: 256,
    draw: (c) => {
      c.translate(128, 128);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        c.fillStyle = i % 2 ? "rgba(255,120,30,0.9)" : "rgba(255,210,100,0.9)";
        leaf(c, Math.cos(a) * 96, Math.sin(a) * 96, a, 26, 14);
        c.fill();
      }
      c.strokeStyle = "rgba(255,190,80,0.95)";
      c.lineWidth = 6;
      c.beginPath();
      c.arc(0, 0, 96, 0, TAU);
      c.stroke();
      c.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        c.beginPath();
        c.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
        c.lineTo(Math.cos(a) * 90, Math.sin(a) * 90);
        c.stroke();
      }
      c.beginPath();
      c.arc(0, 0, 30, 0, TAU);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 64, 0, TAU);
      c.stroke();
    },
  },
  // 큰 모닥불 재: 회색 재 조각 (가장자리만 붉게 탄다)
  "bonfire-ash": {
    w: 24,
    h: 24,
    draw: (c) => {
      c.fillStyle = "rgba(90,84,80,0.95)";
      c.beginPath();
      c.moveTo(4, 8);
      c.lineTo(14, 3);
      c.lineTo(21, 10);
      c.lineTo(17, 20);
      c.lineTo(6, 18);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(255,120,40,0.95)";
      c.lineWidth = 1.5;
      c.stroke();
    },
  },
  // 큰 모닥불 대폭발 빛: 열여섯 갈래 굵은 금빛 불살 (빛줄기 대신 쓰는 고유 섬광)
  "bonfire-flare": {
    w: 256,
    h: 256,
    draw: (c) => {
      c.translate(128, 128);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        c.fillStyle = i % 2 ? "rgba(255,140,40,0.7)" : "rgba(255,230,150,0.9)";
        leaf(c, 0, 0, a, i % 2 ? 90 : 124, i % 2 ? 22 : 30);
        c.fill();
      }
      blob(c, 0, 0, 56, [
        [0, "rgba(255,255,255,1)"],
        [0.5, "rgba(255,240,190,0.8)"],
        [1, "rgba(255,180,60,0)"],
      ]);
    },
  },

  // ═══════ 서리 묘지기 ═══════
  // 서리 입김: 민트빛 흰 안개 덩어리 (소용돌이 말림 셋), 오른쪽으로 퍼진다
  "breath-plume": {
    w: 128,
    h: 72,
    draw: (c) => {
      const r = seeded(23);
      for (let i = 0; i < 9; i++) {
        const x = 18 + i * 12;
        const y = 36 + (r() - 0.5) * 20;
        const rr = 10 + i * 2.6;
        blob(c, x, y, rr, [
          [0, "rgba(235,255,250,0.75)"],
          [0.6, "rgba(190,240,235,0.45)"],
          [1, "rgba(160,220,230,0)"],
        ]);
      }
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth = 2;
      for (const [x, y, s] of [
        [48, 30, 9],
        [80, 44, 12],
        [104, 28, 10],
      ]) {
        c.beginPath();
        for (let t = 0; t < 1.6 * TAU; t += 0.2) {
          const rr = (t / (1.6 * TAU)) * s;
          const px = x + Math.cos(t) * rr;
          const py = y + Math.sin(t) * rr;
          if (t === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
      }
    },
  },
  // 서리 입김이 지나간 바닥: 서리 바늘 다발 (가운데에서 부채처럼 뻗은 가는 바늘)
  "breath-rime": {
    w: 48,
    h: 32,
    draw: (c) => {
      c.strokeStyle = "rgba(230,255,250,0.95)";
      c.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.2;
        c.lineWidth = i % 2 ? 1.2 : 2;
        c.beginPath();
        c.moveTo(24, 30);
        c.lineTo(24 + Math.cos(a) * (14 + (i % 3) * 5), 30 + Math.sin(a) * (14 + (i % 3) * 5));
        c.stroke();
      }
    },
  },
  // 고드름: 깎인 면이 보이는 길고 가는 청록 고드름 (흰 날, 남색 그늘). 오른쪽을 본다
  "icicle-lance": {
    w: 72,
    h: 18,
    draw: (c) => {
      c.fillStyle = hgrad(c, 0, 72, [
        [0, "rgba(80,170,230,0.85)"],
        [0.7, "rgba(170,235,255,0.95)"],
        [1, "rgba(255,255,255,1)"],
      ]);
      c.beginPath();
      c.moveTo(2, 3);
      c.lineTo(70, 9);
      c.lineTo(2, 15);
      c.lineTo(8, 9);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(30,80,150,0.55)";
      c.beginPath();
      c.moveTo(8, 9);
      c.lineTo(70, 9);
      c.lineTo(2, 15);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(6, 5);
      c.lineTo(66, 8.5);
      c.stroke();
    },
  },
  // 고드름 깨짐: 엇갈린 얼음 조각 넷 (십자로 튀는 파편 별)
  "icicle-burst": {
    w: 64,
    h: 64,
    draw: (c) => {
      c.translate(32, 32);
      for (let i = 0; i < 4; i++) {
        c.save();
        c.rotate((i / 4) * TAU + 0.4);
        c.fillStyle = i % 2 ? "rgba(150,220,255,0.95)" : "rgba(235,250,255,1)";
        c.beginPath();
        c.moveTo(4, -3);
        c.lineTo(30, 0);
        c.lineTo(4, 4);
        c.closePath();
        c.fill();
        c.restore();
      }
      blob(c, 0, 0, 10, [
        [0, "rgba(255,255,255,1)"],
        [1, "rgba(160,220,255,0)"],
      ]);
    },
  },
  // 서리 방패: 남색 유리 육각 판 (안쪽 육각 문양 + 모서리 반짝)
  "ward-hex": {
    w: 72,
    h: 72,
    draw: (c) => {
      c.translate(36, 36);
      const hex = (r: number) => {
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + Math.PI / 6;
          if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath();
      };
      c.fillStyle = "rgba(40,90,190,0.45)";
      hex(32);
      c.fill();
      c.strokeStyle = "rgba(200,235,255,1)";
      c.lineWidth = 3;
      hex(32);
      c.stroke();
      c.lineWidth = 1.5;
      c.strokeStyle = "rgba(150,210,255,0.9)";
      hex(20);
      c.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        c.beginPath();
        c.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
        c.lineTo(Math.cos(a) * 32, Math.sin(a) * 32);
        c.stroke();
      }
    },
  },
  // 서리꽃: 곁가지가 돋은 여섯 갈래 눈송이 (흰빛 + 연보라 그늘)
  "nova-flake": {
    w: 192,
    h: 192,
    draw: (c) => {
      c.translate(96, 96);
      c.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        c.save();
        c.rotate((i / 6) * TAU);
        c.strokeStyle = "rgba(190,170,255,0.7)";
        dendrite(c, 86, 4, 26, 9);
        c.strokeStyle = "rgba(255,255,255,1)";
        dendrite(c, 86, 4, 26, 3.5);
        c.restore();
      }
      blob(c, 0, 0, 22, [
        [0, "rgba(255,255,255,1)"],
        [1, "rgba(210,200,255,0)"],
      ]);
    },
  },
  // 서리꽃 꽃잎: 끝이 뾰족한 얼음 꽃잎 (가운데 맥)
  "nova-petal": {
    w: 40,
    h: 96,
    draw: (c) => {
      c.fillStyle = vgrad(c, 0, 96, [
        [0, "rgba(255,255,255,1)"],
        [1, "rgba(170,160,255,0.75)"],
      ]);
      leaf(c, 20, 94, -Math.PI / 2, 90, 30);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(20, 92);
      c.lineTo(20, 10);
      c.stroke();
    },
  },
  // 안개 걸음: 은빛 안개 띠 (양 끝이 흐려지는 물결 띠). 가로
  "mist-ribbon": {
    w: 160,
    h: 40,
    draw: (c) => {
      for (let k = 0; k < 3; k++) {
        c.strokeStyle = hgrad(c, 0, 160, [
          [0, "rgba(220,230,240,0)"],
          [0.5, k === 1 ? "rgba(255,255,255,0.95)" : "rgba(200,215,235,0.6)"],
          [1, "rgba(220,230,240,0)"],
        ]);
        c.lineWidth = k === 1 ? 5 : 9;
        c.beginPath();
        for (let x = 0; x <= 160; x += 4) {
          const y = 20 + Math.sin(x / 14 + k * 2) * (6 - k);
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    },
  },
  // 안개 걸음 베기: 은빛 X자 베기 자국
  "mist-cut": {
    w: 64,
    h: 64,
    draw: (c) => {
      c.translate(32, 32);
      for (const a of [0.7, -0.7]) {
        c.save();
        c.rotate(a);
        c.fillStyle = hgrad(c, -30, 30, [
          [0, "rgba(200,220,240,0)"],
          [0.5, "rgba(255,255,255,1)"],
          [1, "rgba(200,220,240,0)"],
        ]);
        c.beginPath();
        c.moveTo(-30, 0);
        c.quadraticCurveTo(0, -5, 30, 0);
        c.quadraticCurveTo(0, 3, -30, 0);
        c.fill();
        c.restore();
      }
    },
  },
  // 얼음 무덤: 윗부분이 둥근 청록 얼음 비석 (가운데 십자 문양 · 깎인 면). 바닥 원점
  "tomb-slab": {
    w: 64,
    h: 112,
    draw: (c) => {
      const path = () => {
        c.beginPath();
        c.moveTo(8, 110);
        c.lineTo(8, 32);
        c.arc(32, 32, 24, Math.PI, 0);
        c.lineTo(56, 110);
        c.closePath();
      };
      c.fillStyle = vgrad(c, 8, 110, [
        [0, "rgba(220,255,250,0.98)"],
        [0.5, "rgba(110,200,210,0.92)"],
        [1, "rgba(30,90,120,0.9)"],
      ]);
      path();
      c.fill();
      c.strokeStyle = "#0e3a4a";
      c.lineWidth = 3;
      path();
      c.stroke();
      c.fillStyle = "rgba(10,60,80,0.35)";
      c.fillRect(34, 20, 22, 90);
      c.strokeStyle = "rgba(255,255,255,0.95)";
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(32, 34);
      c.lineTo(32, 78);
      c.moveTo(20, 48);
      c.lineTo(44, 48);
      c.stroke();
    },
  },
  // 얼음 무덤 파편: 모난 청록 얼음 덩이
  "tomb-chunk": {
    w: 28,
    h: 24,
    draw: (c) => {
      c.fillStyle = "rgba(140,220,225,0.95)";
      c.beginPath();
      c.moveTo(3, 12);
      c.lineTo(10, 2);
      c.lineTo(24, 5);
      c.lineTo(26, 17);
      c.lineTo(12, 22);
      c.closePath();
      c.fill();
      c.strokeStyle = "#0e3a4a";
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.beginPath();
      c.moveTo(10, 4);
      c.lineTo(15, 6);
      c.lineTo(8, 12);
      c.closePath();
      c.fill();
    },
  },
  // 서리밭: 위에서 본 서리 고사리 무늬 (가운데에서 뻗은 깃털 가지 여덟 + 바깥 테)
  "field-ferns": {
    w: 192,
    h: 192,
    draw: (c) => {
      c.translate(96, 96);
      c.strokeStyle = "rgba(235,250,255,0.85)";
      c.lineCap = "round";
      const r = seeded(53);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + r() * 0.2;
        c.lineWidth = 2;
        let x = 0;
        let y = 0;
        let aa = a;
        for (let s = 0; s < 10; s++) {
          const nx = x + Math.cos(aa) * 9;
          const ny = y + Math.sin(aa) * 9;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(nx, ny);
          c.stroke();
          // 깃털 곁가지
          c.lineWidth = 1;
          for (const sd of [-1, 1]) {
            c.beginPath();
            c.moveTo(nx, ny);
            c.lineTo(nx + Math.cos(aa + sd * 1.0) * (9 - s * 0.6), ny + Math.sin(aa + sd * 1.0) * (9 - s * 0.6));
            c.stroke();
          }
          c.lineWidth = 2;
          x = nx;
          y = ny;
          aa += (r() - 0.5) * 0.35;
        }
      }
      c.strokeStyle = "rgba(255,255,255,0.7)";
      c.lineWidth = 2;
      c.setLineDash([3, 6]);
      c.beginPath();
      c.arc(0, 0, 92, 0, TAU);
      c.stroke();
    },
  },
  // 한겨울 눈보라: 거대한 눈 결정 만다라 (두 겹 고리 + 룬 눈금 + 열두 갈래 결정)
  "blizzard-mandala": {
    w: 256,
    h: 256,
    draw: (c) => {
      c.translate(128, 128);
      c.lineCap = "round";
      c.strokeStyle = "rgba(200,235,255,0.95)";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(0, 0, 120, 0, TAU);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 104, 0, TAU);
      c.stroke();
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU;
        c.beginPath();
        c.moveTo(Math.cos(a) * 106, Math.sin(a) * 106);
        c.lineTo(Math.cos(a) * (i % 3 ? 112 : 118), Math.sin(a) * (i % 3 ? 112 : 118));
        c.stroke();
      }
      for (let i = 0; i < 12; i++) {
        c.save();
        c.rotate((i / 12) * TAU);
        c.strokeStyle = i % 2 ? "rgba(140,200,255,0.9)" : "rgba(255,255,255,1)";
        dendrite(c, i % 2 ? 70 : 98, i % 2 ? 2 : 3, i % 2 ? 14 : 22, i % 2 ? 2 : 3);
        c.restore();
      }
    },
  },
  // 눈보라 돌풍: 눈을 실은 비스듬한 바람 띠 (가로)
  "blizzard-gust": {
    w: 256,
    h: 56,
    draw: (c) => {
      const r = seeded(61);
      for (let k = 0; k < 5; k++) {
        c.strokeStyle = hgrad(c, 0, 256, [
          [0, "rgba(220,240,255,0)"],
          [0.6, k % 2 ? "rgba(170,215,255,0.7)" : "rgba(255,255,255,0.85)"],
          [1, "rgba(220,240,255,0)"],
        ]);
        c.lineWidth = 2 + (k % 3) * 2;
        c.beginPath();
        const y0 = 8 + k * 10;
        c.moveTo(0, y0);
        c.bezierCurveTo(80, y0 - 8, 170, y0 + 8, 256, y0 - 2);
        c.stroke();
      }
      for (let i = 0; i < 30; i++) {
        const x = r() * 256;
        const y = 4 + r() * 48;
        blob(c, x, y, 2 + r() * 2.5, [
          [0, "rgba(255,255,255,1)"],
          [1, "rgba(255,255,255,0)"],
        ]);
      }
    },
  },
  // 눈보라 얼음 첨탑: 세 갈래로 솟은 날카로운 얼음 첨탑 (적 발밑에서 솟는다, 바닥 원점)
  "blizzard-spire": {
    w: 72,
    h: 160,
    draw: (c) => {
      for (const [x, h, w] of [
        [20, 96, 18],
        [52, 110, 20],
        [36, 156, 26],
      ] as const) {
        c.fillStyle = vgrad(c, 160 - h, 160, [
          [0, "rgba(255,255,255,1)"],
          [0.5, "rgba(170,220,255,0.95)"],
          [1, "rgba(60,120,210,0.85)"],
        ]);
        c.beginPath();
        c.moveTo(x, 160 - h);
        c.lineTo(x + w / 2, 160);
        c.lineTo(x - w / 2, 160);
        c.closePath();
        c.fill();
        c.strokeStyle = "#173a6e";
        c.lineWidth = 2;
        c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.9)";
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x, 160 - h + 4);
        c.lineTo(x - w * 0.2, 156);
        c.stroke();
      }
    },
  },
  // 눈보라 화면 테두리: 가장자리에 얼음 결정이 돋은 서리 액자 (가운데는 비어 있다)
  "blizzard-frame": {
    w: 256,
    h: 256,
    draw: (c) => {
      const g = c.createRadialGradient(128, 128, 70, 128, 128, 190);
      g.addColorStop(0, "rgba(200,235,255,0)");
      g.addColorStop(0.6, "rgba(200,235,255,0.35)");
      g.addColorStop(1, "rgba(235,250,255,0.95)");
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
      const r = seeded(71);
      c.strokeStyle = "rgba(255,255,255,0.9)";
      c.lineCap = "round";
      for (let i = 0; i < 40; i++) {
        const side = i % 4;
        const t = r() * 256;
        const x = side === 0 ? t : side === 1 ? 256 : side === 2 ? t : 0;
        const y = side === 0 ? 0 : side === 1 ? t : side === 2 ? 256 : t;
        const a = Math.atan2(128 - y, 128 - x) + (r() - 0.5) * 0.8;
        const len = 14 + r() * 26;
        c.lineWidth = 1 + r() * 2;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        c.stroke();
      }
    },
  },
  // 눈송이 (작은 여섯 갈래)
  "blizzard-flake": {
    w: 24,
    h: 24,
    draw: (c) => {
      c.translate(12, 12);
      c.strokeStyle = "rgba(255,255,255,1)";
      c.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        c.save();
        c.rotate((i / 6) * TAU);
        dendrite(c, 10, 1, 4, 1.6);
        c.restore();
      }
    },
  },

  // ═══════ 넋 인도자 ═══════
  // 도깨비불: 청록 넋불 (불꽃 몸 + 안쪽 소용돌이 눈). 위가 머리
  "wisp-orb": {
    w: 40,
    h: 56,
    draw: (c) => {
      tongue3(c, 20, 52, 30, 52, 4, ["rgba(60,210,180,0.85)", "rgba(150,250,225,0.95)", "rgba(240,255,250,1)"]);
      c.strokeStyle = "rgba(20,90,90,0.6)";
      c.lineWidth = 1.5;
      c.beginPath();
      for (let t = 0; t < 2.2 * TAU; t += 0.25) {
        const rr = (t / (2.2 * TAU)) * 7;
        const x = 20 + Math.cos(t) * rr;
        const y = 38 + Math.sin(t) * rr;
        if (t === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    },
  },
  // 도깨비불 맞음: 나선으로 풀리는 청록 넋 연기
  "wisp-burst": {
    w: 80,
    h: 80,
    draw: (c) => {
      c.translate(40, 40);
      c.lineCap = "round";
      for (let arm = 0; arm < 4; arm++) {
        for (let s = 0; s < 18; s++) {
          const t = s / 18;
          const a = (arm / 4) * TAU + t * 2.6;
          const r = 4 + t * 32;
          blob(c, Math.cos(a) * r, Math.sin(a) * r, 6 - t * 4, [
            [0, `rgba(200,255,240,${(0.9 - t * 0.6).toFixed(2)})`],
            [1, "rgba(80,220,190,0)"],
          ]);
        }
      }
    },
  },
  // 등불 기도: 금빛 연꽃 등 (꽃잎 일곱 + 가운데 불빛)
  "lamp-lotus": {
    w: 112,
    h: 72,
    draw: (c) => {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.4;
        c.fillStyle = i % 2 ? "rgba(255,200,110,0.95)" : "rgba(255,236,170,0.98)";
        leaf(c, 56, 64, a, 50 - Math.abs(i - 3) * 6, 22);
        c.fill();
        c.strokeStyle = "rgba(200,120,40,0.8)";
        c.lineWidth = 1.2;
        c.stroke();
      }
      blob(c, 56, 44, 16, [
        [0, "rgba(255,255,240,1)"],
        [1, "rgba(255,220,130,0)"],
      ]);
    },
  },
  // 바람 넋: 민트빛 잎 (가운데 잎맥)
  "swift-leaf": {
    w: 32,
    h: 16,
    draw: (c) => {
      c.fillStyle = hgrad(c, 0, 32, [
        [0, "rgba(120,240,200,0.9)"],
        [1, "rgba(230,255,245,1)"],
      ]);
      leaf(c, 2, 8, 0, 28, 12, 1);
      c.fill();
      c.strokeStyle = "rgba(40,140,110,0.8)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(3, 8);
      c.lineTo(28, 8);
      c.stroke();
    },
  },
  // 길동무 넋 (묘비 소환): 회색 돌 묘비 + 보랏빛으로 빛나는 새김 글자. 바닥 원점
  "friend-stone": {
    w: 48,
    h: 64,
    draw: (c) => {
      c.fillStyle = vgrad(c, 4, 62, [
        [0, "#a8a4b4"],
        [1, "#5c5868"],
      ]);
      c.beginPath();
      c.moveTo(6, 62);
      c.lineTo(6, 22);
      c.quadraticCurveTo(6, 4, 24, 4);
      c.quadraticCurveTo(42, 4, 42, 22);
      c.lineTo(42, 62);
      c.closePath();
      c.fill();
      c.strokeStyle = "#2e2a38";
      c.lineWidth = 2;
      c.stroke();
      c.shadowColor = "rgba(190,140,255,1)";
      c.shadowBlur = 6;
      c.strokeStyle = "rgba(220,190,255,1)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(24, 24, 7, 0, TAU);
      c.moveTo(24, 31);
      c.lineTo(24, 48);
      c.moveTo(16, 40);
      c.lineTo(32, 40);
      c.stroke();
    },
  },
  // 넋 사슬: 보랏빛 쇠사슬 고리 둘 (가로로 이어 붙여 쓴다)
  "chain-link": {
    w: 40,
    h: 16,
    draw: (c) => {
      c.lineWidth = 3.5;
      c.strokeStyle = "rgba(200,170,255,1)";
      c.beginPath();
      c.ellipse(11, 8, 9, 5.5, 0, 0, TAU);
      c.stroke();
      c.strokeStyle = "rgba(150,110,230,1)";
      c.beginPath();
      c.ellipse(29, 8, 9, 3, 0, 0, TAU);
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.8)";
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(11, 7, 7, 3.5, 0, Math.PI * 1.1, Math.PI * 1.8);
      c.stroke();
    },
  },
  // 넋 사슬 봉인: 네 사슬 매듭이 걸린 보랏빛 봉인 고리 (끌어모은 자리)
  "chain-seal": {
    w: 128,
    h: 128,
    draw: (c) => {
      c.translate(64, 64);
      c.strokeStyle = "rgba(190,150,255,0.95)";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 54, 0, TAU);
      c.stroke();
      c.setLineDash([8, 4]);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 44, 0, TAU);
      c.stroke();
      c.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        c.save();
        c.translate(Math.cos(a) * 54, Math.sin(a) * 54);
        c.rotate(a);
        c.fillStyle = "rgba(90,40,160,1)";
        c.fillRect(-7, -7, 14, 14);
        c.strokeStyle = "rgba(230,210,255,1)";
        c.strokeRect(-7, -7, 14, 14);
        c.restore();
      }
      c.strokeStyle = "rgba(230,210,255,0.9)";
      c.lineWidth = 2;
      star(c, 0, 0, 30, 12, 4, Math.PI / 4);
      c.stroke();
    },
  },
  // 저승 너울: 검보라 장막 (위에서 드리워져 아래가 찢긴 너울)
  "veil-drape": {
    w: 72,
    h: 128,
    draw: (c) => {
      c.fillStyle = vgrad(c, 0, 128, [
        [0, "rgba(40,16,70,0.95)"],
        [0.7, "rgba(90,50,150,0.7)"],
        [1, "rgba(120,80,190,0)"],
      ]);
      c.beginPath();
      c.moveTo(4, 0);
      c.lineTo(68, 0);
      for (let i = 0; i <= 6; i++) c.lineTo(68 - i * 10.6, 100 + (i % 2 ? 26 : 0) - (i % 3) * 8);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(200,160,255,0.55)";
      c.lineWidth = 1.5;
      for (let i = 1; i < 5; i++) {
        c.beginPath();
        c.moveTo(i * 14, 2);
        c.quadraticCurveTo(i * 14 + 6, 60, i * 14 - 2, 108);
        c.stroke();
      }
    },
  },
  // 넋 소용돌이: 다섯 팔로 촘촘히 감긴 자홍·보라 은하 소용돌이
  "harvest-vortex": {
    w: 256,
    h: 256,
    draw: (c) => {
      c.translate(128, 128);
      c.lineCap = "round";
      for (let arm = 0; arm < 5; arm++) {
        const steps = 60;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const pt = (t: number) => {
            const a = (arm / 5) * TAU + t * 5.2;
            const rr = 6 + t * 118;
            return [Math.cos(a) * rr, Math.sin(a) * rr] as const;
          };
          const [x0, y0] = pt(t0);
          const [x1, y1] = pt(t1);
          const k = Math.sin(t0 * Math.PI);
          c.strokeStyle = arm % 2 ? `rgba(240,90,200,${(0.9 * k).toFixed(3)})` : `rgba(170,110,255,${(0.95 * k).toFixed(3)})`;
          c.lineWidth = 1.5 + 8 * k;
          c.beginPath();
          c.moveTo(x0, y0);
          c.lineTo(x1, y1);
          c.stroke();
        }
      }
      blob(c, 0, 0, 30, [
        [0, "rgba(20,0,30,1)"],
        [0.7, "rgba(60,10,80,0.8)"],
        [1, "rgba(60,10,80,0)"],
      ]);
    },
  },
  // 넋 소용돌이에 끌려 나오는 넋: 입을 벌린 작은 자홍 넋
  "harvest-soul": {
    w: 32,
    h: 44,
    draw: (c) => {
      c.fillStyle = vgrad(c, 2, 44, [
        [0, "rgba(255,220,250,1)"],
        [0.6, "rgba(240,120,210,0.8)"],
        [1, "rgba(200,80,200,0)"],
      ]);
      ghostBody(c, 16, 2, 24, 40, 4);
      c.fill();
      c.fillStyle = "rgba(60,0,50,0.9)";
      for (const ex of [11, 21]) {
        c.beginPath();
        c.arc(ex, 14, 2.5, 0, TAU);
        c.fill();
      }
      c.beginPath();
      c.ellipse(16, 22, 3, 4.5, 0, 0, TAU);
      c.fill();
    },
  },
  // 망자의 초롱 (유령 손): 위로 뻗은 연보라 유령 손 (손바닥 + 손가락 넷 + 엄지). 바닥 원점
  "lantern-hand": {
    w: 48,
    h: 88,
    draw: (c) => {
      c.fillStyle = vgrad(c, 4, 88, [
        [0, "rgba(245,235,255,1)"],
        [0.55, "rgba(200,170,250,0.9)"],
        [1, "rgba(150,110,230,0)"],
      ]);
      c.beginPath();
      c.moveTo(14, 88);
      c.lineTo(12, 40);
      for (let i = 0; i < 4; i++) {
        const x = 12 + i * 7;
        const top = 6 + Math.abs(i - 1.5) * 5;
        c.lineTo(x, top + 4);
        c.quadraticCurveTo(x + 3.5, top - 2, x + 7, top + 4);
      }
      c.lineTo(40, 40);
      c.quadraticCurveTo(46, 34, 44, 46);
      c.lineTo(36, 56);
      c.lineTo(34, 88);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(120,80,200,0.6)";
      c.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(12 + i * 7, 14);
        c.lineTo(12 + i * 7, 34);
        c.stroke();
      }
    },
  },
  // 망자의 초롱 등: 금빛 종이 초롱 (살 다섯 + 위아래 검은 테)
  "lantern-lamp": {
    w: 36,
    h: 48,
    draw: (c) => {
      blob(c, 18, 26, 18, [
        [0, "rgba(255,240,180,0.9)"],
        [1, "rgba(255,200,90,0)"],
      ]);
      c.fillStyle = vgrad(c, 10, 42, [
        [0, "rgba(255,230,150,1)"],
        [1, "rgba(240,150,60,1)"],
      ]);
      c.beginPath();
      c.ellipse(18, 26, 12, 15, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(160,80,30,0.8)";
      c.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.ellipse(18, 26, Math.abs(i) * 5, 15, 0, 0, TAU);
        c.stroke();
      }
      c.fillStyle = "#2a1a14";
      c.fillRect(11, 9, 14, 4);
      c.fillRect(11, 39, 14, 4);
      c.fillRect(17, 2, 2, 8);
    },
  },
  // 별빛 행렬: 초롱 지팡이를 든 두건 쓴 넋 순례자 (오른쪽을 보고 걷는다)
  "proc-pilgrim": {
    w: 64,
    h: 96,
    draw: (c) => {
      c.fillStyle = vgrad(c, 8, 96, [
        [0, "rgba(240,250,255,1)"],
        [0.5, "rgba(160,240,220,0.85)"],
        [1, "rgba(150,120,240,0)"],
      ]);
      c.beginPath();
      c.moveTo(26, 8);
      c.quadraticCurveTo(44, 8, 44, 30);
      c.lineTo(48, 70);
      c.quadraticCurveTo(40, 96, 30, 82);
      c.quadraticCurveTo(22, 96, 12, 80);
      c.lineTo(14, 30);
      c.quadraticCurveTo(12, 8, 26, 8);
      c.fill();
      // 두건 속 어둠 (얼굴 없음)
      c.fillStyle = "rgba(20,30,60,0.85)";
      c.beginPath();
      c.ellipse(32, 26, 7, 9, 0.2, 0, TAU);
      c.fill();
      // 지팡이 + 초롱
      c.strokeStyle = "rgba(120,90,60,1)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(50, 90);
      c.lineTo(54, 16);
      c.stroke();
      blob(c, 56, 18, 9, [
        [0, "rgba(255,250,220,1)"],
        [1, "rgba(255,220,120,0)"],
      ]);
    },
  },
  // 별빛 행렬 별: 여덟 갈래 가는 금빛 별 (긴 십자 + 짧은 대각)
  "proc-star": {
    w: 128,
    h: 128,
    draw: (c) => {
      c.translate(64, 64);
      c.fillStyle = "rgba(255,240,190,1)";
      star(c, 0, 0, 62, 5, 4);
      c.fill();
      c.fillStyle = "rgba(160,250,230,0.85)";
      star(c, 0, 0, 34, 4, 4, -Math.PI / 4);
      c.fill();
      blob(c, 0, 0, 14, [
        [0, "rgba(255,255,255,1)"],
        [1, "rgba(255,240,190,0)"],
      ]);
    },
  },
  // 별빛 행렬 오로라: 하늘에서 드리우는 청록·보라 빛 커튼 (가로)
  "proc-aurora": {
    w: 256,
    h: 128,
    draw: (c) => {
      for (let i = 0; i < 26; i++) {
        const x = i * 10 + 3;
        const len = 70 + Math.sin(i * 0.9) * 30 + 20;
        c.fillStyle = vgrad(c, 0, len, [
          [0, i % 3 ? "rgba(120,250,210,0.0)" : "rgba(200,160,255,0.0)"],
          [0.4, i % 3 ? "rgba(120,250,210,0.55)" : "rgba(200,160,255,0.55)"],
          [1, "rgba(120,250,210,0)"],
        ]);
        c.fillRect(x, 0, 7, len);
      }
    },
  },
  // 별빛이 내리꽂히는 빛줄기 (세로, 바닥 원점): 금빛 가는 기둥 + 끝의 별
  "proc-beam": {
    w: 32,
    h: 192,
    draw: (c) => {
      // 금빛 바깥 빛 (가장자리가 흐리다) + 가는 흰 심지 (아래로 갈수록 밝다)
      for (const [x0, w, col] of [
        [6, 20, "rgba(255,210,120,0.35)"],
        [11, 10, "rgba(255,230,160,0.6)"],
        [14.5, 3, "rgba(255,255,240,0.9)"],
      ] as const) {
        c.fillStyle = vgrad(c, 0, 192, [
          [0, "rgba(255,230,160,0)"],
          [0.55, col],
          [1, col],
        ]);
        c.fillRect(x0, 0, w, 192);
      }
      blob(c, 16, 186, 12, [
        [0, "rgba(255,255,230,1)"],
        [1, "rgba(255,210,120,0)"],
      ]);
    },
  },
};

export type ArtKey = keyof typeof ART;

/** 스킬 그림 텍스처 키 (없으면 지금 그려 캐시) */
export function art(scene: Phaser.Scene, name: string): string {
  const key = `skart-${name}`;
  if (scene.textures.exists(key)) return key;
  const a = ART[name];
  if (!a || typeof document === "undefined") return "__WHITE";
  const cv = document.createElement("canvas");
  cv.width = a.w;
  cv.height = a.h;
  const c = cv.getContext("2d");
  if (!c) return "__WHITE";
  a.draw(c, a.w, a.h);
  const tex = scene.textures.addCanvas(key, cv);
  tex?.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** 그림 이름 목록 (검수용) */
export const ART_NAMES = Object.keys(ART);
