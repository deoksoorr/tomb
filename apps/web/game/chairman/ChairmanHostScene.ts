import * as Phaser from "phaser";
import { errorMessage } from "@/lib/api";
import { rpgApi } from "@/lib/rpg/client";
import type { RpgPlay } from "@/lib/rpg/types";
import { bridge } from "../bridge";
import type { GameContext } from "../scenes/context";
import { bestOf, chairApi } from "./api";
import { mountChairOverlay } from "./mountOverlay";
import { CHAIR_REFUND_MS } from "@/lib/chairman/rules";
import type { ChairMode } from "./rules";

// 11/20 회장님 독대 진입·결과를 맡는 보이지 않는 씬 (게임이 뜰 때부터 켜져 있다 — RpgHostScene과 같은 방식).
//  chairman:enter {mode, practice} → 판 시작(서버 티켓) → rpg:play(play.chairman) → HuntScene이 회장실 싸움
//  쓰러짐·회색 연출 끝 → 서버에 판 끝 → chairman:result (오버레이 결과 창)
//  chairman:retry → 한 판 더 (남은 판이 없으면 연습 판) · chairman:exit → 마을로
//  11/22 chairman:leave (브리핑 멈춤 창 나가기) → 유료 판이면 /abort (판 돌려받기, 최대 1.5초 기다림) → 마을로 → chairman:aborted
// 오버레이(피해 계기판·브리핑·결과 창 + 사냥 HUD)는 여기서 document.body에 직접 띄운다 (GameShell을 고치지 않는다).

/** 판 끝 제한 시간 (서버 최대 20분보다 넉넉히 — 끝은 싸움이 20분에 낸다) */
const RUN_SEC = 22 * 60;
/** 시작 전 나가기: 서버 답을 이만큼만 기다리고 마을로 (답은 늦게 와도 알린다) */
const ABORT_WAIT_MS = 1500;
/** 돌려받기 마감 안내를 서버 창보다 이만큼 일찍 (시계·전송 지연) */
const REFUND_EDGE_MS = 5000;
export class ChairmanHostScene extends Phaser.Scene {
  private busy = false;
  private inRun = false;
  private last: { mode: ChairMode; practice: boolean; remaining: { normal: number; hell: number } | null } | null = null;
  private unmount: (() => void) | null = null;
  /** 진행 중 판 티켓 (끝·나가기에서 비운다) */
  private cur: { ticket: string; practice: boolean } | null = null;

  constructor() {
    super({ key: "chairman-host", active: true });
  }

