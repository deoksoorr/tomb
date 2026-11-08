import { readItem, writeItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { nextIndex, parseManifest, type Playlist, type Track } from "./manifest";
import { silentWav } from "./silence";

// BGM 엔진 (싱글턴). iOS는 audio.volume을 무시하므로 볼륨·크로스페이드는 모두 Web Audio GainNode로 한다.
// <audio> 두 개(덱 A/B)를 번갈아 쓰며, 곡을 바꿀 때 한쪽을 1.5초 동안 줄이고 다른 쪽을 키운다.
// iOS는 사용자 제스처 안에서 한 번이라도 play()된 <audio>만 나중에 스스로 재생할 수 있다.
// 그래서 첫 제스처(입장 클릭) 때 두 덱 모두 무음으로 잠깐 재생해 깨워 두고, 이후 곡 넘김·크로스페이드는 제스처 없이 한다.

const MANIFEST_URL = "/bgm/tracks.json";
const CROSSFADE_SEC = 1.5;
const PAUSE_FADE_SEC = 0.25;
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
      const savedPlaylist = readItem(LS.playlist);
      const savedVolume = readItem(LS.volume);
      this.set({
        loaded: true,
        playlists,
        playlistId: playlists.find((p) => p.id === savedPlaylist)?.id ?? playlists[0]?.id ?? this.state.playlistId,
        volume: savedVolume !== null && Number.isFinite(+savedVolume) ? clamp01(+savedVolume) : DEFAULT_VOLUME,
        muted: readItem(LS.muted) === "1",
      });
    })();
    return this.loading;
  }

  /** 사용자 제스처(입장 클릭, 재생 버튼) 안에서 불러야 한다. tracks.json이 아직 안 왔어도 덱을 깨워 두고 도착하면 시작한다 */
  play(): void {
    this.ensureGraph();
    void this.ctx?.resume();
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
    if (deck && track && deck.file === track.file && !deck.audio.ended) this.resumeDeck(deck);
    else this.startTrack();
  }

  pause(): void {
    this.set({ playing: false });
    this.decks.forEach((deck) => this.fadeOut(deck, PAUSE_FADE_SEC));
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  next(): void {
    this.set({ index: nextIndex(this.state.index, this.tracks().length) });
    if (this.state.playing) {
      void this.ctx?.resume();
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
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    writeItem(LS.muted, muted ? "1" : "0");
    this.set({ muted });
    this.applyVolume();
  }

  private set(patch: Partial<BgmState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private tracks(): Track[] {
    return this.state.playlists.find((p) => p.id === this.state.playlistId)?.tracks ?? [];
  }

  private ensureGraph(): void {
    if (this.ctx || typeof AudioContext === "undefined") return;
    const ctx = new AudioContext();
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
      audio.addEventListener("error", () => this.onDeckError(deck));
      audio.addEventListener("playing", () => {
        this.failures = 0;
      });
      return deck;
    });
    this.ctx = ctx;
    this.master = master;
    this.applyVolume();
  }

  /** 두 덱을 무음으로 재생했다가 멈춘다 (gain 0). 그 사이 진짜 곡이 걸리면(token 변경) 멈추지 않는다 */
  private unlockDecks(): void {
    if (this.unlocked || this.decks.length === 0) return;
    this.unlocked = true;
    const silence = URL.createObjectURL(new Blob([silentWav()], { type: "audio/wav" }));
    for (const deck of this.decks) {
      const token = deck.token;
      deck.audio.src = silence;
      deck.audio
        .play()
        .then(() => {
          if (deck.token === token) deck.audio.pause();
        })
        .catch(() => {
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
    setTimeout(() => {
      if (deck.token === token) deck.audio.pause();
    }, sec * 1000 + 50);
  }

  // deck.file이 비어 있으면 깨우기용 무음이다
  private onDeckDone(deck: Deck): void {
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
