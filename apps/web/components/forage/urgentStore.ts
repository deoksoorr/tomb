"use client";

import { useEffect, useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { urgentApi } from "@/lib/forage/quests/urgentClient";
import { FEST_MS, GOAL_CHEER_MS, urgentStage } from "@/lib/forage/quests/urgent";
import type { UrgentDeliverResponse, UrgentMeResponse, UrgentPublic } from "@/lib/forage/quests/urgentTypes";

// 11/15: 긴급 의뢰의 클라이언트 사본 (위쪽 막대·게시판 칸이 같이 본다).
//  - 서버 전체 상태(/api/forage/urgent)는 누구에게나 같아 CDN이 몇 초 캐시한다 → 진행 중 5초, 막 끝났으면 20초, 없으면 15초마다 묻는다 (탭이 숨으면 멈춘다)
//  - 내 것(/api/forage/urgent/me)은 게시판을 열 때·의뢰가 끝났을 때만
//  - 축제 끝 시각은 게임에 urgent:fest로 알린다 (폭죽·금빛 모닥불)

// 11/22 시작 알림 창(announce·본 의뢰 기억)은 뺐다 — 시작 알림은 마을 소식 가운데 표시 하나로
export type UrgentSnapshot = { pub: UrgentPublic | null; mine: UrgentMeResponse | null; error: string | null };

class UrgentClientStore {
  private snap: UrgentSnapshot = { pub: null, mine: null, error: null };
  private listeners = new Set<() => void>();
  private users = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private mineInflight: Promise<void> | null = null;
  /** 끝난 것을 본 의뢰 (끝나면 내 것을 한 번 다시 받는다) */
  private doneSeen = new Set<string>();
  /** 100% 축하 폭죽을 쏜 의뢰 (한 번만) */
  private cheered = new Set<string>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snap;

  private set(next: Partial<UrgentSnapshot>) {
    this.snap = { ...this.snap, ...next };
    this.listeners.forEach((fn) => fn());
    const until = this.snap.pub?.ev?.festUntil ?? 0;
    if ((bridge.last("urgent:fest")?.until ?? 0) !== until) bridge.emit("urgent:fest", { until });
    // 버스 정류장 마당 긴급 의뢰 현판 막대
    const ev = this.snap.pub?.ev;
    const now = Date.now();
    const board = ev ? { live: now < ev.end, frac: ev.goal > 0 ? Math.min(1, ev.n / (ev.goal * 1.5)) : 0, stage: urgentStage(ev.n, ev.goal), fest: until > now } : null;
    // 100% 축하 폭죽: 서버가 남긴 "100%에 닿은 시각"(goalAt)이 막 지났으면 한 번 (응답을 만든 서버 시각 at 기준이라 기기 시계와 상관없다).
    // 예전엔 "100% 밑에서 본 적이 있어야" 쐈는데, 물음 사이(5초)에 0%→100%로 바로 넘거나 처음 본 게 이미 100%면 놓쳤다
    const pub = this.snap.pub;
    if (ev && pub && ev.goalAt > 0 && !this.cheered.has(ev.id)) {
      this.cheered.add(ev.id);
      if (pub.at - ev.goalAt < GOAL_CHEER_MS) bridge.emit("urgent:goal");
    }
    const prev = bridge.last("urgent:board");
    if (JSON.stringify(prev ?? null) !== JSON.stringify(board)) bridge.emit("urgent:board", board);
  }

  /** 서버 전체 상태 다시 받기 */
  refresh(): Promise<void> {
    this.inflight ??= urgentApi
      .status()
      .then((pub) => this.accept(pub))
      .catch((e) => this.set({ error: errorMessage(e) }))
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** 내 것 다시 받기 */
  refreshMine(): Promise<void> {
    this.mineInflight ??= urgentApi
      .me()
      .then((mine) => this.set({ mine }))
      .catch(() => undefined)
      .finally(() => {
        this.mineInflight = null;
      });
    return this.mineInflight;
  }

  /** 새 서버 상태 받기: 끝난 걸 처음 보면 내 보상 확인 */
  private accept(pub: UrgentPublic) {
    const ev = pub.ev;
    const now = Date.now();
    this.set({ pub, error: null });
    if (ev && now >= ev.end && !this.doneSeen.has(ev.id)) {
      this.doneSeen.add(ev.id);
      void this.refreshMine();
    }
  }

  /** 시험 버튼 응답 등으로 받은 상태 (물음 간격도 새 상태에 맞춰 바로 다시 잡는다) */
  setPublic(pub: UrgentPublic) {
    this.accept(pub);
    if (this.users) {
      if (this.timer) clearTimeout(this.timer);
      const gen = ++this.gen;
      this.timer = setTimeout(() => this.loop(gen), this.nextDelay());
    }
  }

  /** 납품 응답으로 막대·내 수를 바로 고친다 (다음 물음까지 기다리지 않게) */
  applyDeliver(id: string, r: UrgentDeliverResponse) {
    const ev = this.snap.pub?.ev;
    if (ev && ev.id === id) {
      // 내 납품으로 100%를 넘겼으면 다음 물음을 기다리지 않고 바로 축하
      const crossed = ev.goalAt === 0 && urgentStage(ev.n, ev.goal) < 100 && urgentStage(r.n, r.goal) >= 100;
      const at = Date.now();
      // 11/15 150%에 닿았으면 그 시각에 끝난다 (축제 끝 − 1시간 = 닿은 시각) → 다음 물음을 기다리지 않고 바로 끝난 화면·보상 받기
      const fest = r.festUntil > 0 ? r.festUntil - FEST_MS : 0;
      const early = fest > 0 && fest < ev.end ? { end: fest, early: true } : {};
      this.set({ pub: { ...this.snap.pub!, at: crossed ? at : this.snap.pub!.at, ev: { ...ev, n: Math.max(ev.n, r.n), festUntil: r.festUntil || ev.festUntil, goalAt: crossed ? at : ev.goalAt, ...early } } });
      if (fest > 0 && !this.doneSeen.has(id)) {
        this.doneSeen.add(id);
        void this.refreshMine();
      }
    }
    const mine = this.snap.mine;
    if (mine) this.set({ mine: { ...mine, rows: mine.rows.map((row) => (row.id === id ? { ...row, mine: r.mine, n: Math.max(row.n, r.n), ...(r.cap ? { cap: r.cap, left: Math.max(0, r.cap - r.mine) } : {}) } : row)) } });
  }

  private nextDelay(): number {
    const ev = this.snap.pub?.ev;
    const now = Date.now();
    // 없을 때 15초: 시작(또는 시험 시작)을 다른 창도 금방 알아채게 — 서버는 이때 저장소를 읽지 않는다
    if (!ev) return 15_000;
    if (now < ev.end) return 5_000;
    return 20_000;
  }

  /** 묻기 고리 세대 (탭이 다시 보이면 새로 시작 — 고리가 둘로 갈라지지 않게) */
  private gen = 0;

  private loop = (gen: number) => {
    if (gen !== this.gen || !this.users) return;
    this.timer = null;
    const go = typeof document === "undefined" || document.visibilityState === "visible";
    const p = go ? this.refresh() : Promise.resolve();
    void p.finally(() => {
      if (gen === this.gen && this.users) this.timer = setTimeout(() => this.loop(gen), this.nextDelay());
    });
  };

  private restart() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.loop(++this.gen);
  }

  private onVisible = () => {
    if (document.visibilityState === "visible" && this.users) this.restart();
  };

  /** 화면이 쓰는 동안 주기적으로 묻는다 (몇 군데서 불러도 한 번만) */
  use(): () => void {
    this.users++;
    if (this.users === 1) {
      document.addEventListener("visibilitychange", this.onVisible);
      this.restart();
    }
    return () => {
      this.users--;
      if (this.users > 0) return;
      document.removeEventListener("visibilitychange", this.onVisible);
      this.gen++;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    };
  }
}

export const urgentStore = new UrgentClientStore();

/** 긴급 의뢰 상태 (쓰는 동안 주기적으로 받는다) */
export function useUrgent(): UrgentSnapshot {
  useEffect(() => urgentStore.use(), []);
  return useSyncExternalStore(urgentStore.subscribe, urgentStore.getSnapshot, urgentStore.getSnapshot);
}
