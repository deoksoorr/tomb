import * as Phaser from "phaser";
import {
  CAMP_RAFTS,
  CAMP_TRADER_STALL,
  CAMP_RAFT_ART_H,
  CAMP_RAFT_HUT_DX,
  RAFT_RENEW_WINDOW_MS,
  campRaftAt,
  campRaftDeck,
  campRaftOfSpot,
  campRaftSeatDx,
  campRaftSpots,
  raftGrantMin,
  raftOutText,
  raftPriceFor,
  type RaftBoardEntry,
  type RaftOutWhy,
  type Sid,
} from "@tomb/protocol";
import { isSnowy, MAP_CONCEPTS, type MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { request } from "@/lib/api";
import type { RaftMine, RaftStatusResponse } from "@/lib/raft/types";
import { TEX } from "../assets/manifest";
import { bridge, type ForageRodPhase, type RaftPrompt } from "../bridge";
import { DEPTH } from "../config";
import type { Player } from "../entities/Player";
import type { RealtimeClient } from "../net/RealtimeClient";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { Lighting } from "../world/Lighting";
import { BOOTH_H, BOOTH_LAMPS, BOOTH_W, BOOTH_WINDOW, lampArt, raftClerkWindow } from "./raftBoothArt";
import { HOLE_OX, HOLE_OY, RAFT_HOLDER_UP, raftFloatAt, raftIceHoleArt, raftRig, raftRigBaseArt, raftRodTipArt, RIG_OX, RIG_OY, rodDir, TIP_OX, TIP_OY, type RaftRig } from "./raftRodsArt";
import { pondIcy } from "./valleyGround";

// 11/27 캠핑장 좌대 입장권 (화면). 규칙은 protocol raft.ts, 판매는 웹(/api/camp/raft), 마루 막기는 실시간 서버.
//  - 좌대 매표소: 옛 미끼·대여 부스 자리 (그림 game/camp/raftBoothArt — world/forage/art.ts가 FTEX.campStall로 올린다).
//    창 안 매표소 직원(두 프레임)과 현황판 1~6 등(빈 좌대 초록 · 입장 중 빨강 — 실시간 좌대 주인 표)은 여기서 부스 위에 덧그린다. 밤엔 창·등에 더하기 빛
//  - 내 좌대가 아니면 마루를 막는다 (부드럽게 보이도록 화면도 막고, 서버가 raftOut으로 최종 판정)
//  - 쓰는 중인 좌대 앞에 주인 이름표 · 주인이 의자에 앉아 있으면 받침틀에 낚싯대 넷 (그림 raftRodsArt — 찌가 까딱이고, 입질이면 방울이 흔들린다. 밤엔 전자찌 불빛)
//  - 끝나기 1분 전 내 좌대 위에 있으면 연장 칸 (components/camp/RaftRenew)

/** 부스 그림 왼쪽 위 (Foraging STALL_AT trader: 받침 = CAMP_TRADER_STALL, 그림은 2칸 아래로 — 아래 두 줄이 그림자) */
export const RAFT_BOOTH_ART = { x: CAMP_TRADER_STALL.x - BOOTH_W / 2, y: CAMP_TRADER_STALL.y + 2 - BOOTH_H, depth: CAMP_TRADER_STALL.y } as const;
const RIG_TEX = (wide: boolean) => `raft-rig-${wide ? "w" : "n"}`;
const TIP_TEX = (dir: number, odd: boolean, lit: boolean, bob: boolean, bite: boolean) => `raft-tip-${dir < 0 ? "l" : "r"}${odd ? 1 : 0}${lit ? 1 : 0}${bob ? 1 : 0}${bite ? 1 : 0}`;
const CLERK_TEX = (c: MapConcept, lit: boolean, f: number) => `raft-clerk-${c}-${lit ? 1 : 0}-${f}`;
const LAMP_TEX = (free: boolean, lit: boolean) => `raft-lamp-${free ? 1 : 0}${lit ? 1 : 0}`;
const HOLE_TEX = "raft-ice-hole";
/** 전자찌 불빛 색 (짝수 대 빨강 · 홀수 대 초록) */
const LED = [0xff6a5a, 0x7affa0] as const;
/** 남의 좌대(또는 자동 낚시)에서 가끔 방울이 흔들리는 간격·길이 (입질 신호가 없는 화면의 생기 — 내 손 낚시 중엔 진짜 입질만) */
const IDLE_BITE_EVERY = 11_000;
const IDLE_BITE_MS = 700;

type Rig = { n: number; base: Phaser.GameObjects.Image; tips: Phaser.GameObjects.Image[]; leds: Phaser.GameObjects.Image[]; holes: Phaser.GameObjects.Image[]; rig: RaftRig; sx: number; fy: number; mine: boolean };

const LABEL_TINT = 0xffe8b0;
const MINE_TINT = 0xb8f0c8;

export type CampRaftsDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  colliders: Phaser.Physics.Arcade.StaticGroup;
  player: () => Player;
  net: () => RealtimeClient;
  seats: () => ReadonlyMap<string, Sid>;
  toast: (message: string) => void;
  /** 매표소가 밤 그림인지 (부스 그림과 같은 때 — world/forage/Foraging boothLit) */
  boothLit: () => boolean;
  /** 지금 어둠 세기 0~1 (더하기 빛 세기) */
  dark: () => number;
  /** 서버가 내려보냈다: 이 자리로 옮긴다 (앉아 있으면 일어나서) */
  warp: (x: number, y: number) => void;
};

