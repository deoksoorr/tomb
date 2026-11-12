import { describe, expect, it } from "vitest";
import { DYE_BOARD_H, DYE_BOARD_W, DYE_LIMIT } from "@/lib/dye/palette";
import { BoardPointers, clampView, dyeCloseGuard, KEY_PAN_FAST, KEY_PAN_PX, keyPan, MAX_SCALE, minScale, startScale, wheelFactor, zoomAt, type BoardView } from "./board";
import { glintStops } from "./spots";

// 46번 염색 판 화면 계산: 빠른 휠·한계·판 밖 입력에도 화면 값이 늘 유한하고 한계 안이다

const W = 800;
const H = 500;
const ok = (v: BoardView) =>
  Number.isFinite(v.cx) && Number.isFinite(v.cy) && v.scale >= minScale(W, H) - 1e-9 && v.scale <= MAX_SCALE && Math.abs(v.cx) <= DYE_LIMIT && Math.abs(v.cy) <= DYE_LIMIT;

describe("46번 염색 판 확대·축소", () => {
  it("최대·최소 사이를 빠르게 왔다 갔다 해도 한계에서 멈추고 NaN·무한대가 생기지 않는다", () => {
    let v: BoardView = clampView({ cx: 160, cy: 100, scale: minScale(W, H) * 1.4 }, W, H);
    const deltas = [-1e6, 1e6, -5000, 5000, -120, 120, NaN, Infinity, -Infinity, 0, -1e308, 1e308];
    for (let n = 0; n < 5000; n++) {
      const d = deltas[n % deltas.length] * (n % 7 === 0 ? -1 : 1);
      v = zoomAt(v, W, H, W / 2, H / 2, wheelFactor(d, n % 3));
      expect(ok(v)).toBe(true);
    }
    // 한계 고정
    for (let n = 0; n < 50; n++) v = zoomAt(v, W, H, W / 2, H / 2, wheelFactor(-1e9));
    expect(v.scale).toBe(MAX_SCALE);
    for (let n = 0; n < 50; n++) v = zoomAt(v, W, H, W / 2, H / 2, wheelFactor(1e9));
    expect(v.scale).toBeCloseTo(minScale(W, H));
  });

  it("휠 한 번 배율은 ½~2배, NaN·무한대 입력은 1", () => {
    expect(wheelFactor(NaN)).toBe(1);
    expect(wheelFactor(Infinity)).toBe(1);
    expect(wheelFactor(1e9)).toBeGreaterThan(0.49);
    expect(wheelFactor(-1e9)).toBeLessThan(2.01);
  });

  it("이미 망가진 화면 값(NaN·0 배율·0 크기 창)도 정상으로 되돌린다", () => {
    for (const bad of [{ cx: NaN, cy: NaN, scale: NaN }, { cx: 1e12, cy: -Infinity, scale: 0 }, { cx: 10, cy: 10, scale: Infinity }]) {
      const v = clampView(bad, W, H);
      expect(ok(v)).toBe(true);
      expect(ok(zoomAt(bad, W, H, NaN, NaN, NaN))).toBe(true);
      const z = clampView(bad, 0, 0);
      expect(Number.isFinite(z.cx) && Number.isFinite(z.cy) && Number.isFinite(z.scale) && z.scale > 0).toBe(true);
    }
  });

  it("끝없는 판: 구역(320×200) 밖으로도 끌 수 있고 좌표 한계에서만 멈춘다", () => {
    const v = clampView({ cx: -5000, cy: 123_456, scale: 4 }, W, H);
    expect(v.cx).toBe(-5000);
    expect(v.cy).toBe(123_456);
    expect(clampView({ cx: 1e9, cy: -1e9, scale: 4 }, W, H).cx).toBeLessThan(DYE_LIMIT);
  });

  it("금빛 광택 색 멈춤은 언제나 0~1 (예전엔 범위를 벗어나 addColorStop 예외로 그리기 루프가 죽었다)", () => {
    for (let t = -50; t < 50; t += 0.013) for (const s of glintStops(t)) expect(s >= 0 && s <= 1).toBe(true);
    expect(glintStops(NaN).every((s) => s >= 0 && s <= 1)).toBe(true);
  });
});

