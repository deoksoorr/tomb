import * as Phaser from "phaser";
import { SEA_LOTS, seaLotFront, seaLotSign, type SeaLot } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { gameDay } from "@/lib/gameDay";
import { housingApi } from "@/lib/housing/client";
import type { VillageHouse } from "@/lib/housing/types";
import { TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { InputHub } from "../input/InputHub";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Atmosphere } from "../world/Atmosphere";
import { clampChars, DOOR_NAME_MAX } from "../text/fitLabel";
import { PLATE_LOT_FREE, PLATE_LOT_HOUSE, SignPlate } from "../world/SignPlate";
import { houseLotLabels, scaleLotLabel } from "../housing/worldLots";
import { isOlderHomes, onHomesChanged, staleHomesV } from "../housing/homesRefresh";
import { COTTAGE_RISE, cottageBox, cottageCanvas } from "./seaCottageArt";
import { seaHousingHost } from "./seaHousingHost";
import { lampApi, lampHourOf, SeaLamp } from "./seaLamp";
import { lowPlateSpot, ROOF_PLATE_MIN_Y } from "./seaLotPlate";
import { SEA_LIGHTHOUSE_LAMP } from "./seaLayout";
import type { SeaMap } from "./SeaMap";
import { SEA_TEX_PREFIX, type SeaInteractable } from "./seaTypes";
import { markVisitVia } from "@/lib/housing/visitVia";

// 11/16 달물결 포구 오두막(Task A)과 등대 등불(Task B)을 바닷가 장면에 붙여요. SeaScene은 만들기·매 프레임·E·act 소식만 넘겨요.
//  - 오두막: 지금 채널의 포구 11터 (/api/housing/village?zone=sea — CDN 15초). 터에 오두막 그림·막는 상자·팻말(빈 터 「분양 중」)
//    11/20 오두막 문패는 마을 집 문패와 같게: 지붕 위 세 줄 (N번 터 · 이름 (내 집) / 주인 · 점수 / 「호칭」 — game/housing/worldLots houseLotLabels)
//  - E: 빈 터·포구 부동산 → 포구 부동산 창, 오두막 터 → 그 오두막 안으로 (UI 하우징 창이 집 씬을 열어요 — game/housing/install이 바닷가 장면을 빌려요)
//  - 등대: 등불 상태(seaLamp) · 밤에 등대에 오르면 그날 처음인지 서버에 물어 켜요

/** 오두막 목록을 다시 받는 간격 (다른 사람 분양·철거) */
const REFRESH_MS = 5 * 60_000;
/** 켜지지 않은 등대를 밤에 다시 물어보는 간격 (act 소식을 놓쳤을 때) */
const LAMP_POLL_MS = 3 * 60_000;
/** 집에서 나오면 문 밑변에서 이만큼 아래에 선다 (마을 집 문 앞과 같은 느낌) */
const DOOR_STAND = 10;
/** 11/26 오두막을 받기 전에 문 앞으로 가라고 했으면 이 안에 받았을 때만 문 바로 앞으로 다시 맞춘다 (ms) */
const STAND_LATER_MS = 4000;
/** 밤 그림으로 바꾸는 어둠 */
const NIGHT_AT = 0.5;


export type SeaHousingDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  hub: InputHub;
  reduced: boolean;
  map: SeaMap;
  atmos: () => Atmosphere | undefined;
  /** 지금 채널 (연결 전이면 null) */
  channel: () => number | null;
  /** 지금 한국 시각 (?time= 덮어쓰기 반영) */
  hour: () => number;
  /** 시험용 시각 덮어쓰기가 있는지 (개발 서버에서 등불을 낮에도 켜 볼 수 있게) */
  hourForced: boolean;
  /** 그 자리로 옮기고 카메라를 맞춘다 (서버에도 알린다) */
  warp: (x: number, y: number) => void;
  /** 바닷가 장면이 보이고 입력을 받는 중 */
  active: () => boolean;
  look: () => readonly string[];
  body: () => string;
  toast: (m: string) => void;
  /** 같은 바닷가 사람에게 한 번 하는 동작 */
  act: (kind: "lamp") => void;
};