export class CampRafts {
  /** 좌대 입장권을 파는 서버인지 (상태를 한 번이라도 받았으면) — 아니면 아무것도 막지 않는다 */
  private enabled = false;
  private mine: RaftMine | null = null;
  private dayLeftMin = 0;
  /** 서버 시각 - 화면 시각 */
  private offset = 0;
  private board: RaftBoardEntry[] = [];
  private readonly zones = new Map<number, Phaser.GameObjects.Zone>();
  private readonly labels = new Map<number, Phaser.GameObjects.BitmapText>();
  /** 주인이 앉아 있는 좌대의 낚싯대 넷 */
  private readonly rigs = new Map<number, Rig>();
  private readonly clerk: Phaser.GameObjects.Image;
  private readonly lamps: Phaser.GameObjects.Image[] = [];
  /** 밤 더하기 빛: 창 · 등 여섯 */
  private readonly winGlow: Phaser.GameObjects.Image;
  private readonly lampGlows: Phaser.GameObjects.Image[] = [];
  private concept: MapConcept = "default";
  private lit = false;
  private clerkFrame = 0;
  private clerkAt = 0;
  /** 내 손 낚시 단계 (입질이면 내 좌대 방울이 흔들린다) · 그 단계가 시작된 시각 */
  private rodPhase: ForageRodPhase = "idle";
  private rodPhaseAt = 0;
  private biteCount = 0;
  private promptKey = "";
  /** 남은 시간 게이지로 보낸 입장권 (n:끝 — 바뀔 때만 보낸다) */
  private ticketKey = "";
  private warnedAt = 0;
  /** 연장 못 하는 마지막 1분 안내를 한 입장권 끝 */
  private endWarned = 0;
  private checkAt = 0;
  private loading = false;
  private readonly offs: (() => void)[] = [];

