import type * as Phaser from "phaser";
import { DIR, isAvatarBody, isEmoId, maskChat, normalizeChat, sanitizeDye, STATE, type ActKind, type DirId, type PeerInfo, type Sid, type StateId } from "@tomb/protocol";
import { avatarColorSpec } from "../sprites/avatar";
import { bridge } from "../bridge";
import type { AvatarView } from "../entities/AvatarView";
import { RemoteAvatar } from "../entities/RemoteAvatar";
import { phraseOf } from "../entities/SpeechBubble";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { EMO_COOLDOWN_MS, EMO_SHOW_MS, emoIcon } from "../logic/emoBoard";
import { declutter, type LabelBox } from "../world/labels";
import { MeScreen } from "../world/MeScreen";
import { RoomClient, type RoomClientOptions, type RoomStatus } from "./RoomClient";
import type { NetPose } from "./sendThrottle";

// 방(마을·집·사냥터)에 같이 있는 사람들을 씬에 그려 주는 재사용 모듈.
// RoomClient(연결) + RemoteAvatar(보간·몸·꾸미기·점프 포물선·몸짓·말풍선)를 묶는다. 좌석은 없다.
//
//   // create()
//   this.presence = new RoomPresence(this, { atlas, room: "village", getPose: () => this.myPose(), me: this.me.view });
//   // update(time, delta)
//   this.presence.update(performance.now(), this.cameras.main.worldView, 1 / this.cameras.main.zoom);
//   // 말풍선·몸짓: this.presence.say("hi") / this.presence.act("wave")
//   // shutdown: this.presence.destroy()

export type RoomPose = { x: number; y: number; state: StateId; dir: DirId };

export type RoomPresenceOptions = {
  /** 이름표 글자 (씬이 하나 가지고 있는 GlyphAtlas — 같은 텍스처를 쓰므로 새로 만들지 말고 넘겨받은 것을 쓴다) */
  atlas: GlyphAtlas;
  /** ROOM_ID_RE 형식: "village" | "house:{id}" | "hunt:{zone}:{difficulty}" */
  room: string;
  /** 내 발밑 위치·상태·방향 (매 프레임 읽는다) */
  getPose: () => RoomPose;
  /** 내 아바타: say()로 내 말풍선을 바로 띄우고 act() 몸짓을 한다 (없으면 보내기만) */
  me?: AvatarView;
  /** 원격 아바타 depth를 y 정렬 대신 고정하고 싶을 때 (예: 위에서 본 실내가 아니라 옆에서 본 사냥터) */
  depth?: number;
  /** 상태 변화 (HUD 인원 표시 등) */
  onStatus?: (s: RoomStatus) => void;
  /** 다른 사람의 몸짓 (씬이 소리·효과를 더하고 싶을 때). 아바타 몸짓은 이미 재생된다 */
  onAct?: (sid: Sid, kind: ActKind, x: number, y: number) => void;
  /** 다른 사람의 말풍선 (소리 등). 말풍선은 이미 뜬다 */
  onSay?: (sid: Sid, text: string) => void;
  /** 3번 집 안 1인 자리: 내 점유 요청이 거절됐다 / 점유표가 바뀌었다 */
  onSeatDenied?: (seatId: string) => void;
  onSeats?: () => void;
  /** 3번 다른 사람이 가구를 썼다 */
  onUse?: (sid: Sid, u: string, a: number) => void;
  /**
   * 표현 창(T)·즐겨찾기 원형 목록(Y)의 말풍선·이모티콘을 이 방에서 받는다 (bridge input:say·input:emo)
   * + 원형 목록이 열려 있으면 내 화면 위치를 UI에 알린다. 마을·집처럼 월드 HUD 대신 쓰는 방에서 켠다 (몸짓은 씬의 키 처리가 받는다)
   */
  expressions?: boolean;
  /** 테스트·디버그 */
  client?: RoomClientOptions;
};

/** 내 말풍선 연타 간격 (서버 SAY_INTERVAL_MS보다 짧으면 서버가 버린다 — 월드와 같은 1초로 내 화면만 묶는다) */
const SAY_COOLDOWN_MS = 1000;

