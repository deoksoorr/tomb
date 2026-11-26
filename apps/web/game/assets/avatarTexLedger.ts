// 11/22 아바타 시트 정리: 꾸미기·색을 바꿀 때마다 새 시트(560×112, 캔버스 약 250KB + GPU 같은 양)를 만들고 옛 것을 지우지 않아
// 색 칸을 이리저리 바꾸거나 남들이 갈아입으면 폰 메모리에 계속 쌓였다.
// 이제 시트 키마다 쓰는 AvatarView 수를 센다(hold/release). 아무도 안 쓰는 시트는 바로 지우지 않고 잠깐 남겨 두었다가
// (다시 입거나 같은 사람이 다시 보이면 그대로 쓴다 — 다시 굽는 CPU를 아낀다) 다음 경우에 지운다:
//  - 안 쓰는 시트가 IDLE_KEEP개를 넘으면 오래된 것부터 (최소 GRACE_MS는 지난 것만 — 같은 프레임·잔상이 쓰는 동안 지우지 않게)
//  - 안 쓴 지 IDLE_MAX_MS가 지나면
// 지우기 직전에 모든 장면의 화면 목록(컨테이너 안까지)을 훑어 그 시트나 거기서 만든 그림(해먹·집 안 자세·특수 색 가면)을
// 아직 쓰는 그림이 있으면 미룬다 (잔상·바다 보기 앉은 사람·하늘 탈것 자리처럼 키를 빌려 쓰는 그림). 텍스처 매니저는 게임마다 하나라 원장도 게임마다.

/** 원장이 다루는 텍스처 매니저·애니메이션·장면 (Phaser 없이 시험할 수 있게 필요한 것만) */
export type TexHost = {
  textures: { exists(key: string): boolean; remove(key: string): unknown; getTextureKeys(): string[] };
  anims: { keys(): string[]; remove(key: string): unknown };
  /** 모든 장면의 화면 목록 (자고 있는 장면 포함) */
  displayLists(): readonly (readonly unknown[])[];
  /** 게임이 끝났으면 false (타이머가 남아도 아무것도 하지 않는다) */
  alive(): boolean;
};

/** 안 쓰게 된 뒤 이만큼은 지우지 않는다 (잔상·한 프레임 늦은 그림) */
export const GRACE_MS = 1_500;
/** 안 쓰는 시트를 남겨 두는 수 (넘으면 오래된 것부터) */
export const IDLE_KEEP = 12;
/** 안 쓴 지 이만큼 지나면 남겨 둔 것도 지운다 */
export const IDLE_MAX_MS = 60_000;
/** 쓰는 그림이 있어 미룬 시트를 다시 볼 때까지 (최대) */
const RETRY_MAX_MS = 30_000;

/** 아바타 시트에서 만든 그림 키의 끝 (sprites/hammockArt hammockLieKey · sprites/indoorPose indoorPoseKey · entities/DyeFxView 가면) */
// 11/26 캠핑장 침대 덮개 "-lie-cvbed0"…"-lie-pnbed3" (침대·방향마다 — housing/campFurnitureArt CampBedCover)
const CAMP_BED_SUFFIXES = (["cv", "pn"] as const).flatMap((k) => [0, 1, 2, 3].map((d) => `-lie-${k}bed${d}`));
const POSE_SUFFIXES = ["-hammock-sea", "-hammock-campSun", "-hammock-campMint", "-hammock", "-lie-towel", ...CAMP_BED_SUFFIXES, "-lie", "-read", "-bath"] as const;
const MASK_MARK = "#dye-";

/** 시트에서 만든 그림 키 → 그 시트 키 (아니면 null) */
export function derivedBase(key: string): string | null {
  const i = key.indexOf(MASK_MARK);
  if (i > 0) return key.slice(0, i);
  for (const s of POSE_SUFFIXES) if (key.endsWith(s) && key.length > s.length) return key.slice(0, -s.length);
  return null;
}

type Idle = { since: number; retryAt: number; tries: number };

export class AvatarTexLedger {
  private readonly refs = new Map<string, number>();
  /** 아무도 안 쓰는 시트 → 안 쓰게 된 때 (넣은 순서 = 오래된 순서) */
  private readonly idle = new Map<string, Idle>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 걸어 둔 타이머가 도는 시각 (더 이른 차례가 생기면 다시 건다) */
  private timerAt = Infinity;
  private readonly listeners = new Set<(key: string) => void>();
  /** 지운 텍스처 수 (시험·측정) */
  removed = 0;

  constructor(
    private readonly host: TexHost,
    private readonly now: () => number = () => Date.now(),
    private readonly later: (fn: () => void, ms: number) => ReturnType<typeof setTimeout> = (fn, ms) => setTimeout(fn, ms),
    private readonly cancel: (t: ReturnType<typeof setTimeout>) => void = (t) => clearTimeout(t),
  ) {}