type Built = {
  key: string;
  img: Phaser.GameObjects.Image;
  /** 밤 창문 불빛 */
  glows: Phaser.GameObjects.Image[];
  /** 문 밑변 가운데 (월드) */
  door: { x: number; y: number };
  body: Phaser.GameObjects.Zone;
  house: VillageHouse;
  /** 그림 맨 위 (월드 y — 굴뚝·망루 포함). 문패가 그 위에 서요 */
  top: number;
};

/** 터 팻말: 빈 터·숨긴 오두막이면 땅에 꽂은 팻말(sign), 오두막이면 지붕 위 문패 세 줄(labels). key가 같으면 다시 만들지 않아요 */
type LotPlate = {
  key: string;
  sign: SignPlate | null;
  labels: Phaser.GameObjects.BitmapText[];
  /** 11/26 제 터 앞마당(문 바로 아래)에 세운 땅 문패 (9번 터) — 그 문 앞 「E 들어가기」 안내와 겹쳐서 안내가 뜨는 동안 흐려요. base = 줄마다 원래 알파 */
  yard?: { base: number[]; fade: number };
};

export class SeaHousing {
  private houses = new Map<number, VillageHouse>();
  /** 맵 고정 상호작용 중 터를 뺀 것 (터는 syncInteractables가 분양 상태로 채운다) */
  private baseInteractables: readonly SeaInteractable[] | null = null;
  /** 숨긴(관리자) 오두막이 있는 터 */
  private taken = new Set<number>();
  private readonly host: typeof seaHousingHost.current;
  private built = new Map<number, Built>();
  private plates = new Map<number, LotPlate>();
  /** 내 오두막 id (문패 「(내 집)」 — 로그인 전·없으면 null) */
  private myId: string | null = null;
  private ch: number | null = null;
  /** 11/26 오두막을 받기 전에 문 앞으로 가라고 했다 (다른 맵 집에서 나와 막 도착) → 받아 그리면 문 바로 앞으로 한 번 더. at = 부른 시각 */
  private standLater: { lot: number; at: number } | null = null;
  /** 11/26 「E 들어가기」 안내가 떠 있는 오두막 터 (focusDoor) */
  private doorFocus: number | null = null;
  private fetchedAt = 0;
  private loading = false;
  /** 11/26 받는 중에 온 집 바뀜 알림 v (끝나면 한 번 더 받는다) */
  private pendingV = 0;
  /** 11/26 지금 그린 목록을 서버가 만든 시각 (generatedAt — 늦게 온 옛 응답을 거른다) */
  private shownAt = 0;
  private night = false;
  private readonly lamp: SeaLamp;
  private lampCh: number | null = null;
  private lampAt = 0;
  private lampBusy = false;
  private lampLight: boolean | null = null;
  private plateScale = 1;
  private readonly offs: (() => void)[] = [];
  private destroyed = false;

  constructor(private readonly d: SeaHousingDeps) {
    this.lamp = new SeaLamp(d.scene, d.atlas, d.reduced);
    // 맵의 「분양 준비 중」 팻말 대신 분양 상태 팻말을 세워요
    for (const p of d.map.lotPlates.values()) p.setVisible(false);
    for (const l of SEA_LOTS) this.setPlate(l, null);
    this.syncInteractables();
    this.host = seaHousingHost.current = {
      atlas: d.atlas,
      hub: d.hub,
      reduced: d.reduced,
      active: () => !this.destroyed && d.active(),
      look: d.look,
      body: d.body,
      standAtLot: (lot) => this.standAtLot(lot),
    };
    this.offs.push(
      bridge.on("sea:cottages", ({ myHouseId }) => {
        this.myId = myHouseId;
        void this.refresh(true);
      }),
      bridge.on("sea:lot", ({ lot }) => this.standAtLot(lot)),
      // 11/26 같은 채널 누가 오두막 분양·겉모습 바꾸기 → 몇 초 안에 다시 받는다 (5분 주기를 기다리지 않게)
      onHomesChanged("sea", (v) => void this.refresh({ v }), undefined, (v) => this.covers(v)),
    );
    // 내 오두막 문패에 「(내 집)」 (마을 WorldHouses처럼 처음 한 번 묻는다. 분양·바꾸기 뒤에는 sea:cottages가 알려 줘요)
    housingApi
      .mine("sea")
      .then((r) => {
        if (this.destroyed || (r.house?.id ?? null) === this.myId) return;
        this.myId = r.house?.id ?? null;
        for (const l of SEA_LOTS) this.draw(l);
      })
      .catch(() => undefined);
  }