  create(): void {
    const offs = [
      bridge.on("chairman:enter", (p) => void this.enter(p.mode, !!p.practice)),
      bridge.on("chairman:retry", () => this.retry()),
      bridge.on("chairman:exit", () => this.exit()),
      bridge.on("chairman:leave", () => void this.leave()),
      // 판이 닫히면 (결과 창에서 나가기·탭 닫기) 오버레이도 정리
      bridge.on("rpg:ended", () => {
        if (!this.inRun) return;
        this.inRun = false;
      }),
    ];
    const ctx = this.registry.get("ctx") as GameContext | undefined;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      for (const o of offs) o();
      this.unmount?.();
      this.unmount = null;
    };
    ctx?.disposers.push(cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    // 개발 서버에서만: 주소 ?chair=normal|hell 이면 바로 들어간다 (화면 확인용 — 운영 빌드에서는 없다)
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      (window as unknown as { __chairman?: (m?: ChairMode, practice?: boolean) => void }).__chairman = (m = "normal", practice = false) => bridge.emit("chairman:enter", { mode: m, practice });
      const q = /[?&]chair=(normal|hell)/.exec(location.search);
      if (q) this.time.delayedCall(1500, () => bridge.emit("chairman:enter", { mode: q[1] as ChairMode, practice: false }));
    }
  }

  private async enter(mode: ChairMode, practice: boolean): Promise<void> {
    if (this.busy || this.inRun) return;
    this.busy = true;
    this.unmount ??= mountChairOverlay();
    bridge.emit("chairman:ui", { kind: "status", state: "starting" });
    try {
      const view = await rpgApi.view();
      const c = view.character;
      const [res, st] = await Promise.all([chairApi.start(mode, practice, c.hotbar, c.skills), chairApi.status()]);
      const ctx = this.registry.get("ctx") as GameContext | undefined;
      const best = bestOf(st, mode);
      this.last = { mode, practice: res.practice, remaining: res.remaining };
      const ticket = res.ticket;
      this.cur = { ticket, practice: res.practice };
      const refund = !res.practice && typeof res.refundLeft === "number" ? { refundLeft: res.refundLeft, refundUntil: Date.now() + CHAIR_REFUND_MS - REFUND_EDGE_MS } : {};
      const play: RpgPlay = {
        game: "hunt",
        difficulty: "hell",
        seed: res.seed,
        timeLimitSec: RUN_SEC,
        level: c.level,
        derived: view.derived,
        skills: c.skills,
        ...(c.tSkills && Object.keys(c.tSkills).length ? { tSkills: c.tSkills } : {}),
        hotbar: c.hotbar,
        ...(c.hotAuto ? { hotAuto: c.hotAuto } : {}),
        potions: c.potions,
        equip: c.equip,
        ...(c.sgEgg ? { sgEgg: c.sgEgg } : {}),
        noDrops: true,
        chairman: {
          mode,
          practice: res.practice,
          sealPool: res.sealPool ?? [],
          best,
          acct: ctx?.opts.name ?? "me",
          ...refund,
          ended: (r) => void this.finishRun(ticket, mode, res.practice, best, r),
        },
      };
      this.inRun = true;
      bridge.emit("rpg:play", play);
    } catch (e) {
      bridge.emit("chairman:ui", { kind: "status", state: "error", message: errorMessage(e) });
    } finally {
      this.busy = false;
    }
  }

  private async finishRun(ticket: string, mode: ChairMode, practice: boolean, best: number, r: { damage: number; durationMs: number; timeUp: boolean; potionsUsed: Record<string, number>; god?: boolean }): Promise<void> {
    // 11/21 무적(시험)을 켠 판은 연습 판 (서버도 개발 서버에서만 god을 보고 기록·포인트 없이 끝낸다)
    const god = process.env.NODE_ENV !== "production" && r.god === true;
    const prac = practice || god;
    // 11/22 결과 창: 연습 버튼으로 시작한 판만 「연습」, 무적 판은 「무적 시험」으로 따로
    const tag = { practice, ...(god ? { god: true } : {}) };
    this.cur = null;
    try {
      // 쓴 물약은 서버가 빼도록 같이 보낸다 (계약 밖 — 서버가 안 읽으면 무시된다)
      const extra = { ...(Object.keys(r.potionsUsed).length ? { potionsUsed: r.potionsUsed } : {}), ...(god ? { god: true } : {}) };
      const res = await chairApi.finish(ticket, r.damage, r.durationMs, extra);
      if (this.last) this.last.remaining = res.remaining;
      bridge.emit("chairman:result", {
        mode,
        ...tag,
        damage: res.damage ?? r.damage,
        durationMs: r.durationMs,
        points: prac ? null : res.points,
        ...(res.pointsReason ? { pointsReason: res.pointsReason } : {}),
        newBest: res.newBest,
        best: res.best,
        weekRank: res.weekRank ?? null,
        remaining: res.remaining,
      });
    } catch (e) {
      bridge.emit("chairman:result", { mode, ...tag, damage: r.damage, durationMs: r.durationMs, points: null, newBest: false, best, weekRank: null, remaining: this.last?.remaining ?? null, error: errorMessage(e) });
    }
  }

  /** 지금 판(결과만 남은) 닫기 → 월드가 다시 보인다 */
  private closeRun(): void {
    if (this.inRun) bridge.emit("rpg:quit");
    this.inRun = false;
  }

  private retry(): void {
    const l = this.last;
    if (!l) return;
    this.closeRun();
    const left = l.remaining ? l.remaining[l.mode] : 0;
    // 남은 판이 없으면 연습 판
    void this.enter(l.mode, l.practice || left <= 0);
  }

  /** 11/22 브리핑(시작 전)에서 나가기: 유료 판이면 판 돌려받기를 부르고 (최대 1.5초) 마을로. 돌려받았으면 chairman:aborted */
  private async leave(): Promise<void> {
    const cur = this.cur;
    this.cur = null;
    if (!cur || cur.practice) return this.exit();
    let res: Awaited<ReturnType<typeof chairApi.abort>> | undefined;
    const p = chairApi.abort(cur.ticket).then(
      (r) => (res = r),
      () => null,
    );
    await Promise.race([p, new Promise((r) => setTimeout(r, ABORT_WAIT_MS))]);
    this.exit();
    const tell = (r: Awaited<ReturnType<typeof chairApi.abort>> | undefined) => {
      if (!r) return;
      if (this.last) this.last.remaining = r.remaining;
      bridge.emit("chairman:aborted", { refunded: r.refunded, remaining: r.remaining, refundLeft: r.refundLeft });
    };
    if (res !== undefined) tell(res);
    else void p.then((r) => tell(r ?? undefined));
  }

  private exit(): void {
    this.cur = null;
    this.closeRun();
    this.unmount?.();
    this.unmount = null;
  }
}