  constructor(private readonly d: CampRaftsDeps) {
    const s = d.scene;
    this.ensureTextures();
    this.concept = currentMapConcept();
    this.lit = d.boothLit();
    // 매표소 직원: 매표 창 안 (창 13×12를 통째로 — 유리·직원·판매대). 부스 그림 바로 위
    const A = RAFT_BOOTH_ART;
    this.clerk = s.add
      .image(A.x + BOOTH_WINDOW.x, A.y + BOOTH_WINDOW.y, CLERK_TEX(this.concept, this.lit, 0))
      .setOrigin(0, 0)
      .setDepth(A.depth + 0.2);
    // 현황판 등 여섯 (빈 좌대 초록 · 입장 중 빨강)
    BOOTH_LAMPS.forEach((p) => this.lamps.push(s.add.image(A.x + p.x, A.y + p.y, LAMP_TEX(true, this.lit)).setOrigin(0, 0).setDepth(A.depth + 0.3)));
    this.winGlow = s.add
      .image(A.x + 14, A.y + 27, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffc870)
      .setScale(0.9, 0.75)
      .setDepth(DEPTH.lights + 1)
      .setAlpha(0);
    BOOTH_LAMPS.forEach((p) => this.lampGlows.push(s.add.image(A.x + p.x + 1, A.y + p.y + 1, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setDepth(DEPTH.lights + 1).setAlpha(0)));
    this.offs.push(
      bridge.on("camp:raft:grant", (e) => {
        // 증서를 먼저 (상태 반영이 실패해도 실시간 서버에는 간다)
        this.d.net().raft(e.grant);
        if (e.status) this.apply(e.status);
      }),
      bridge.on("camp:raft:status", (st) => this.apply(st)),
      bridge.on("forage:rod", ({ phase }) => {
        if (phase === this.rodPhase) return;
        if (phase === "nibble" || (phase === "bite" && this.rodPhase !== "nibble")) this.biteCount++;
        this.rodPhase = phase;
        this.rodPhaseAt = performance.now();
      }),
    );
    this.syncLamps();
    void this.refresh();
  }

  /** 웹에서 지금 상태를 다시 읽는다 (들어올 때·채널을 옮겼을 때) */
  async refresh(): Promise<void> {
    const ch = this.d.net().channel;
    if (ch === null || this.loading) return;
    this.loading = true;
    try {
      this.apply(await request<RaftStatusResponse>(`/api/camp/raft?ch=${ch}`, { cache: "no-store" }));
    } catch {
      // 좌대 입장권을 안 파는 서버(404)거나 잠깐 끊김 — 막지 않는다
    } finally {
      this.loading = false;
    }
  }

  private now(): number {
    return Date.now() + this.offset;
  }

  private apply(st: RaftStatusResponse): void {
    const ch = this.d.net().channel;
    if (ch !== null && st.ch !== ch) return;
    this.enabled = true;
    this.offset = st.now - Date.now();
    this.mine = st.mine && st.mine.ch === st.ch ? st.mine : null;
    this.dayLeftMin = st.dayLeftMin;
    this.syncZones();
    this.syncTicket();
  }

  /** 11/27 남은 시간 게이지 (components/camp/FoodGauge): 이 채널 내 입장권이 바뀔 때만 */
  private syncTicket(): void {
    const m = this.mine && this.now() < this.mine.until ? this.mine : null;
    const key = m ? `${m.n}:${m.until}:${this.offset}` : "";
    if (key === this.ticketKey) return;
    this.ticketKey = key;
    bridge.emit("camp:raft:ticket", m ? { n: m.n, until: m.until - this.offset } : null);
  }

  setBoard(b: RaftBoardEntry[]): void {
    this.board = b;
    this.enabled = true;
    this.syncLabels();
    this.syncLamps();
  }

  /** 내 좌대인지 (지금 시간 안) */
  canEnter(n: number): boolean {
    if (!this.enabled) return true;
    const m = this.mine;
    return !!m && m.n === n && this.now() < m.until;
  }

  /** 좌대 낚시 자리를 못 쓰는 까닭 (Foraging blocked) */
  spotBlocked(spotId: string): string | null {
    const n = campRaftOfSpot(spotId);
    return n !== null && !this.canEnter(n) ? `입장권이 있어야 ${n}번 좌대에서 낚시할 수 있어요.` : null;
  }

  /** 사다리로 오르려 할 때 (못 오르면 안내하고 false) */
  ladderOk(n: number): boolean {
    if (this.canEnter(n)) return true;
    const t = Date.now();
    if (t - this.warnedAt > 2500) {
      this.warnedAt = t;
      this.d.toast(raftOutText(n, "ticket"));
    }
    return false;
  }

  /** 서버가 좌대에서 내려보냈다 */
  onOut(n: number, x: number, y: number, why: RaftOutWhy): void {
    this.d.warp(x, y);
    // 밀린 위치 보고가 여럿이면 raftOut도 여럿 온다 — 안내는 한 번
    const t = Date.now();
    if (why !== "ticket" || t - this.warnedAt > 2500) {
      this.warnedAt = t;
      this.d.toast(raftOutText(n, why));
    }
    if (why === "end") {
      this.mine = null;
      bridge.emit("camp:raft:prompt", null);
      this.promptKey = "";
      this.syncZones();
      this.syncTicket();
      void this.refresh();
    }
  }

  /** 내 좌대가 아닌 마루를 막는다. 지금 서 있는 마루는 내려갈 때까지 두고(밀려나지 않게) 서버 판정을 기다린다 */
  private syncZones(): void {
    const pl = this.d.player();
    const on = campRaftAt(pl.x, pl.y);
    for (const r of CAMP_RAFTS) {
      const block = this.enabled && !this.canEnter(r.n) && on !== r.n;
      const z = this.zones.get(r.n);
      if (block && !z) {
        const d = campRaftDeck(r);
        const zone = this.d.scene.add.zone(d.x + d.w / 2, d.y + d.h / 2, d.w, d.h);
        zone.removeFromDisplayList();
        this.d.colliders.add(zone);
        this.zones.set(r.n, zone);
      } else if (!block && z) {
        this.d.colliders.remove(z, true, true);
        this.zones.delete(r.n);
      }
    }
  }

  private syncLabels(): void {
    const live = new Map(this.board.map((e) => [e.n, e]));
    for (const r of CAMP_RAFTS) {
      const e = live.get(r.n);
      let t = this.labels.get(r.n);
      if (!e) {
        t?.destroy();
        this.labels.delete(r.n);
        continue;
      }
      const text = `${r.n}번 · ${e.name}`;
      this.d.atlas.ensure(text);
      if (!t) {
        // 오두막 지붕 위 (앞 물에는 받침틀 낚싯대·찌가 있다 — 1~3은 잔교 아래 끝 가장자리에 걸린다). 11/28 오두막이 오른쪽 뒤 모서리라 그 위로
        t = this.d.scene.add.bitmapText(r.x + CAMP_RAFT_HUT_DX, r.y - CAMP_RAFT_ART_H - 1, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.labels - 2).setAlpha(0.9);
        this.labels.set(r.n, t);
      } else t.setText(text);
      t.setTint(this.mine?.n === r.n ? MINE_TINT : LABEL_TINT);
    }
  }

  /** 부스 덧그림·낚싯대 그림 텍스처 (처음 한 번 — 판 셋 × 낮밤) */
  private ensureTextures(): void {
    const tx = this.d.scene.textures;
    if (tx.exists(RIG_TEX(true))) return;
    for (const c of MAP_CONCEPTS) for (const lit of [false, true]) for (const f of [0, 1]) tx.addCanvas(CLERK_TEX(c, lit, f), raftClerkWindow(c, lit, f).toCanvas());
    for (const free of [false, true]) for (const lit of [false, true]) tx.addCanvas(LAMP_TEX(free, lit), lampArt(free, lit).toCanvas());
    for (const wide of [false, true]) tx.addCanvas(RIG_TEX(wide), raftRigBaseArt(raftRig(wide)).toCanvas());
    for (const dir of [-1, 1]) for (const odd of [false, true]) for (const lit of [false, true]) for (const bob of [false, true]) for (const bite of [false, true]) tx.addCanvas(TIP_TEX(dir, odd, lit, bob, bite), raftRodTipArt(dir, odd, lit, bob, bite).toCanvas());
    tx.addCanvas(HOLE_TEX, raftIceHoleArt().toCanvas());
  }

  /** 그 낚시 자리에 받침틀 낚싯대 넷이 보이는지 (보이면 Foraging이 그 자리 손 낚싯대·찌를 숨긴다) */
  rigOn(spotId: string): boolean {
    const n = campRaftOfSpot(spotId);
    return n !== null && this.rigs.has(n);
  }

  /** 현황판 등: 주인 표에 있는 좌대 = 빨강, 없으면 초록 */
  private syncLamps(): void {
    const used = new Set(this.board.map((e) => e.n));
    this.lamps.forEach((img, i) => img.setTexture(LAMP_TEX(!used.has(i + 1), this.lit)));
    this.lampGlows.forEach((img, i) => img.setTint(used.has(i + 1) ? 0xff6a5a : 0x6aff8a));
  }

  /** 주인이 자기 좌대 의자에 앉아 있으면 받침틀에 낚싯대 넷 (내 화면·남 화면 같은 점유표) */
  private syncRigs(): void {
    const seats = this.d.seats();
    const mySeat = this.d.player().seat?.id ?? null;
    const net = this.d.net();
    const me = net.online ? net.mySid : null;
    const want = new Map<number, boolean>();
    for (const e of this.board) {
      const id = campRaftSpots(e.n)[0];
      if (!id) continue;
      // 낚시 자리는 Foraging이 앉힌다 (player.seat이 아닐 수 있다) → 점유표의 내 sid로도 본다
      const who = seats.get(id);
      if (mySeat === id || (me !== null && who === me)) want.set(e.n, true);
      else if (who !== undefined) want.set(e.n, false);
    }
    for (const [n, g] of this.rigs) {
      if (want.get(n) === g.mine) continue;
      g.base.destroy();
      for (const o of [...g.tips, ...g.leds, ...g.holes]) o.destroy();
      this.rigs.delete(n);
    }
    const s = this.d.scene;
    for (const [n, mine] of want) {
      if (this.rigs.has(n)) continue;
      const r = CAMP_RAFTS.find((q) => q.n === n);
      if (!r) continue;
      const rig = raftRig(r.link);
      const sx = r.x + campRaftSeatDx(r);
      const fy = r.y - RAFT_HOLDER_UP;
      const depth = fy + 0.5;
      const base = s.add.image(sx - RIG_OX, fy - RIG_OY, RIG_TEX(r.link)).setOrigin(0, 0).setDepth(depth);
      const tips = rig.rods.map((rd, i) => s.add.image(sx + rd.tdx - TIP_OX, fy + rd.tdy - TIP_OY, TIP_TEX(rodDir(rd), i % 2 === 1, this.lit, false, false)).setOrigin(0, 0).setDepth(depth + 0.1));
      const leds = rig.rods.map((rd, i) => {
        const f = raftFloatAt(rd);
        return s.add
          .image(sx + f.x + 0.5, fy + f.y + 0.5, TEX.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(LED[i % 2])
          .setScale(0.28)
          .setDepth(DEPTH.lights + 1)
          .setAlpha(0);
      });
      // 11/27 겨울 판: 저수지 가장자리 얼음 위에 떨어진 찌는 얼음낚시 구멍에 (찌 넷을 좌대 앞 폭 전체에 펼치면 1·3·4·6번 바깥 찌가 얼음 띠에 닿는다)
      const snowy = isSnowy(this.concept);
      const holes = rig.rods.flatMap((rd) => {
        const f = raftFloatAt(rd);
        const x = sx + f.x;
        const y = fy + f.y + 1;
        if (!snowy || ![-1, 0, 1].some((dx) => pondIcy(x + dx, y) || pondIcy(x + dx, y - 1))) return [];
        return [s.add.image(x - HOLE_OX, y - HOLE_OY, HOLE_TEX).setOrigin(0, 0).setDepth(depth + 0.05)];
      });
      this.rigs.set(n, { n, base, tips, leds, holes, rig, sx, fy, mine });
    }
  }

  private dropRigs(): void {
    for (const g of this.rigs.values()) for (const o of [g.base, ...g.tips, ...g.leds, ...g.holes]) o.destroy();
    this.rigs.clear();
  }

  /** 내 손 낚시 입질: 몇 번째 대가 흔들리는지 (없으면 -1) */
  private ownBite(now: number): number {
    const t = now - this.rodPhaseAt;
    const i = this.biteCount % 4;
    const p = this.rodPhase;
    if (p === "bite" || p === "reel") return this.d.reduced || Math.floor(t / 90) % 2 === 0 ? i : -1;
    if (p === "nibble") return this.d.reduced || Math.sin(t / 55) > 0.6 ? i : -1;
    return -1;
  }

  /** 낚싯대 끝 (찌 까딱 · 방울 흔들림) · 밤 불빛 — 매 프레임 (바뀐 칸만 텍스처를 바꾼다) */
  private animate(now: number): void {
    const on = Math.max(0, Math.min(1, (this.d.dark() - 0.18) / 0.4));
    const reduced = this.d.reduced;
    for (const g of this.rigs.values()) {
      const own = g.mine ? this.ownBite(now) : -1;
      // 남의 좌대(내 손 낚시가 아닌 화면): 가끔 한 대씩 방울이 흔들린다 (입질 신호가 없어 생기만)
      const it = now + g.n * 3100;
      const idle = !g.mine && !reduced && it % IDLE_BITE_EVERY < IDLE_BITE_MS && Math.floor(it / 110) % 2 === 0 ? (Math.floor(it / IDLE_BITE_EVERY) * 7 + g.n) % 4 : -1;
      g.rig.rods.forEach((rd, i) => {
        const bite = i === own || i === idle;
        const bob = !reduced && Math.floor((now + i * 530 + g.n * 170) / 900) % 2 === 1;
        const key = TIP_TEX(rodDir(rd), i % 2 === 1, this.lit, bob, bite);
        const tip = g.tips[i];
        if (tip.texture.key !== key) tip.setTexture(key);
        const f = raftFloatAt(rd);
        g.leds[i].setAlpha(this.lit ? on * 0.85 : 0).setY(g.fy + f.y + 0.5 + (bob || bite ? 1 : 0));
      });
    }
    // 매표소: 직원 두 프레임 · 밤 창·등 빛
    if (!reduced && now >= this.clerkAt) {
      this.clerkAt = now + 650;
      this.clerkFrame ^= 1;
    }
    const ck = CLERK_TEX(this.concept, this.lit, reduced ? 0 : this.clerkFrame);
    if (this.clerk.texture.key !== ck) this.clerk.setTexture(ck);
    const ga = this.lit ? on : 0;
    this.winGlow.setAlpha(ga * 0.7);
    for (const l of this.lampGlows) l.setAlpha(ga * 0.8);
  }

  /** 밤: 전자찌 둘레를 조금 밝힌다 (어둠 구멍 — 부스 창 빛은 Foraging이 낸다) */
  addLights(lit: Lighting): void {
    for (const g of this.rigs.values())
      g.rig.rods.forEach((rd) => {
        const f = raftFloatAt(rd);
        lit.add(g.sx + f.x, g.fy + f.y, 7, 0.4);
      });
    if (this.lit) lit.add(RAFT_BOOTH_ART.x + 32, RAFT_BOOTH_ART.y + 31, 12, 0.45);
  }

  update(now: number, labelScale: number): void {
    for (const t of this.labels.values()) t.setScale(labelScale);
    this.animate(now);
    if (now < this.checkAt) return;
    this.checkAt = now + 250;
    // 판(겨울·크리스마스)·밤낮이 바뀌면 직원·등 그림을 바꾼다 (부스 그림과 같은 때)
    const concept = currentMapConcept();
    const lit = this.d.boothLit();
    if (concept !== this.concept || lit !== this.lit) {
      // 판이 바뀌면 낚싯대도 새로 (겨울 얼음낚시 구멍)
      if (isSnowy(concept) !== isSnowy(this.concept)) this.dropRigs();
      this.concept = concept;
      this.lit = lit;
      this.syncLamps();
    }
    this.syncRigs();
    // 끝났다 (서버가 곧 내려보낸다) · 마루에서 내려왔으면 막이를 다시
    if (this.mine && this.now() >= this.mine.until) this.mine = null;
    this.syncZones();
    this.syncPrompt();
    this.syncTicket();
  }

  private onMyRaft(): boolean {
    const m = this.mine;
    if (!m) return false;
    const pl = this.d.player();
    const seat = pl.seat?.id ?? null;
    return campRaftAt(pl.x, pl.y) === m.n || (seat !== null && campRaftOfSpot(seat) === m.n);
  }

  /** 끝나기 1분 전 · 내 좌대 위 · 연장 남음 · 오늘 좌대 시간 남음 → 연장 칸 */
  private syncPrompt(): void {
    const m = this.mine;
    const left = m ? m.until - this.now() : Infinity;
    const inWindow = !!m && left > 0 && left <= RAFT_RENEW_WINDOW_MS && this.onMyRaft();
    const min = raftGrantMin(this.dayLeftMin);
    const can = inWindow && m!.renewLeft > 0 && min > 0;
    if (inWindow && !can && this.endWarned !== m!.until) {
      this.endWarned = m!.until;
      this.d.toast(m!.renewLeft > 0 ? "오늘 좌대 시간을 다 써서 1분 뒤 좌대에서 내려와요." : "연장을 다 써서 1분 뒤 좌대에서 내려와요.");
    }
    const p: RaftPrompt | null = can ? { n: m!.n, at: m!.until - this.offset, min, price: raftPriceFor(min), dayLeftMin: this.dayLeftMin, renewLeft: m!.renewLeft } : null;
    const key = p ? `${p.n}:${p.at}:${p.min}:${p.renewLeft}` : "";
    if (key === this.promptKey) return;
    this.promptKey = key;
    bridge.emit("camp:raft:prompt", p);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    bridge.emit("camp:raft:prompt", null);
    bridge.emit("camp:raft:ticket", null);
    for (const z of this.zones.values()) {
      try {
        this.d.colliders.remove(z, true, true);
      } catch {
        z.destroy();
      }
    }
    this.zones.clear();
    for (const t of this.labels.values()) t.destroy();
    this.labels.clear();
    this.dropRigs();
    for (const o of [this.clerk, this.winGlow, ...this.lamps, ...this.lampGlows]) o.destroy();
  }
}
