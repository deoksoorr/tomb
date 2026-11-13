import { bridge } from "@/game/bridge";
import { audioLife, type AudioLifeState } from "@/lib/audioLife";
import { setAudioSessionType } from "@/lib/audioSession";
import { sharedAudioContext } from "@/lib/sharedAudio";
import { readItem, writeItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { nextIndex, parseManifest, randomStart, type Playlist, type Track } from "./manifest";
import { silentWav } from "./silence";

// BGM 엔진 (싱글턴). iOS는 audio.volume을 무시하므로 볼륨·크로스페이드는 모두 Web Audio GainNode로 한다.
// <audio> 두 개(덱 A/B)를 번갈아 쓰며, 곡을 바꿀 때 한쪽을 1.5초 동안 줄이고 다른 쪽을 키운다.
// iOS는 사용자 제스처 안에서 한 번이라도 play()된 <audio>만 나중에 스스로 재생할 수 있다.
// 그래서 첫 제스처(입장 클릭) 때 두 덱 모두 무음으로 잠깐 재생해 깨워 두고, 이후 곡 넘김·크로스페이드는 제스처 없이 한다.
// 탭이 숨으면 게임 소리와 함께 멈추고 돌아오면 함께 이어서 튼다 (lib/audioLife가 컨텍스트를 suspend·resume, 덱은 여기서 pause·play).
// 컨텍스트는 게임 소리와 같은 공용 하나(lib/sharedAudio), <audio>는 이 두 덱뿐이다 — 효과음은 모두 WebAudio 버퍼.
// 아이폰 잠금 화면·다이내믹 아일랜드에는 mediaSession으로 지금 곡 하나만 보인다 (곡이 바뀔 때만 메타데이터를 바꾼다).
// 아이폰 오디오 세션 종류는 BGM을 켜면 playback, 끄면 ambient로 고정한다 (lib/audioSession — auto면 효과음마다 세션이 바뀌며 아일랜드가 깜빡인다).

const MANIFEST_URL = "/bgm/tracks.json";
const CROSSFADE_SEC = 1.5;
const PAUSE_FADE_SEC = 0.25;
/** 곡이 끝나기 이만큼 전에 다음 곡으로 크로스페이드를 시작한다 (끝난 뒤 넘기면 사이가 뚝 끊긴다) */
const TAIL_SEC = CROSSFADE_SEC + 1;
const DEFAULT_VOLUME = 0.5;

export type BgmState = {
  loaded: boolean;
  playlists: Playlist[];
  playlistId: string;
  index: number;
  playing: boolean;
  volume: number;
  muted: boolean;
};

export const INITIAL_BGM_STATE: BgmState = {
  loaded: false,
  playlists: [],
  playlistId: "orgel",
  index: 0,
  playing: false,
  volume: DEFAULT_VOLUME,
  muted: false,
};

/** file: 이 덱에 걸려 있는 곡. token: 예약된 일시정지를 무효화하는 번호 */
type Deck = { audio: HTMLAudioElement; gain: GainNode; file: string; token: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function currentTrack(state: BgmState): Track | null {
  return state.playlists.find((p) => p.id === state.playlistId)?.tracks[state.index] ?? null;
}

class BgmEngine {
  private state = INITIAL_BGM_STATE;
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: Deck[] = [];
  private active = 0;
  private loading: Promise<void> | null = null;
  private failures = 0;
  private unlocked = false;
  /** 탭이 숨을 때 멈춘 덱 (돌아오면 이어서 튼다) */
  private readonly hiddenPaused = new Set<Deck>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.state;

  /** 입장 버튼을 누르기 전에 불러 둬야 클릭 제스처 안에서 바로 audio.play()를 부를 수 있다 (iOS) */
  load(): Promise<void> {
    this.loading ??= (async () => {
      const playlists = await fetch(MANIFEST_URL)
        .then((r) => (r.ok ? r.json() : null))
        .then(parseManifest)
        .catch(() => []);
      const start = randomStart(playlists, readItem(LS.playlist));
      const savedVolume = readItem(LS.volume);
      this.set({
        loaded: true,
        playlists,
        playlistId: start.playlistId ?? this.state.playlistId,
        index: start.index,
        volume: savedVolume !== null && Number.isFinite(+savedVolume) ? clamp01(+savedVolume) : DEFAULT_VOLUME,
        muted: readItem(LS.muted) === "1",
      });
      this.shareAudioSettings();
    })();
    // 앱 시작 때 한 번: 아직 BGM 전이므로 ambient (트는 순간 play()가 playback으로 바꾼다)
    this.syncSession();
    return this.loading;
  }

  /** 사용자 제스처(입장 클릭, 재생 버튼) 안에서 불러야 한다. tracks.json이 아직 안 왔어도 덱을 깨워 두고 도착하면 시작한다 */
  play(): void {
    // 덱을 재생하기 전에 세션 종류부터 (재생 도중 바꾸면 세션이 한 번 더 흔들린다)
    setAudioSessionType("playback");
    this.ensureGraph();
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => undefined);
    this.unlockDecks();
    this.set({ playing: true });
    if (!this.state.loaded) {
      void this.load().then(() => {
        if (this.state.playing) this.startTrack();
      });
      return;
    }
    const deck = this.decks[this.active];
    const track = this.tracks()[this.state.index];
    if (deck && track && deck.file === track.file && !deck.audio.ended) {
      this.updateMediaSession(track);
      this.resumeDeck(deck);
    } else this.startTrack();
  }

  pause(): void {
    this.set({ playing: false });
    this.updateMediaSession(null);
    this.decks.forEach((deck) => this.fadeOut(deck, PAUSE_FADE_SEC));
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  next(): void {
    this.set({ index: nextIndex(this.state.index, this.tracks().length) });
    if (this.state.playing) {
      if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => undefined);
      this.startTrack();
    }
  }

  setPlaylist(id: string): void {
    if (id === this.state.playlistId) return;
    writeItem(LS.playlist, id);
    this.set({ playlistId: id, index: 0 });
    if (this.state.playing) this.startTrack();
  }

  setVolume(volume: number): void {
    const v = clamp01(volume);
    writeItem(LS.volume, String(v));
    writeItem(LS.muted, "0");
    this.set({ volume: v, muted: false });
    this.applyVolume();
    this.shareAudioSettings();
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    writeItem(LS.muted, muted ? "1" : "0");
    this.set({ muted });
    this.applyVolume();
    this.shareAudioSettings();
  }

  /** 게임 효과음도 같은 볼륨·음소거를 따른다 */
  private shareAudioSettings(): void {
    bridge.emit("audio:settings", { volume: this.state.volume, muted: this.state.muted });
  }

  private set(patch: Partial<BgmState>): void {
    this.state = { ...this.state, ...patch };
    if ("playing" in patch) this.syncSession();
    this.listeners.forEach((fn) => fn());
  }

  /** BGM 재생 여부에 맞춰 아이폰 오디오 세션 종류를 고정한다 (같으면 아무것도 안 한다) */
  private syncSession(): void {
    setAudioSessionType(this.state.playing ? "playback" : "ambient");
  }

  private tracks(): Track[] {
    return this.state.playlists.find((p) => p.id === this.state.playlistId)?.tracks ?? [];
  }

  private ensureGraph(): void {
    if (this.ctx) return;
    const ctx = sharedAudioContext();
    if (!ctx) return;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.decks = [0, 1].map(() => {
      const audio = new Audio();
      audio.preload = "auto";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain).connect(master);
      const deck: Deck = { audio, gain, file: "", token: 0 };
      audio.addEventListener("ended", () => this.onDeckDone(deck));
      audio.addEventListener("timeupdate", () => this.onDeckTime(deck));
      audio.addEventListener("error", () => this.onDeckError(deck));
      audio.addEventListener("playing", () => {
        this.failures = 0;
      });
      return deck;
    });
    this.ctx = ctx;
    this.master = master;
    audioLife.on(this.onLife);
    this.applyVolume();
    this.bindMediaSession();
  }

  /** 잠금 화면·다이내믹 아일랜드의 재생/일시정지/다음 곡 버튼 (한 번만) */
  private bindMediaSession(): void {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    const on = (action: MediaSessionAction, fn: () => void) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // 지원하지 않는 동작
      }
    };
    on("play", () => this.play());
    on("pause", () => this.pause());
    on("nexttrack", () => this.next());
  }

  private sessionFile = "";

  private sessionState: MediaSessionPlaybackState | "" = "";

  /**
   * 지금 곡을 시스템에 알린다 (같은 곡·같은 상태면 그대로 둔다 — 자꾸 바꾸면 아일랜드가 깜빡인다).
   * 멈추면(track=null) 곡 정보를 비운다: 세션이 ambient가 되므로 잠금 화면에 멈춘 곡 카드를 남기지 않는다
   */
  private updateMediaSession(track: Track | null): void {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    try {
      const state: MediaSessionPlaybackState = this.state.playing ? "playing" : "paused";
      if (state !== this.sessionState) {
        this.sessionState = state;
        ms.playbackState = state;
      }
      if (!track && !this.state.playing && this.sessionFile) {
        this.sessionFile = "";
        ms.metadata = null;
        return;
      }
      if (!track || track.file === this.sessionFile || typeof MediaMetadata === "undefined") return;
      this.sessionFile = track.file;
      const list = this.state.playlists.find((p) => p.id === this.state.playlistId);
      ms.metadata = new MediaMetadata({ title: track.title, artist: track.artist || "한때는", album: list?.title ?? "한때는" });
    } catch {
      // mediaSession을 못 쓰면 조용히
    }
  }

  /** 탭 숨김: 울리는 덱을 멈춰 둔다. 복귀(또는 복귀 뒤 첫 입력): 재생 중이었으면 그 덱들을 이어서 튼다 */
  private readonly onLife = (state: AudioLifeState): void => {
    if (state === "hidden") {
      for (const deck of this.decks) {
        if (!deck.audio.paused && !deck.audio.ended) {
          deck.audio.pause();
          this.hiddenPaused.add(deck);
        }
      }
      return;
    }
    if (!this.state.playing) {
      this.hiddenPaused.clear();
      return;
    }
    for (const deck of [...this.hiddenPaused]) {
      // 크로스페이드 중에 숨었으면 줄어들던 덱은 그대로 둔다 (지금 곡 덱만 이어서)
      if (deck !== this.decks[this.active] || deck.audio.ended || !deck.audio.paused) {
        this.hiddenPaused.delete(deck);
        continue;
      }
      deck.audio
        .play()
        .then(() => this.hiddenPaused.delete(deck))
        .catch(() => undefined); // 막히면 다음 입력 때 audioLife가 다시 부른다
    }
  };

  /**
   * 두 덱을 무음으로 한 번 재생한다 (gain 0). 0.1초 무음은 저절로 끝나므로 pause()를 부르지 않는다
   * (아이폰은 play·pause마다 '지금 재생 중' 세션을 건드린다). 그 사이 진짜 곡이 걸리면 그 곡이 이어서 난다
   */
  private unlockDecks(): void {
    if (this.unlocked || this.decks.length === 0) return;
    this.unlocked = true;
    const silence = URL.createObjectURL(new Blob([silentWav()], { type: "audio/wav" }));
    for (const deck of this.decks) {
      deck.audio.src = silence;
      deck.audio.play().catch(() => {
        // 곧바로 진짜 곡으로 바뀌면 이 재생은 중단된다
      });
    }
  }

  private applyVolume(): void {
    if (!this.ctx || !this.master) return;
    // 귀에 들리는 크기가 슬라이더와 비슷하게 움직이도록 제곱 곡선
    const target = this.state.muted ? 0 : this.state.volume ** 2;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  /** 지금 플레이리스트의 현재 곡을 다른 덱에서 시작하고 크로스페이드한다. 곡이 없으면 조용히 재생 상태만 유지 */
  private startTrack(): void {
    const ctx = this.ctx;
    const from = this.decks[this.active];
    if (!ctx || !from) return;
    this.fadeOut(from, CROSSFADE_SEC);
    const track = this.tracks()[this.state.index];
    if (!track) return;
    this.updateMediaSession(track);
    this.active = 1 - this.active;
    const to = this.decks[this.active];
    to.token++;
    to.file = track.file;
    to.audio.src = track.file;
    const now = ctx.currentTime;
    to.gain.gain.cancelScheduledValues(now);
    to.gain.gain.setValueAtTime(0, now);
    to.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SEC);
    to.audio.play().catch((e: unknown) => {
      // 자동 재생이 막히면 재생 버튼을 다시 누르게 한다. 파일 오류는 error 이벤트에서 다음 곡으로 넘긴다
      if (e instanceof DOMException && e.name === "NotAllowedError" && to === this.decks[this.active]) {
        this.set({ playing: false });
      }
    });
  }

  private resumeDeck(deck: Deck): void {
    if (!this.ctx) return;
    deck.token++;
    const now = this.ctx.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
    deck.gain.gain.linearRampToValueAtTime(1, now + PAUSE_FADE_SEC);
    deck.audio.play().catch(() => this.set({ playing: false }));
  }

  private fadeOut(deck: Deck, sec: number): void {
    if (!this.ctx) return;
    const token = ++deck.token;
    const now = this.ctx.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
    deck.gain.gain.linearRampToValueAtTime(0, now + sec);
    // 이미 멈춘 덱(쉬고 있는 덱)은 pause()를 다시 부르지 않는다
    if (deck.audio.paused) return;
    setTimeout(() => {
      if (deck.token === token && !deck.audio.paused) deck.audio.pause();
    }, sec * 1000 + 50);
  }

  /** 곡 끝 TAIL_SEC 전: 다음 곡을 미리 겹쳐 틀어 자연스럽게 넘어가게 (덱마다 한 곡에 한 번) */
  private onDeckTime(deck: Deck): void {
    if (!deck.file || deck !== this.decks[this.active] || !this.state.playing) return;
    const left = deck.audio.duration - deck.audio.currentTime;
    if (!Number.isFinite(left) || left > TAIL_SEC || this.tailFired.get(deck) === deck.token) return;
    this.tailFired.set(deck, deck.token);
    this.next();
  }

  private readonly tailFired = new WeakMap<Deck, number>();

  // deck.file이 비어 있으면 깨우기용 무음이다
  private onDeckDone(deck: Deck): void {
    if (this.tailFired.get(deck) === deck.token) return;
    if (!deck.file || deck !== this.decks[this.active] || !this.state.playing) return;
    this.next();
  }

  /** 파일이 없거나 깨졌으면 다음 곡으로. 한 바퀴를 다 실패하면 멈춘다 */
  private onDeckError(deck: Deck): void {
    if (!deck.file || deck !== this.decks[this.active] || !this.state.playing) return;
    this.failures++;
    if (this.failures >= this.tracks().length) this.set({ playing: false });
    else this.next();
  }
}

export const bgm = new BgmEngine();
