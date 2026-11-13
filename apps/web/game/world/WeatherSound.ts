import * as Phaser from "phaser";
import { bridge } from "../bridge";
import type { GameContext } from "../scenes/context";
import { releaseOnEnd } from "@/lib/sharedAudio";
import { AmbientLoop } from "./ambientLoop";
import { AudioHost } from "./audioHost";

// 날씨 소리 (게임마다 하나): 비 오는 동안 빗소리 루프(세기 = 비 세기), 가끔 천둥.
// 월드·마을·집의 Atmosphere가 매 프레임 지금 비 세기와 실내 여부를 알려 준다(report).
// 아무도 알려 주지 않으면(유령 잡화점 등 Atmosphere 없는 씬) 화면 종류(scene:changed)로 정한다:
//   잡화점·집 = 벽 너머로 먹먹하게, 사냥터·미니게임 = 다른 곳이라 끈다.
// 13번: 환경음 갈래(amb 버스, audio:mix)를 따른다. 탭 전환 뒤 다시 깨우는 것은 AmbientLoop·AudioHost가 맡는다.

const REGISTRY_KEY = "weatherSound";
/** 이만큼 report가 없으면 Atmosphere가 없는 씬으로 본다 */
const STALE_MS = 400;
/** 실내(먹먹)에서의 크기 */
const MUFFLED_GAIN = 0.4;
const RAIN_URL = "/sfx/rain-loop.mp3";
const THUNDER_URL = "/sfx/thunder.mp3";

type Place = "open" | "muffled" | "away";

export class WeatherSound extends AudioHost {
  private readonly rain = new AmbientLoop(this, RAIN_URL, { gain: 0.55, filter: true });
  private rainLevel = 0;
  private reportAt = -Infinity;
  private place: Place = "open";
  private thunderBuf: AudioBuffer | null = null;
  private thunderLoading = false;
  private thunderFailed = false;
  private readonly offs: (() => void)[] = [];
  private dead = false;

  /** 이 게임의 날씨 소리 (처음 부를 때 만든다). 게임이 정리되면 같이 정리된다 */
  static of(scene: Phaser.Scene): WeatherSound {
    const reg = scene.game.registry;
    const have = reg.get(REGISTRY_KEY) as WeatherSound | undefined;
    if (have && !have.dead) return have;
    const s = new WeatherSound(scene.game);
    reg.set(REGISTRY_KEY, s);
    return s;
  }

  private constructor(game: Phaser.Game) {
    super("amb");
    // Atmosphere가 없는 씬(잡화점·사냥터)에서는 화면 종류로 정한다
    game.events.on(Phaser.Core.Events.POST_STEP, this.onStep);
    this.offs.push(() => game.events.off(Phaser.Core.Events.POST_STEP, this.onStep));
    // 숨은 탭에서 게임을 내리면 Phaser 정리(다음 프레임)를 기다리지 않고 바로 끈다
    const ctx = game.registry.get("ctx") as GameContext | undefined;
    ctx?.disposers.push(() => this.destroy());
    game.events.once(Phaser.Core.Events.DESTROY, () => this.destroy());
  }

  protected override onMixChanged(): void {
    this.rain.refresh();
  }

  /** Atmosphere가 매 프레임: 지금 비 세기 0..1, 실내인지 */
  report(rain: number, indoor: boolean): void {
    if (this.dead) return;
    this.reportAt = performance.now();
    this.rainLevel = rain;
    this.apply(indoor ? "muffled" : "open");
  }

  private readonly onStep = (): void => {
    if (this.dead || performance.now() - this.reportAt < STALE_MS) return;
    const scene = bridge.last("scene:changed")?.scene;
    this.apply(scene === "shop" || scene === "house" ? "muffled" : "away");
  };

  private apply(place: Place): void {
    this.place = place;
    this.rain.setMuffled(place === "muffled");
    const k = place === "open" ? 1 : place === "muffled" ? MUFFLED_GAIN : 0;
    // 아주 약한 비는 소리를 내지 않는다 (날씨가 바뀌며 섞이는 동안)
    this.rain.set(this.rainLevel > 0.05 ? (0.35 + 0.65 * this.rainLevel) * k : 0);
    if (this.rainLevel > 0.3 && !this.thunderBuf) this.loadThunder();
  }

  /** 지금 비 소리가 나고 있는지 (QA) */
  get raining(): boolean {
    return this.rain.playing;
  }

  /** 천둥 한 번. gain 0..1, delay: 번개 뒤 소리가 닿기까지(초) */
  thunder(gain: number, delay: number): void {
    if (this.dead || this.place === "away" || this.muted) return;
    const ac = this.audio();
    if (!ac) return;
    const buf = this.thunderBuf;
    if (!buf) {
      this.loadThunder();
      return;
    }
    const t = ac.currentTime + Math.max(0, delay);
    const src = ac.createBufferSource();
    src.buffer = buf;
    // 칠 때마다 조금씩 다른 높이·길이
    src.playbackRate.value = 0.82 + Math.random() * 0.3;
    const g = ac.createGain();
    g.gain.value = Math.min(1, this.volume * gain * (this.place === "muffled" ? 0.55 : 1)) * 0.9;
    let head: AudioNode = g;
    if (this.place === "muffled") {
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      lp.connect(g);
      head = lp;
    }
    g.connect(this.output);
    src.connect(head);
    src.start(t);
    releaseOnEnd(src, g, ...(head === g ? [] : [head]));
  }

  private loadThunder(): void {
    if (this.thunderLoading || this.thunderFailed || typeof fetch === "undefined") return;
    const ac = this.audio();
    if (!ac) return;
    this.thunderLoading = true;
    fetch(THUNDER_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => {
        this.thunderBuf = buf;
        this.thunderLoading = false;
      })
      .catch(() => {
        this.thunderLoading = false;
        this.thunderFailed = true;
      });
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    for (const off of this.offs.splice(0)) off();
    this.rain.destroy();
    this.closeAudio();
  }
}
