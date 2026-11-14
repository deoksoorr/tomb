// "뒤로 간 상태" 판정: 탭이 숨겨졌거나(document.hidden), 창이 포커스를 잃은 채(다른 창을 보는 중) BACKGROUND_DELAY_MS가 지났다.
// 탭은 보이지만 다른 창을 띄워 보는 경우에는 document.hidden이 false라 이 판정으로 잡는다.
// 뒤로 간 동안: Redis를 쓰는 주기 호출은 숨긴 탭처럼 멈추고, 게임은 렌더·갱신을 크게 줄인다 (소리·실시간 연결·게임 시계는 그대로).
// 창이 포커스를 다시 얻거나 포인터·키 입력이 오면 바로 앞으로 돌아온다 (포커스 없이 입력만 오면 그때부터 다시 BACKGROUND_DELAY_MS를 센다).

/** 포커스를 잃은 뒤 뒤로 간 것으로 보기까지 */
export const BACKGROUND_DELAY_MS = 20_000;

type Listener = (background: boolean) => void;

/** 판정에 쓰는 브라우저 (시험에서 바꿔 끼운다) */
export type BackgroundEnv = {
  hidden(): boolean;
  hasFocus(): boolean;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  on(target: "window" | "document", type: string, fn: () => void): () => void;
};

/** 뒤로 간 상태 판정기 (화면 하나에 하나 — 모듈 기본값 backgroundWatch) */
export class BackgroundWatch {
  private bg = false;
  private timer: unknown = null;
  private readonly listeners = new Set<Listener>();
  private offs: (() => void)[] = [];
  private started = false;

  constructor(private readonly env: BackgroundEnv) {}

  /** 지금 뒤로 간 상태인지 */
  get background(): boolean {
    this.start();
    return this.bg;
  }

  /** 상태가 바뀔 때마다 (뒤로 감 = true, 돌아옴 = false). 해제 함수를 돌려준다 */
  subscribe(fn: Listener): () => void {
    this.start();
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** 듣기 시작 (처음 묻거나 구독할 때 한 번) */
  start(): void {
    if (this.started) return;
    this.started = true;
    const e = this.env;
    this.offs = [
      e.on("document", "visibilitychange", this.update),
      e.on("window", "focus", this.active),
      e.on("window", "blur", this.update),
      // 포커스 없이 와도 보고 있다는 뜻 (다른 창 위로 마우스를 올려 움직이거나 누름)
      e.on("window", "pointerdown", this.active),
      e.on("window", "pointermove", this.active),
      e.on("window", "keydown", this.active),
      e.on("window", "wheel", this.active),
      e.on("window", "touchstart", this.active),
    ];
    this.update();
  }

  /** 시험·정리용 */
  stop(): void {
    for (const off of this.offs.splice(0)) off();
    this.clearTimer();
    this.started = false;
    this.listeners.clear();
  }

  /** 입력·포커스: 바로 앞으로. 포커스가 없으면 지금부터 다시 센다 */
  private readonly active = () => {
    this.clearTimer();
    if (this.env.hidden()) return this.set(true);
    this.set(false);
    if (!this.env.hasFocus()) this.arm();
  };

  /** 숨김·포커스 잃음: 숨겼으면 바로 뒤로, 포커스만 잃었으면 BACKGROUND_DELAY_MS 뒤에 */
  private readonly update = () => {
    if (this.env.hidden()) {
      this.clearTimer();
      return this.set(true);
    }
    if (this.env.hasFocus()) {
      this.clearTimer();
      return this.set(false);
    }
    // 숨김에서 막 돌아왔는데 포커스가 없으면(다른 창이 앞) 일단 앞으로 보고 다시 센다
    if (this.bg && this.timer === null) this.set(false);
    if (this.timer === null) this.arm();
  };

  private arm(): void {
    this.timer = this.env.setTimeout(() => {
      this.timer = null;
      if (!this.env.hasFocus()) this.set(true);
    }, BACKGROUND_DELAY_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
  }

  private set(bg: boolean): void {
    if (bg === this.bg) return;
    this.bg = bg;
    for (const fn of [...this.listeners]) fn(bg);
  }
}

const browserEnv: BackgroundEnv = {
  hidden: () => document.visibilityState === "hidden",
  hasFocus: () => document.hasFocus(),
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id as number),
  on(target, type, fn) {
    const t = target === "window" ? window : document;
    t.addEventListener(type, fn, { passive: true });
    return () => t.removeEventListener(type, fn);
  },
};

let shared: BackgroundWatch | null = null;
const watch = () => (shared ??= new BackgroundWatch(browserEnv));

/** 지금 뒤로 간 상태인지 (서버 렌더·시험 환경(document 없음)은 앞으로) */
export function isBackground(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  return watch().background;
}

/** 뒤로 감·돌아옴을 듣는다. 해제 함수를 돌려준다 */
export function onBackgroundChange(fn: Listener): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => undefined;
  return watch().subscribe(fn);
}