  /** 지운 텍스처 키마다 (시트·만든 그림 모두) — 키로 기억해 둔 값을 같이 버리게 */
  onRemoved(fn: (key: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  hold(key: string): void {
    this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
    this.idle.delete(key);
  }

  release(key: string): void {
    const n = this.refs.get(key);
    if (!n) return;
    if (n > 1) {
      this.refs.set(key, n - 1);
      return;
    }
    this.refs.delete(key);
    const t = this.now();
    this.idle.delete(key);
    this.idle.set(key, { since: t, retryAt: t + GRACE_MS, tries: 0 });
    this.schedule(GRACE_MS);
  }

  /** 지금 쓰는 시트 수 · 안 쓰고 남겨 둔 시트 수 (측정) */
  stats(): { held: number; idle: number; removed: number } {
    return { held: this.refs.size, idle: this.idle.size, removed: this.removed };
  }

  private schedule(ms: number): void {
    const at = this.now() + ms;
    // 이미 그보다 일찍 돌 타이머가 있으면 그대로 (1분 뒤로 걸어 둔 타이머 때문에 넘친 시트를 늦게 지우지 않게 — 더 이르면 다시 건다)
    if (this.timer && this.timerAt <= at) return;
    if (this.timer) this.cancel(this.timer);
    this.timerAt = at;
    this.timer = this.later(() => {
      this.timer = null;
      this.timerAt = Infinity;
      this.sweep();
    }, ms);
  }

  /** 지울 차례인 시트를 정리한다 (타이머가 부른다. 시험은 직접) */
  sweep(): void {
    if (!this.host.alive()) {
      this.idle.clear();
      return;
    }
    const t = this.now();
    const over = Math.max(0, this.idle.size - IDLE_KEEP);
    const due: string[] = [];
    let i = 0;
    for (const [key, e] of this.idle) {
      // 오래된 것부터 over개는 남겨 둘 수 없다, 그 밖은 오래 안 쓴 것만
      const want = i++ < over || t - e.since >= IDLE_MAX_MS;
      if (want && t >= e.retryAt) due.push(key);
    }
    if (due.length) this.removeUnused(due, t);
    this.reschedule(t);
  }

  private reschedule(t: number): void {
    if (!this.idle.size) return;
    let next = Infinity;
    const over = Math.max(0, this.idle.size - IDLE_KEEP);
    let i = 0;
    for (const e of this.idle.values()) {
      const at = i++ < over ? e.retryAt : Math.max(e.retryAt, e.since + IDLE_MAX_MS);
      next = Math.min(next, at);
    }
    this.schedule(Math.max(50, next - t));
  }

  private removeUnused(bases: readonly string[], t: number): void {
    const groups = new Map<string, string[]>(bases.map((b) => [b, [b]]));
    for (const k of this.host.textures.getTextureKeys()) {
      const b = derivedBase(k);
      if (b !== null && groups.has(b)) groups.get(b)!.push(k);
    }
    const want = new Set<string>();
    for (const ks of groups.values()) for (const k of ks) want.add(k);
    const used = this.inUse(want, groups);
    let anims: string[] | null = null;
    for (const [base, ks] of groups) {
      // 다시 잡혔거나(같은 키를 쓰는 AvatarView) 그림이 아직 쓰면 미룬다. 만든 그림 키가 다른 시트 키와 겹쳐도 잡힌 시트는 지우지 않는다
      if (ks.some((k) => used.has(k) || this.refs.has(k))) {
        const e = this.idle.get(base);
        if (e) {
          e.tries++;
          e.retryAt = t + Math.min(RETRY_MAX_MS, GRACE_MS * 2 ** e.tries);
        }
        continue;
      }
      this.idle.delete(base);
      for (const k of ks) {
        if (!this.host.textures.exists(k)) continue;
        this.host.textures.remove(k);
        this.removed++;
        for (const fn of this.listeners) fn(k);
      }
      anims ??= this.host.anims.keys();
      const p = `${base}:`;
      for (const a of anims) if (a.startsWith(p)) this.host.anims.remove(a);
    }
  }

  /**
   * 화면 목록(컨테이너·레이어 안까지)에서 want 중 쓰는 텍스처 키.
   * 11/26 그림은 다른 시트여도 그 시트 애니메이션("시트:…")이 도는 스프라이트가 있으면 시트 키도 쓰는 것으로 친다
   * — 지우면 Phaser(AnimationState.globalRemove)가 지운 프레임으로 되돌리다 터지고(sourceSize null) 스프라이트 텍스처가 null로 남는다
   */
  private inUse(want: ReadonlySet<string>, bases: ReadonlyMap<string, unknown>): Set<string> {
    const used = new Set<string>();
    const visit = (list: readonly unknown[]) => {
      for (const o of list) {
        const k = (o as { texture?: { key?: unknown } } | null)?.texture?.key;
        if (typeof k === "string" && want.has(k)) used.add(k);
        const a = (o as { anims?: { isPlaying?: unknown; currentAnim?: { key?: unknown } | null } } | null)?.anims;
        const ak = a?.isPlaying ? a.currentAnim?.key : undefined;
        // 지울 때와 같은 기준 ("시트:"로 시작하는 애니메이션)
        if (typeof ak === "string") for (const b of bases.keys()) if (ak.startsWith(`${b}:`)) used.add(b);
        const kids = (o as { list?: unknown } | null)?.list;
        if (Array.isArray(kids)) visit(kids);
      }
    };
    for (const l of this.host.displayLists()) visit(l);
    return used;
  }
}