describe("46번 염색 판 포인터: 커서 자리·마우스 클릭은 판에 영향이 없다", () => {
  const v0: BoardView = { cx: 160, cy: 100, scale: 8 };

  it("버튼 없이 지나가는 마우스·클릭·오른쪽 버튼은 판을 옮기지 않는다", () => {
    const p = new BoardPointers();
    expect(p.move(1, "mouse", 0, 10, 10, v0, W, H)).toBeNull(); // 누르지 않고 지나감
    expect(p.down(1, "mouse", 2, 10, 10)).toBe(false); // 오른쪽 버튼
    expect(p.down(1, "mouse", 0, 10, 10)).toBe(true);
    expect(p.up(1)).toBeNull(); // 마우스 클릭은 가운데로 옮기기도 아니다
    expect(p.size).toBe(0);
  });

  it("왼쪽 버튼으로 끌면 옮기고, 판 밖에서 놓은 뒤(buttons 0) 돌아온 커서는 무시", () => {
    const p = new BoardPointers();
    p.down(1, "mouse", 0, 100, 100);
    const v1 = p.move(1, "mouse", 1, 80, 100, v0, W, H)!;
    expect(v1.cx).toBeCloseTo(160 + 20 / 8);
    // 창 밖에서 버튼을 놓아 up을 못 받음 → 버튼 없이 움직이면 끌기 끝
    expect(p.move(1, "mouse", 0, 500, 300, v1, W, H)).toBeNull();
    expect(p.size).toBe(0);
    expect(p.move(1, "mouse", 1, 0, 0, v1, W, H)).toBeNull();
  });

  it("붙잡기 풀림·취소·창 초점 잃음 → 기록을 지워 남은 기록 때문에 확대가 이어지지 않는다", () => {
    const p = new BoardPointers();
    p.down(1, "touch", 0, 100, 100);
    p.drop(1); // lostpointercapture
    expect(p.size).toBe(0);
    p.down(2, "touch", 0, 100, 100);
    p.down(3, "touch", 0, 200, 100);
    p.clear(); // 창 blur
    expect(p.size).toBe(0);
    // 마우스는 남은 터치 기록과 두 손가락 확대가 되지 않는다
    p.down(4, "touch", 0, 100, 100);
    p.down(5, "mouse", 0, 300, 300);
    expect(p.size).toBe(1);
    const v = p.move(5, "mouse", 1, 310, 300, v0, W, H)!;
    expect(v.scale).toBe(v0.scale);
  });

  it("두 손가락 확대·축소, 짧게 누르기(폰)는 그 자리를 가운데로", () => {
    const p = new BoardPointers();
    p.down(1, "touch", 0, 100, 100);
    p.down(2, "touch", 0, 200, 100);
    const z = p.move(2, "touch", 1, 300, 100, v0, W, H)!;
    expect(z.scale).toBeCloseTo(16);
    expect(p.up(2)).toBeNull();
    expect(p.up(1)).toBeNull(); // 확대 뒤 떼기는 누르기가 아니다
    p.down(3, "touch", 0, 50, 60);
    expect(p.up(3)).toEqual({ x: 50, y: 60 });
  });

  it("판 밖·NaN 좌표 누름은 받지 않는다", () => {
    const p = new BoardPointers();
    expect(p.down(1, "mouse", 0, NaN, 10)).toBe(false);
    expect(p.size).toBe(0);
  });
});

describe("11/12 염색 판: 넓게 축소 · WASD 이동 · 닫힘 보호", () => {
  it("최소 배율이 예전(구역 0.45배)의 1/8 이하 — 여러 구역이 한눈에, 처음 배율은 예전 그대로", () => {
    const old = Math.max(W / (DYE_BOARD_W * 0.45), H / (DYE_BOARD_H * 0.45));
    expect(minScale(W, H)).toBeLessThanOrEqual(old / 8);
    expect(startScale(W, H)).toBeCloseTo(old * 1.4);
    // 휠을 아무리 굴려도 최소 배율에서 멈춘다
    let v: BoardView = clampView(
      { cx: 160, cy: 100, scale: startScale(W, H) },
      W,
      H,
    );
    for (let k = 0; k < 200; k++)
      v = zoomAt(v, W, H, W / 2, H / 2, wheelFactor(400));
    expect(v.scale).toBeCloseTo(minScale(W, H));
    expect(W / v.scale / DYE_BOARD_W).toBeGreaterThanOrEqual(3); // 가로로 구역 3장 이상
  });

  it("키 이동: 화면 px/초로 일정, Shift는 빠르게, 대각선은 같은 빠르기, 반대 키는 지운다", () => {
    const s = 2;
    const right = keyPan(["KeyD"], false, 100, s);
    expect(right.dx).toBeCloseTo((KEY_PAN_PX * 0.1) / s);
    expect(right.dy).toBe(0);
    expect(keyPan(["ArrowUp"], false, 100, s).dy).toBeCloseTo(
      (-KEY_PAN_PX * 0.1) / s,
    );
    expect(keyPan(["KeyD"], true, 100, s).dx).toBeCloseTo(
      (KEY_PAN_PX * KEY_PAN_FAST * 0.1) / s,
    );
    const diag = keyPan(["KeyW", "KeyA"], false, 100, s);
    expect(diag.dx).toBeLessThan(0);
    expect(diag.dy).toBeLessThan(0);
    expect(Math.hypot(diag.dx, diag.dy)).toBeCloseTo(right.dx);
    expect(keyPan(["KeyA", "KeyD"], false, 100, s)).toEqual({ dx: 0, dy: 0 });
    expect(keyPan(["KeyQ", "Space"], false, 100, s)).toEqual({ dx: 0, dy: 0 });
    // 오래 비운 프레임은 100ms로 자르고, NaN·0 배율은 움직이지 않는다
    expect(keyPan(["KeyD"], false, 5000, s).dx).toBeCloseTo(right.dx);
    expect(keyPan(["KeyD"], false, NaN, s)).toEqual({ dx: 0, dy: 0 });
    expect(keyPan(["KeyD"], false, 16, 0)).toEqual({ dx: 0, dy: 0 });
  });

  it("판·고르기·결과 단계는 배경 클릭으로 안 닫히고, 판·고르기의 Esc는 그만두기 확인", () => {
    expect(dyeCloseGuard("part")).toEqual({
      backdrop: true,
      escConfirm: false,
    });
    for (const p of ["play", "choose"])
      expect(dyeCloseGuard(p)).toEqual({ backdrop: false, escConfirm: true });
    for (const p of ["sending", "done"])
      expect(dyeCloseGuard(p).backdrop).toBe(false);
  });
});
