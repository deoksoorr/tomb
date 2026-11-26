// 인스턴스 메모리 짧은 기억 (Redis 명령 아끼기 — lib/redisUsage). 키마다 ttlMs 동안 같은 값을 돌려준다.
//  - 같은 키를 동시에 부르면 읽기는 한 번만 (나머지는 그 결과를 기다린다)
//  - 읽기가 실패하면 기억하지 않는다 (다음 부름이 다시 읽는다)
//  - 키가 max를 넘으면 오래된 것부터 버린다 (인스턴스가 오래 살아도 끝없이 쌓이지 않게)

type Slot<V> = { at: number; v: V } | { at: number; p: Promise<V> };

export class TtlMemo<V> {
  private slots = new Map<string, Slot<V>>();

  constructor(
    readonly ttlMs: number,
    private readonly max = 500,
  ) {}

  async get(key: string, load: () => Promise<V>, now = Date.now()): Promise<V> {
    const s = this.slots.get(key);
    if (s && now - s.at < this.ttlMs) return "v" in s ? s.v : s.p;
    const p = load();
    this.slots.set(key, { at: now, p });
    this.trim();
    try {
      const v = await p;
      // 그사이 다른 부름이 새로 채웠으면 그대로 둔다
      if (this.slots.get(key)?.at === now) this.slots.set(key, { at: now, v });
      return v;
    } catch (e) {
      if (this.slots.get(key)?.at === now) this.slots.delete(key);
      throw e;
    }
  }

  /** 지금 기억(또는 읽는 중)이 있는지 — 읽지 않는다 */
  has(key: string, now = Date.now()): boolean {
    const s = this.slots.get(key);
    return !!s && now - s.at < this.ttlMs;
  }
  /** 기억을 버린다 (key가 없으면 전부) */
  clear(key?: string): void {
    if (key === undefined) this.slots.clear();
    else this.slots.delete(key);
  }

  get size(): number {
    return this.slots.size;
  }

  private trim() {
    while (this.slots.size > this.max) {
      const first = this.slots.keys().next().value;
      if (first === undefined) break;
      this.slots.delete(first);
    }
  }
}