  // ── 오두막 ──

  /** 11/26 지금 그린 목록이 이 채널에서 v 뒤에 만든 것이다 (입장 때 다시 온 마지막 v는 다시 받지 않는다) */
  private covers(v: number): boolean {
    return this.ch !== null && this.ch === this.d.channel() && this.shownAt >= v;
  }

  private async refresh(fresh: boolean | { v: number } = false): Promise<void> {
    const ch = this.d.channel();
    if (ch === null || this.destroyed) return;
    if (this.loading) {
      // 받는 중에 집 바뀜 알림이 오면 끝난 뒤 한 번 더
      if (typeof fresh === "object") this.pendingV = fresh.v;
      return;
    }
    this.loading = true;
    this.fetchedAt = performance.now();
    try {
      const v = await housingApi.village(ch, fresh, "sea");
      if (this.destroyed || this.d.channel() !== ch) return;
      // 11/26 지금 그린 것보다 먼저 만든 목록(늦게 온 CDN 옛 응답)은 버린다 — 알림으로 받은 분양이 5분 주기 조회에 다시 사라지지 않게
      if (this.ch === ch && isOlderHomes(this.shownAt, v.generatedAt)) return;
      // 11/26 CDN 주소로 받은 목록이 이 채널에서 이미 들은 집 바뀜보다 먼저 만든 것이면 그 v로 한 번 더 (운영: 분양이 새로고침해야 보였다)
      const stale = typeof fresh === "object" ? null : staleHomesV("sea", v.generatedAt);
      if (stale !== null) this.pendingV = Math.max(this.pendingV, stale);
      this.ch = ch;
      this.shownAt = v.generatedAt;
      this.houses = new Map(v.houses.map((h) => [h.lot, h]));
      this.taken = new Set(v.taken);
      for (const l of SEA_LOTS) this.draw(l);
      this.syncInteractables();
      const later = this.standLater;
      this.standLater = null;
      if (later && performance.now() - later.at < STAND_LATER_MS && this.built.has(later.lot)) this.standAtLot(later.lot);
    } catch {
      // 다음 주기에 다시
    } finally {
      this.loading = false;
      const pv = this.pendingV;
      this.pendingV = 0;
      if (pv && !this.destroyed) void this.refresh({ v: pv });
    }
  }

  private draw(l: SeaLot): void {
    const hiddenTaken = this.taken.has(l.n);
    const h = this.houses.get(l.n) ?? null;
    const cur = this.built.get(l.n);
    const key = h ? `${SEA_TEX_PREFIX}cottage-${h.style ?? "wood"}-${h.tier}-${l.n}-${this.night ? "n" : "d"}` : "";
    if (cur && h && cur.key === key) {
      // 그림은 그대로 · 이름·주인·점수(문패)와 들어가기 이름만 새로
      cur.house = h;
      this.setPlate(l, h, hiddenTaken, cur.top);
      return;
    }
    if (cur) {
      cur.img.destroy();
      for (const g of cur.glows) g.destroy();
      this.d.map.colliders.remove(cur.body, true, true);
      this.built.delete(l.n);
    }
    if (!h) {
      this.setPlate(l, null, hiddenTaken);
      return;
    }
    const s = this.d.scene;
    const art = cottageCanvas({ style: h.style ?? "wood", tier: h.tier, deck: l.deck, night: this.night, lot: { w: l.w, h: l.h, gate: l.gate } });
    if (!s.textures.exists(key)) s.textures.addCanvas(key, art.canvas);
    // 밤: 창문마다 따뜻한 불빛
    const glows = art.lights.map((p) =>
      s.add
        .image(l.x + p.x, l.y - COTTAGE_RISE + p.y, TEX.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd27a)
        .setScale(0.32)
        .setAlpha(0.75)
        .setDepth(DEPTH.lights),
    );
    const box = cottageBox(h.tier, l);
    const baseY = l.y + box.base;
    const img = s.add.image(l.x, l.y - COTTAGE_RISE, key).setOrigin(0, 0).setDepth(baseY);
    // 집 몸통 전체를 막는다 (터 안쪽 윗변 ~ 앞벽 밑동 — 마을 집처럼 문 앞까지만 걸어가요)
    const top = l.y + 4;
    const bh = Math.max(8, baseY - top);
    const body = s.add.zone(l.x + box.x + box.w / 2, top + bh / 2, box.w, bh);
    body.removeFromDisplayList();
    this.d.map.colliders.add(body);
    // 문 앞 (마을 집 문과 같은 자리 규칙: 문 밑변에서 4px 아래, 반지름 16)
    const door = { x: l.x + art.door.x, y: l.y - COTTAGE_RISE + art.door.y };
    const inkTop = l.y - COTTAGE_RISE + art.top;
    this.built.set(l.n, { key, img, glows, body, house: h, door, top: inkTop });
    this.setPlate(l, h, hiddenTaken, inkTop);
  }

