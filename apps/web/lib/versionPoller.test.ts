import { describe, expect, it } from "vitest";
import { CHECK_MIN_GAP_MS, CHECK_VISIBLE_MS, CHECK_WAITING_MS, type VersionInfo } from "./update";
import { VersionPoller, type VersionStatus } from "./versionPoller";

// 가짜 시계·타이머·탭 상태로 확인 일정을 본다
function rig(opts: { baseline?: string | null; hidden?: boolean; myClient?: number } = {}) {
  let now = 0;
  let hidden = opts.hidden ?? false;
  let server: VersionInfo = { version: "a", minClient: 5 };
  let fail = false;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextId = 1;
  const changes: VersionStatus[] = [];
  let fetches = 0;
  const p = new VersionPoller({
    fetchVersion: async () => {
      fetches++;
      if (fail) throw new Error("net");
      return server;
    },
    isHidden: () => hidden,
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (t) => void timers.delete(t as number),
    baseline: opts.baseline === undefined ? "a" : opts.baseline,
    myClient: opts.myClient ?? 5,
    onChange: (s) => changes.push(s),
  });
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    p,
    changes,
    get fetches() {
      return fetches;
    },
    /** 걸린 타이머 중 가장 이른 것까지 남은 시간 (없으면 null) */
    pending(): number | null {
      const ats = [...timers.values()].map((t) => t.at - now);
      return ats.length ? Math.min(...ats) : null;
    },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
        await flush();
      }
      now = end;
    },
    setServer: (v: VersionInfo) => (server = v),
    setHidden: (h: boolean) => (hidden = h),
    setFail: (f: boolean) => (fail = f),
    flush,
  };
}

describe("VersionPoller", () => {
  it("보이는 탭은 바로 한 번, 그 뒤 CHECK_VISIBLE_MS마다 묻는다", async () => {
    const r = rig();
    r.p.start();
    await r.flush();
    expect(r.fetches).toBe(1);
    expect(r.pending()).toBe(CHECK_VISIBLE_MS);
    await r.advance(CHECK_VISIBLE_MS);
    expect(r.fetches).toBe(2);
    expect(r.p.current).toEqual({ level: "none", deployReady: false });
  });

  it("웹이 큰 패치로 배포되면 다음 확인에서 required + deployReady (2분을 넘기지 않는다)", async () => {
    const r = rig();
    r.p.start();
    await r.flush();
    r.setServer({ version: "b", minClient: 6 });
    await r.advance(CHECK_VISIBLE_MS);
    expect(CHECK_VISIBLE_MS).toBeLessThanOrEqual(2 * 60_000);
    expect(r.p.current).toEqual({ level: "required", deployReady: true });
    expect(r.changes.at(-1)).toEqual({ level: "required", deployReady: true });
  });

  it("숨은 탭은 묻지 않고, 다시 보이면 바로 한 번", async () => {
    const r = rig();
    r.p.start();
    await r.flush();
    r.setHidden(true);
    r.p.onHidden();
    expect(r.pending()).toBeNull();
    await r.advance(30 * 60_000);
    expect(r.fetches).toBe(1);
    r.setServer({ version: "b", minClient: 6 });
    r.setHidden(false);
    r.p.onVisible();
    await r.flush();
    expect(r.fetches).toBe(2);
    expect(r.p.current.level).toBe("required");
    expect(r.pending()).toBe(CHECK_VISIBLE_MS);
  });

  it("처음부터 숨은 탭으로 열려도 타이머를 걸지 않는다", async () => {
    const r = rig({ hidden: true });
    r.p.start();
    await r.flush();
    expect(r.fetches).toBe(0);
    expect(r.pending()).toBeNull();
  });

  it("포커스·탭 전환이 잦아도 CHECK_MIN_GAP_MS 안에는 다시 묻지 않는다", async () => {
    const r = rig();
    r.p.start();
    await r.flush();
    r.p.onVisible();
    r.p.onVisible();
    await r.flush();
    expect(r.fetches).toBe(1);
    await r.advance(CHECK_MIN_GAP_MS);
    r.p.onVisible();
    await r.flush();
    expect(r.fetches).toBe(2);
  });

  it("실시간 서버가 거절하면(4010) 바로 required, 바로 한 번 보고 새 배포가 보일 때까지 15초마다", async () => {
    const r = rig();
    r.p.start();
    await r.flush();
    // 실시간 서버만 먼저 바뀜: 웹은 그대로
    r.p.markRejected();
    expect(r.p.current).toEqual({ level: "required", deployReady: false });
    await r.flush();
    expect(r.fetches).toBe(2);
    // 예전에는 거절 전에 걸어 둔 2분 타이머가 남아 있었다
    expect(r.pending()).toBe(CHECK_WAITING_MS);
    await r.advance(CHECK_WAITING_MS);
    expect(r.fetches).toBe(3);
    r.setServer({ version: "b", minClient: 6 });
    await r.advance(CHECK_WAITING_MS);
    expect(r.p.current).toEqual({ level: "required", deployReady: true });
    // 새 배포가 보였으면 다시 평소 주기
    expect(r.pending()).toBe(CHECK_VISIBLE_MS);
  });

  it("거절이 확인 도중에 와도 끝난 뒤 15초 주기로 바뀐다", async () => {
    const r = rig();
    r.p.start(); // 확인 진행 중
    r.p.markRejected();
    await r.flush();
    expect(r.fetches).toBe(1);
    expect(r.pending()).toBe(CHECK_WAITING_MS);
  });

  it("숨은 탭에서 거절돼도 한 번은 본다 (보일 때 바로 새로고침할 수 있게)", async () => {
    const r = rig();
    r.p.start();
    await r.flush();
    r.setHidden(true);
    r.p.onHidden();
    r.setServer({ version: "b", minClient: 6 });
    r.p.markRejected();
    await r.flush();
    expect(r.fetches).toBe(2);
    expect(r.p.current).toEqual({ level: "required", deployReady: true });
    expect(r.pending()).toBeNull();
  });

  it("단계는 내려가지 않고, 실패해도 다음 주기에 다시 본다", async () => {
    const r = rig();
    r.p.start();
    await r.flush();
    r.setServer({ version: "b", minClient: 5 });
    await r.advance(CHECK_VISIBLE_MS);
    expect(r.p.current).toEqual({ level: "patch", deployReady: true });
    r.setFail(true);
    await r.advance(CHECK_VISIBLE_MS);
    expect(r.p.current.level).toBe("patch");
    expect(r.pending()).toBe(CHECK_VISIBLE_MS);
    r.setFail(false);
    r.setServer({ version: "a", minClient: 5 }); // 롤백돼도 안내는 유지
    await r.advance(CHECK_VISIBLE_MS);
    expect(r.p.current).toEqual({ level: "patch", deployReady: true });
  });

  it("빌드 기준 값이 없으면 처음 받은 응답이 기준", async () => {
    const r = rig({ baseline: null });
    r.setServer({ version: "x", minClient: 5 });
    r.p.start();
    await r.flush();
    expect(r.p.current.level).toBe("none");
    r.setServer({ version: "y", minClient: 5 });
    await r.advance(CHECK_VISIBLE_MS);
    expect(r.p.current).toEqual({ level: "patch", deployReady: true });
  });

  it("stop 뒤에는 묻지도, 알리지도 않는다", async () => {
    const r = rig();
    r.p.start();
    r.p.stop();
    await r.flush();
    expect(r.changes).toEqual([]);
    expect(r.pending()).toBeNull();
    r.p.markRejected();
    r.p.onVisible();
    await r.flush();
    expect(r.fetches).toBe(1);
  });
});
