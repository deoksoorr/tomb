import { isEmoId, isSeatMood, maskChat, normalizeChat, type Sid } from "@tomb/protocol";
import { bridge } from "../bridge";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import type { KeyAction } from "../input/Keyboard";
import { EMO_COOLDOWN_MS, EMO_SHOW_MS, emoIcon, emoSlotOfKey } from "../logic/emoBoard";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { CameraRig } from "./CameraRig";
import type { Sfx } from "./Sfx";

// 월드에서 내 표현과 그 곁의 연출을 맡는다 (WorldScene에서 떼어 낸 작은 조각):
//  - 5번 이모티콘: 이모티콘 판·단축키 3~9 → 내 머리 위에 바로 + 같은 채널에 보낸다 (도배 제한은 서버, 화면도 같은 간격)
//  - 24번 벤치 상태: 앉아 있을 때만 고른다 → 내 아바타에 바로 + 서버에 보낸다. 일어나면 바로 감추고(서버도 자리 해제와 함께 푼다)
//    UI에는 mood:state(sticky)로 "지금 고를 수 있는지·고른 것"을 알린다
//  - 14번 연출: 물속(수영·잠수)·그네에서 카메라를 살짝 확대, 물소리(환경음)·그네 삐걱(효과음)

/** 물속·그네에서 카메라 확대 배율 */
export const ACCENT_ZOOM = 1.12;
/** 그네 진자 주기 (AvatarView SWING_PERIOD와 같다) — 한 주기마다 삐걱 한 번 (앞·뒤 두 소리가 든 파일) */
const SWING_PERIOD = 1600;

export type ExpressionHost = {
  player: () => Player;
  net: () => RealtimeClient;
  remotes: () => ReadonlyMap<Sid, RemoteAvatar>;
  sfx: Sfx;
  rig: CameraRig;
  reduced: boolean;
  /** 손 흔들기·환호 (이모티콘 판 1·2번 칸) */
  act: (kind: "wave" | "cheer") => void;
};

export class Expressions {
  private emoAt = -Infinity;
  private emitted = "";
  private swingCycle = -1;

  constructor(private readonly h: ExpressionHost) {}

  /** 숫자 키 3~9 (Keyboard emo3~emo9). 처리했으면 true */
  key(a: KeyAction, now: number): boolean {
    if (!a.startsWith("emo")) return false;
    const slot = emoSlotOfKey(Number(a.slice(3)));
    if (!slot) return true;
    if (slot.kind === "act") this.h.act(slot.id);
    else this.emo(slot.id, now);
    return true;
  }

  /** 내 이모티콘: 바로 띄우고 같은 채널에 보낸다 (연타는 EMO_COOLDOWN_MS로 묶는다) */
  emo(id: string, now: number): void {
    if (!isEmoId(id) || now - this.emoAt < EMO_COOLDOWN_MS) return;
    this.emoAt = now;
    this.h.player().view.emote(emoIcon(id), now, EMO_SHOW_MS);
    this.h.net().emo(id);
    this.h.sfx.play("say", 0.35);
  }

  /** 말풍선 자유 채팅: 내 머리 위에 가린 글을 바로 띄우고 같은 채널에 보낸다 (도배 제한은 입력칸과 서버) */
  chat(raw: string, now: number): void {
    const text = normalizeChat(raw);
    if (!text) return;
    this.h.player().view.chat(maskChat(text), now);
    this.h.net().chat(text);
    this.h.sfx.play("say", 0.35);
  }

  /** 다른 사람의 자유 채팅 (서버가 가린 글). 떠 있던 말풍선·이모티콘은 바로 바뀐다 */
  onRemoteChat(sid: Sid, text: string): void {
    const r = this.h.remotes().get(sid);
    if (!r) return;
    r.view.chat(text, performance.now());
    if (r.visible) this.h.sfx.play("say", 0.2, 1.1, 6);
  }

  /** 다른 사람의 이모티콘 (원격 아바타는 performance.now 시계로 그린다) */
  onRemoteEmo(sid: Sid, id: string): void {
    const r = this.h.remotes().get(sid);
    if (!r || !isEmoId(id)) return;
    r.view.emote(emoIcon(id), performance.now(), EMO_SHOW_MS);
    if (r.visible) this.h.sfx.play("say", 0.2, 1.1, 6);
  }

  /** 벤치 상태 알림 (내 것은 서버가 받아들였다는 확인 — 화면은 이미 반영했다) */
  onRemoteMood(sid: Sid, mood: string): void {
    if (sid === this.h.net().mySid) return;
    this.h.remotes().get(sid)?.view.setMood(mood);
  }

  /** 내가 고른 벤치 상태 ("" = 풀기). 앉아 있을 때만 */
  setMood(mood: string): void {
    const pl = this.h.player();
    if (!this.seated(pl) || (mood !== "" && !isSeatMood(mood))) return;
    if ((pl.view.mood ?? "") === mood) return;
    pl.view.setMood(mood);
    this.h.net().mood(mood === "" ? "" : (mood as Parameters<RealtimeClient["mood"]>[0]));
    this.emit(pl);
  }

  /** 서버가 내 좌석을 확정했다 (다시 붙음·옮겨 앉기): 고른 상태가 있으면 다시 알린다 (재접속하면 서버가 잊었을 수 있다) */
  onMySeat(): void {
    const m = this.h.player().view.mood;
    if (m && isSeatMood(m)) this.h.net().mood(m);
  }

  /** 매 프레임 (now = 내 캐릭터를 그리는 씬 시계) */
  update(now: number): void {
    const pl = this.h.player();
    // 일어나면 바로 감춘다 (서버는 자리 해제와 함께 풀고 모두에게 알린다)
    if (!this.seated(pl) && pl.view.mood) pl.view.setMood(null);
    this.emit(pl);

    // ── 14번 물속·그네 연출 ──
    const st = pl.state;
    const wet = st === "swim" || st === "dive" ? st : null;
    this.h.rig.setAccent(!this.h.reduced && (wet || st === "swing") ? ACCENT_ZOOM : 1);
    const v = pl.body.velocity;
    this.h.sfx.water(wet, Math.hypot(v.x, v.y) > 8, now);
    if (st === "swing") {
      const cycle = Math.floor(now / SWING_PERIOD);
      if (cycle !== this.swingCycle) {
        this.swingCycle = cycle;
        this.h.sfx.swingCreak(0.55);
      }
    } else this.swingCycle = -1;
  }

  private seated(pl: Player): boolean {
    // 상호작용 중이면 벤치 상태를 쓸 수 있다: 의자·그네·나무·해먹·배·놀이기구·낚시 같은 자리, 또는 수영·잠수
    return !!pl.seat || pl.anchored || pl.state === "swim" || pl.state === "dive";
  }

  private emit(pl: Player): void {
    const seated = this.seated(pl);
    const mood = seated ? (pl.view.mood ?? "") : "";
    const key = `${seated}|${mood}`;
    if (key === this.emitted) return;
    this.emitted = key;
    bridge.emit("mood:state", { seated, mood });
  }

  destroy(): void {
    this.h.sfx.water(null, false, 0);
    if (this.emitted) bridge.emit("mood:state", { seated: false, mood: "" });
  }
}