  /**
   * 터 팻말: 빈 터 「N번 터 분양 중」(출입구 옆 땅 팻말). 오두막이면 마을 집 문패와 같은 지붕 위 세 줄
   * (N번 터 · 이름 (내 집) / 주인 · 점수 / 「호칭」 — 모양·줄 간격·줌 대응·글자 줄이기 모두 houseLotLabels). top = 오두막 그림 맨 위 (월드 y)
   */
  private setPlate(l: SeaLot, h: VillageHouse | null, hiddenTaken = false, top = l.y): void {
    const mine = !!h && h.id === this.myId;
    const key = h ? `h|${top}|${h.name}|${h.ownerName}|${h.score}|${mine ? 1 : 0}` : hiddenTaken ? `${l.n}번 오두막` : `${l.n}번 터 분양 중`;
    const old = this.plates.get(l.n);
    if (old?.key === key) return;
    if (old) destroyPlate(old);
    const s = this.plateScale;
    if (h) {
      // 지붕 위 (마을 문패와 같은 자리). 맵 위 끝에 붙어 폰 HUD에 가리는 맨 윗줄 오두막만 집 아래 땅에
      const at = top - 2 < ROOF_PLATE_MIN_Y ? lowPlateSpot(l, h.tier) : { cx: l.x + l.w / 2, bottom: top - 2, w: l.w };
      const labels = houseLotLabels(this.d.scene, this.d.atlas, at, h, `${l.n}번 터 · `, mine, DEPTH.labels - 1);
      for (const t of labels) scaleLotLabel(t, s);
      const yard = "inLot" in at && at.inLot ? { base: labels.map((t) => t.alpha), fade: 1 } : undefined;
      this.plates.set(l.n, { key, sign: null, labels, ...(yard ? { yard } : {}) });
      return;
    }
    const sg = seaLotSign(l);
    // 11/16 r16 마을 빈 집터 이름표와 같은 글씨만 (판 없이)
    const p = new SignPlate(this.d.scene, this.d.atlas, sg.x, sg.y, key, hiddenTaken ? PLATE_LOT_HOUSE : PLATE_LOT_FREE);
    p.setScale(s);
    this.plates.set(l.n, { key, sign: p, labels: [] });
  }

  /** 11/26 내 캐릭터에게 「E 들어가기」 안내가 떠 있는 오두막 터 (없으면 null) — 앞마당 땅 문패를 그동안 흐린다 (SeaScene이 매 프레임) */
  focusDoor(lot: number | null): void {
    this.doorFocus = lot;
  }