/** 인원 불일치 확인 주기 (어긋나면 sync 1회, 서버는 깨우지 않는다) */
const PEER_CHECK_MS = 5000;

export class RoomPresence {
  readonly client: RoomClient;
  readonly remotes = new Map<Sid, RemoteAvatar>();
  private readonly boxes: (LabelBox & { t: Phaser.GameObjects.BitmapText | null })[] = [];
  private readonly order: LabelBox[] = [];
  private peerCheckAt = 0;
  private destroyed = false;
  private offLook: (() => void) | null = null;
  private readonly offs: (() => void)[] = [];
  private meScreen: MeScreen | null = null;
  private sayAt = -Infinity;
  private emoAt = -Infinity;
  /** 3번 집 안 1인 자리 점유표 (seatId → sid, 나 포함) */
  readonly seats = new Map<string, Sid>();
  /** 서버가 집 안 자리를 판정한다 (welcome spots). false면 이전 서버 → 혼자 앉는다 */
  spots = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly o: RoomPresenceOptions,
  ) {
    const pose = (out: NetPose): NetPose => {
      const p = o.getPose();
      out.x = p.x;
      out.y = p.y;
      out.state = p.state;
      out.dir = p.dir;
      return out;
    };
    this.client = new RoomClient(
      {
        getPose: pose,
        onWelcome: (m) => {
          this.clear();
          this.spots = m.spots;
          for (const p of m.peers) this.add(p);
          this.setSeats(m.seats);
        },
        onSeat: (seatId, sid) => {
          const prev = this.seats.get(seatId);
          if (sid === null) this.seats.delete(seatId);
          else this.seats.set(seatId, sid);
          if (prev !== undefined && prev !== sid) {
            const r = this.remotes.get(prev);
            if (r?.seatId === seatId) r.seatId = null;
          }
          if (sid !== null) {
            const r = this.remotes.get(sid);
            if (r) r.seatId = seatId;
          }
          o.onSeats?.();
        },
        onSeatDenied: (seatId) => o.onSeatDenied?.(seatId),
        onUse: (sid, u, a) => o.onUse?.(sid, u, a),
        onJoin: (p) => this.add(p),
        onLeave: (sid) => {
          this.remotes.get(sid)?.destroy();
          this.remotes.delete(sid);
        },
        onSnapshot: (entries, t) => {
          const me = this.client.mySid;
          for (const e of entries) if (e.sid !== me) this.remotes.get(e.sid)?.push(t, e.x, e.y, e.state, e.dir);
        },
        onLook: (sid, look, extra) => {
          const v = this.remotes.get(sid)?.view;
          v?.setLook(look);
          v?.applyAppearance(extra);
        },
        onAct: (sid, kind, x, y) => {
          const r = this.remotes.get(sid);
          if (r?.visible) r.view.playAct(kind, performance.now());
          o.onAct?.(sid, kind, x, y);
        },
        onSay: (sid, id) => {
          const text = phraseOf(id);
          if (!text) return;
          this.remotes.get(sid)?.view.say(text, performance.now());
          o.onSay?.(sid, text);
        },
        onEmo: (sid, id) => {
          const r = this.remotes.get(sid);
          if (!r || !isEmoId(id)) return;
          r.view.emote(emoIcon(id), performance.now(), EMO_SHOW_MS);
        },
        onChat: (sid, text, key) => {
          const r = this.remotes.get(sid);
          if (!r) return;
          r.view.chat(text, performance.now());
          bridge.emit("chat:line", { name: r.name, text, mine: false, ...(key ? { key } : {}), ...(r.view.staff ? { staff: true as const } : {}) });
        },
        // 이 방의 최근 1분 채팅 → 채팅창에 합친다
        onChatLog: (lines) => bridge.emit("chat:log", { lines }),
        onPeers: (peers, seats) => {
          // 목록에 내 항목도 오므로(월드가 내 벤치 상태를 맞추는 데 씀) 방에서는 나를 뺀다
          this.reconcile(peers.filter((p) => p.sid !== this.client.mySid));
          this.setSeats(seats);
        },
        onReset: () => this.clear(),
        onStatus: (s) => o.onStatus?.(s),
      },
      o.client,
    );
    this.client.joinRoom(o.room);
    // 방 안에서 꾸미기를 바꾸면 내 아바타에 바로 입히고 방 사람들에게도 알린다
    this.offLook = bridge.on("look:set", ({ look, lookGrant, dye, body }) => {
      const clean = Array.isArray(look) ? look.filter((x): x is string => typeof x === "string") : [];
      o.me?.setLook(clean);
      o.me?.applyAppearance({ dye, body });
      if (lookGrant) this.client.look(lookGrant);
    });
    if (o.expressions) {
      this.meScreen = new MeScreen(scene);
      this.offs.push(
        bridge.on("input:say", ({ id }) => this.say(id)),
        bridge.on("input:emo", ({ id }) => this.emo(id)),
        bridge.on("input:chat", ({ text }) => this.chat(text)),
      );
    }
  }

  /** 나를 포함한 방 인원 (접속 전이면 1) */
  get count(): number {
    return this.client.status.count;
  }

  get status(): RoomStatus {
    return this.client.status;
  }

  /** 3번 집 안 1인 자리: 점유표를 통째로 맞춘다 (welcome·sync) */
  private setSeats(seats: Record<string, Sid>): void {
    this.seats.clear();
    for (const r of this.remotes.values()) r.seatId = null;
    for (const [id, sid] of Object.entries(seats)) {
      this.seats.set(id, sid);
      const r = this.remotes.get(sid);
      if (r) r.seatId = id;
    }
    this.o.onSeats?.();
  }

  /** 3번 집 안 1인 자리 점유 요청 / 일어나기 / 가구 쓰기 (내 화면은 부르는 쪽이 먼저 반영한다) */
  sit(seatId: string): void {
    this.client.sit(seatId);
  }
  stand(): void {
    this.client.stand();
  }
  use(u: string, a: number): void {
    this.client.use(u, a);
  }

  /** 다른 방으로 (같은 씬에서 사냥터 난이도를 바꾸는 등) */
  switchRoom(room: string): void {
    this.client.joinRoom(room);
  }

  /** 정해진 문장 말풍선: 내 머리 위에 바로 띄우고 방에 보낸다 */
  say(id: string): void {
    const text = phraseOf(id);
    const now = performance.now();
    if (!text || this.destroyed || now - this.sayAt < SAY_COOLDOWN_MS) return;
    this.sayAt = now;
    this.o.me?.say(text, performance.now());
    this.client.say(id);
  }

  /** 5번 이모티콘: 내 머리 위에 바로 띄우고 방에 보낸다 (연타는 EMO_COOLDOWN_MS로 묶는다 — 서버도 같은 간격) */
  emo(id: string): void {
    const now = performance.now();
    if (!isEmoId(id) || this.destroyed || now - this.emoAt < EMO_COOLDOWN_MS) return;
    this.emoAt = now;
    this.o.me?.emote(emoIcon(id), now, EMO_SHOW_MS);
    this.client.emo(id);
  }

  /** 말풍선 자유 채팅: 내 머리 위에 가린 글을 바로 띄우고 방에 보낸다 (도배 제한은 입력칸과 서버) */
  chat(raw: string): void {
    const text = normalizeChat(raw);
    if (!text || this.destroyed) return;
    const shown = maskChat(text);
    this.o.me?.chat(shown, performance.now());
    this.client.chat(text);
    // 채팅 기록창: 내 글도 바로 (이름은 내 이름표 그대로)
    if (this.o.me) bridge.emit("chat:line", { name: this.o.me.label.text, text: shown, mine: true, ...(this.o.me.staff ? { staff: true as const } : {}) });
  }

  /** 몸짓 (손 흔들기·환호 등): 내 아바타가 바로 하고 방에 보낸다 */
  act(kind: ActKind): void {
    this.o.me?.playAct(kind, performance.now());
    this.client.act(kind);
  }

  /**
   * 매 프레임. now = performance.now() (보간 시계), view = 화면(월드 좌표, 컬링용 — 없으면 컬링 안 함),
   * labelScale = 이름표 배율 (보통 1/zoom)
   */
  update(now: number, view: Phaser.Geom.Rectangle | null, labelScale: number): void {
    if (this.destroyed) return;
    this.client.tick(now);
    const depth = this.o.depth;
    for (const r of this.remotes.values()) {
      r.update(now, view, labelScale);
      if (depth !== undefined) r.view.sprite.setDepth(depth);
    }
    this.declutter(now);
    const me = this.o.me?.sprite;
    if (this.meScreen && me) this.meScreen.update(me.x, me.y);
    if (this.client.online && now >= this.peerCheckAt) {
      this.peerCheckAt = now + PEER_CHECK_MS;
      if (this.remotes.size !== this.client.peerCount) this.client.requestSync();
    }
  }

  /** 이름표·말풍선이 겹치면 위쪽 것을 올린다 (내 아바타 포함) */
  private declutter(now: number): void {
    let n = 0;
    const me = this.o.me;
    if (me) n = this.pushView(me, n, now);
    for (const r of this.remotes.values()) if (r.visible) n = this.pushView(r.view, n, now);
    if (n < 2) return;
    declutter(this.boxes, this.order, n);
    for (let i = 0; i < n; i++) {
      const b = this.boxes[i];
      if (b.t) {
        if (b.t.y !== b.y) b.t.setY(b.y);
      } else this.bubbleOf[i]?.setBottom(b.y);
    }
  }

  private readonly bubbleOf: (ReturnType<AvatarView["speechAt"]> | undefined)[] = [];

  private pushView(v: AvatarView, n: number, now: number): number {
    if (!v.label.visible) return n;
    let b = this.boxes[n];
    if (!b) this.boxes.push((b = { x: 0, y: 0, w: 0, h: 0, t: null }));
    const t = v.label;
    b.t = t;
    b.x = t.x;
    b.y = t.y;
    b.w = t.width + 2 * (t.scaleX || 1);
    b.h = t.height;
    this.bubbleOf[n] = undefined;
    n++;
    const sp = v.speechAt(now);
    if (!sp) return n;
    let c = this.boxes[n];
    if (!c) this.boxes.push((c = { x: 0, y: 0, w: 0, h: 0, t: null }));
    c.t = null;
    c.x = sp.box.x;
    c.y = sp.box.y;
    c.w = sp.box.w;
    c.h = sp.box.h;
    this.bubbleOf[n] = sp;
    return n + 1;
  }

  private add(p: PeerInfo): void {
    if (p.sid === this.client.mySid) return;
    this.remotes.get(p.sid)?.destroy();
    const body = isAvatarBody(p.body) ? p.body : "hood";
    const r = new RemoteAvatar(this.scene, this.o.atlas, p.sid, p.name, avatarColorSpec(p.color, sanitizeDye(p.dye)), p, performance.now(), p.look ?? [], body);
    r.view.setStaff(p.staff === true); // 31번 운영자 차림
    this.remotes.set(p.sid, r);
    for (const [id, sid] of this.seats) if (sid === p.sid) r.seatId = id;
  }

  /** sync 응답에 맞춘다 (없는 사람 추가, 사라진 사람 제거, 이름·색·몸 바뀌면 다시) */
  private reconcile(peers: PeerInfo[]): void {
    const keep = new Set<Sid>();
    for (const p of peers) {
      keep.add(p.sid);
      const r = this.remotes.get(p.sid);
      const body = isAvatarBody(p.body) ? p.body : "hood";
      if (!r || r.name !== p.name || r.view.colorSpec !== avatarColorSpec(p.color, sanitizeDye(p.dye)) || r.view.bodyId !== body) this.add(p);
      else r.view.setLook(p.look ?? []);
    }
    for (const [sid, r] of this.remotes) {
      if (keep.has(sid)) continue;
      r.destroy();
      this.remotes.delete(sid);
    }
  }

  private clear(): void {
    for (const r of this.remotes.values()) r.destroy();
    this.remotes.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offLook?.();
    this.offLook = null;
    for (const off of this.offs.splice(0)) off();
    this.meScreen?.destroy();
    this.meScreen = null;
    this.client.leave();
    this.clear();
  }
}

/** 기본 상태 (씬이 아직 플레이어를 만들기 전에 getPose가 불릴 때) */
export const IDLE_POSE: RoomPose = { x: 0, y: 0, state: STATE.idle, dir: DIR.down };
