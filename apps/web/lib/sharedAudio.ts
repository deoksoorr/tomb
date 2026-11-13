import { audioLife } from "./audioLife";

// 앱 전체가 함께 쓰는 WebAudio 컨텍스트 하나 + 미리 디코딩한 효과음 버퍼.
// 아이폰(특히 홈 화면 앱)은 <audio>를 재생·정지할 때마다 시스템 '지금 재생 중' 세션을 켜고 끈다
//  → 짧은 효과음을 <audio>로 내면 다이내믹 아일랜드가 깜빡이고, 그때마다 오디오 세션이 바뀌며 화면이 멈칫한다.
//  → 효과음·환경음은 모두 이 컨텍스트의 AudioBufferSourceNode로 내고, <audio>는 BGM만 쓴다.
// 컨텍스트도 소리 모듈마다 만들지 않고 하나만 둔다 (아이폰은 컨텍스트가 여럿이면 세션이 자주 끊기고 무겁다).
// 닫지 않는다: 소리 모듈이 사라질 때는 자기 출력 노드만 뗀다 (AudioHost.closeAudio).

type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;

function ctor(): Ctor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
}

/** 공용 컨텍스트 (없으면 만든다). 오디오를 못 쓰는 환경이면 null */
export function sharedAudioContext(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  const AC = ctor();
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
    return null;
  }
  audioLife.registerContext(ctx);
  // 컨텍스트가 생기기 전에 받아 둔 파일을 이제 디코딩한다
  for (const url of bytes.keys()) decode(url, ctx);
  return ctx;
}

/** 이미 만든 공용 컨텍스트 (새로 만들지 않는다) */
export function peekSharedAudioContext(): AudioContext | null {
  return ctx && ctx.state !== "closed" ? ctx : null;
}

// ── 효과음 파일: 한 번 받아 디코딩해 두고 재생은 버퍼로 ──
/** 받았지만 아직 디코딩 안 한 파일 (컨텍스트가 생기면 디코딩한다) */
const bytes = new Map<string, ArrayBuffer>();
const buffers = new Map<string, AudioBuffer>();
const missing = new Set<string>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const waiters = new Map<string, ((b: AudioBuffer | null) => void)[]>();

function settle(url: string, b: AudioBuffer | null): void {
  if (b) buffers.set(url, b);
  else missing.add(url);
  for (const fn of waiters.get(url) ?? []) fn(b);
  waiters.delete(url);
}

function decode(url: string, ac: AudioContext): void {
  const raw = bytes.get(url);
  if (!raw) return;
  bytes.delete(url);
  // 사파리 옛 버전은 프로미스를 안 돌려주므로 콜백도 함께 준다
  let done = false;
  const ok = (b: AudioBuffer) => {
    if (done) return;
    done = true;
    settle(url, b);
  };
  const fail = () => {
    if (done) return;
    done = true;
    settle(url, null);
  };
  try {
    const p = ac.decodeAudioData(raw, ok, fail) as Promise<AudioBuffer> | undefined;
    p?.then(ok, fail);
  } catch {
    fail();
  }
}

/** 파일을 미리 받아 둔다 (여러 번 불러도 한 번만 받는다). 컨텍스트가 이미 있으면 바로 디코딩 */
export function preloadSound(url: string): Promise<AudioBuffer | null> {
  const known = buffers.get(url);
  if (known) return Promise.resolve(known);
  if (missing.has(url)) return Promise.resolve(null);
  let p = loading.get(url);
  if (p) return p;
  p = new Promise<AudioBuffer | null>((resolve) => {
    const list = waiters.get(url) ?? [];
    list.push(resolve);
    waiters.set(url, list);
  });
  loading.set(url, p);
  if (typeof fetch === "undefined") {
    settle(url, null);
    return p;
  }
  fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((raw) => {
      bytes.set(url, raw);
      const ac = peekSharedAudioContext();
      if (ac) decode(url, ac);
    })
    .catch(() => settle(url, null));
  return p;
}

/** 디코딩이 끝난 버퍼 (아직이면 null) */
export function soundBuffer(url: string): AudioBuffer | null {
  return buffers.get(url) ?? null;
}

/** 파일이 없거나 깨졌는지 */
export function soundMissing(url: string): boolean {
  return missing.has(url);
}

export type OneShot = {
  /** 0..1 이상도 된다 (출력 노드에서 다시 줄인다) */
  gain?: number;
  /** 재생 속도 (작으면 낮고 묵직한 소리) — <audio>의 preservesPitch=false와 같은 효과 */
  rate?: number;
  /** 소리가 끝나면 (또는 시작하지 못하면 부르지 않는다) */
  onEnded?: () => void;
};

/**
 * 디코딩해 둔 효과음 한 번. out: 연결할 노드(호스트 출력·destination).
 * 버퍼가 아직 없으면 false (받는 중이면 다음부터 난다)
 */
export function playBuffer(ac: AudioContext, out: AudioNode, url: string, opts: OneShot = {}): boolean {
  const buf = buffers.get(url);
  if (!buf) {
    void preloadSound(url);
    return false;
  }
  // 멈춘 컨텍스트에 걸어 두면 깨어날 때 밀린 소리가 한꺼번에 난다 → 건너뛴다
  if (ac.state !== "running") return false;
  try {
    const src = ac.createBufferSource();
    src.buffer = buf;
    const rate = opts.rate ?? 1;
    if (rate !== 1) src.playbackRate.value = Math.max(0.5, Math.min(2, rate));
    const g = ac.createGain();
    g.gain.value = Math.max(0, opts.gain ?? 1);
    src.connect(g).connect(out);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      opts.onEnded?.();
    };
    src.start();
    return true;
  } catch {
    return false;
  }
}

/**
 * 합성음 정리: 소스(마지막으로 끝나는 것)가 끝나면 함께 만든 게인·필터를 그래프에서 뗀다.
 * 공용 컨텍스트는 닫지 않으므로, 떼지 않은 노드는 소리가 끝난 뒤에도 출력에 붙은 채 남아 오디오 스레드가 점점 무거워진다
 */
export function releaseOnEnd(last: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  last.addEventListener(
    "ended",
    () => {
      for (const n of [last, ...nodes]) {
        try {
          n.disconnect();
        } catch {
          // 이미 뗐다
        }
      }
    },
    { once: true },
  );
}