  /** 그 오두막 문 앞으로 (집에서 나올 때·내 집 가기 — 마을 집처럼 문 바로 앞). 오두막이 아직 안 그려졌으면 터 출입구 앞 */
  standAtLot(lot: number): void {
    const l = SEA_LOTS.find((x) => x.n === lot);
    if (!l || this.destroyed) return;
    const b = this.built.get(lot);
    const f = b ? { x: b.door.x, y: b.door.y + DOOR_STAND } : seaLotFront(l, 14);
    this.d.warp(f.x, f.y);
    // 아직 오두막 목록을 못 받았다: 받아 그린 뒤 문 바로 앞으로 (그새 걸어갔을 만큼 오래면 그대로)
    if (!b && this.ch === null) this.standLater = { lot, at: performance.now() };
  }

  /**
   * 터 상호작용을 지금 분양 상태로: 오두막이 있으면 그 문 앞(마을 집 문과 같은 자리·반지름·「○○ 들어가기」),
   * 빈 터면 출입구 앞 「N번 터 분양 문의」. 맵의 고정 목록(seaLayout)에서 터 항목만 바꿔 끼운다
   */
  private syncInteractables(): void {
    const map = this.d.map as unknown as { interactables: readonly SeaInteractable[] };
    this.baseInteractables ??= map.interactables.filter((o) => o.kind !== "lot");
    const lots = SEA_LOTS.map((l): SeaInteractable => {
      const b = this.built.get(l.n);
      if (b) return { id: `lot:${l.n}`, kind: "lot", lot: l.n, x: b.door.x, y: b.door.y + 4, r: 16, label: `${clampChars(b.house.name, DOOR_NAME_MAX)} 들어가기` };
      const f = seaLotFront(l);
      return { id: `lot:${l.n}`, kind: "lot", lot: l.n, x: f.x, y: f.y, r: 16, label: this.taken.has(l.n) ? `${l.n}번 오두막` : `${l.n}번 터 분양 문의` };
    });
    map.interactables = [...this.baseInteractables, ...lots];
  }

  /** E: 처리했으면 true (터·부동산). 등대는 등불을 먼저 보고 false (오르기는 장면이 해요) */
  use(o: SeaInteractable): boolean {
    if (o.kind === "realty") {
      bridge.emit("portal:open", { kind: "housing", zone: "sea" });
      return true;
    }
    if (o.kind === "lot" && o.lot) {
      const h = this.houses.get(o.lot);
      if (h) {
        markVisitVia(h.id, "door");
        bridge.emit("portal:open", { kind: "housing", houseId: h.id });
      } else if (this.ch !== null) bridge.emit("portal:open", { kind: "housing", zone: "sea", lot: o.lot });
      else this.d.toast("오두막 터를 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.");
      return true;
    }
    if (o.kind === "lighthouse") void this.tryLight();
    return false;
  }

  // ── 등대 등불 ──

  private async loadLamp(fresh = false): Promise<void> {
    const ch = this.d.channel();
    if (ch === null || this.destroyed) return;
    this.lampAt = performance.now();
    try {
      const r = await lampApi.get(ch, fresh);
      if (this.destroyed || this.d.channel() !== ch) return;
      this.lampCh = ch;
      this.lamp.set(r);
    } catch {
      // 다음 주기에 다시
    }
  }

  /** 누가 등불을 켰다 (act "lamp") → 새로 받아요 */
  onLampAct(): void {
    void this.loadLamp(true);
  }

  private async tryLight(): Promise<void> {
    const ch = this.d.channel();
    if (ch === null || this.lampBusy) return;
    if (this.lamp.lit) {
      this.d.toast(`오늘 등대는 ${this.lamp.name}님이 밝혔어요.`);
      return;
    }
    const force = this.d.hourForced;
    if (!lampHourOf(this.d.hour())) return; // 낮에는 그냥 올라가요
    this.lampBusy = true;
    try {
      const r = await lampApi.light(ch, force);
      if (this.destroyed) return;
      this.lamp.set(r);
      if (r.lit) {
        this.d.act("lamp");
        this.d.toast(`등대에 불을 밝혔어요. 오늘의 등대지기예요! 도장 +1${r.stamps !== undefined ? ` (${r.stamps}개)` : ""}`);
      } else this.d.toast(`한발 늦었어요. 오늘 등대는 ${r.name}님이 밝혔어요.`);
    } catch (e) {
      this.d.toast(errorMessage(e));
    } finally {
      this.lampBusy = false;
    }
  }

  /** 등대 등실 밤 빛(Atmosphere 고정 빛)을 켜고 꺼요 */
  private applyLampLight(on: boolean): void {
    if (this.lampLight === on) return;
    const atmos = this.d.atmos();
    if (!atmos) return;
    this.lampLight = on;
    const L = SEA_LIGHTHOUSE_LAMP;
    // 켜졌을 때도 등실 둘레 밝힘은 은은하게 (반지름·세기를 줄인다)
    const isLamp = (l: { x: number; y: number }) => l.x === L.x && l.y === L.y;
    atmos.setStaticLights(
      this.d.map.staticLights.filter((l) => on || !isLamp(l)).map((l) => (isLamp(l) ? { ...l, scale: l.scale * 0.7, base: l.base * 0.6 } : { ...l })),
    );
  }

  // ── 매 프레임 ──

  /** darkness 0..1, fog 0..1, s = 이름표 크기 (1/zoom) */
  update(time: number, darkness: number, fog: number, s: number): void {
    if (this.destroyed) return;
    const now = performance.now();
    const ch = this.d.channel();
    // 채널이 바뀌면(또는 처음) 오두막·등대를 새로 받아요
    if (ch !== null && (ch !== this.ch || now - this.fetchedAt > REFRESH_MS) && !this.loading && now - this.fetchedAt > 3000) void this.refresh();
    if (ch !== null && ch !== this.lampCh && now - this.lampAt > 3000) void this.loadLamp();
    else if (ch !== null && (!this.lamp.lit && lampHourOf(this.d.hour()) && now - this.lampAt > LAMP_POLL_MS)) void this.loadLamp();
    // 게임 날이 바뀌면(새벽 5시) 꺼져요
    else if (this.lamp.lit && this.lamp.today && this.lamp.today !== gameDay() && now - this.lampAt > 3000) void this.loadLamp(true);
    const night = darkness > NIGHT_AT;
    if (night !== this.night) {
      this.night = night;
      for (const l of SEA_LOTS) this.draw(l);
      this.syncInteractables();
    }
    if (Math.abs(s - this.plateScale) > 1e-4) {
      this.plateScale = s;
      for (const p of this.plates.values()) {
        p.sign?.setScale(s);
        for (const t of p.labels) scaleLotLabel(t, s);
      }
    }
    // 11/26 앞마당 땅 문패: 내 캐릭터 「E 들어가기」 안내가 그 문 앞에 뜨는 동안 흐려요 (안내 글씨와 겹치지 않게)
    for (const [n, p] of this.plates) {
      if (!p.yard) continue;
      const want = this.doorFocus === n ? 0 : 1;
      if (p.yard.fade === want) continue;
      const f = (p.yard.fade = Math.abs(want - p.yard.fade) < 0.05 ? want : p.yard.fade + (want - p.yard.fade) * 0.3);
      p.labels.forEach((t, i) => t.setAlpha(p.yard!.base[i] * f));
    }
    this.d.map.lampLit = this.lamp.lit;
    const on = Math.max(0, Math.min(1, (darkness - 0.18) / 0.4));
    this.applyLampLight(this.lamp.lit || fog > 0.3);
    this.lamp.update(time, on, s);
  }

  /** 11/16 r19 등대 불빛이 밤 어둠을 밝혀요 (SeaScene 빛 모으기) */
  addLights(lit: { add(x: number, y: number, r: number, a: number): void }): void {
    if (!this.destroyed) this.lamp.addLights(lit);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const o of this.offs.splice(0)) o();
    for (const b of this.built.values()) {
      b.img.destroy();
      for (const g of b.glows) g.destroy();
    }
    this.built.clear();
    for (const p of this.plates.values()) destroyPlate(p);
    this.plates.clear();
    this.lamp.destroy();
    if (seaHousingHost.current === this.host) seaHousingHost.current = null;
  }
}

function destroyPlate(p: LotPlate): void {
  p.sign?.destroy();
  for (const t of p.labels) t.destroy();
}
