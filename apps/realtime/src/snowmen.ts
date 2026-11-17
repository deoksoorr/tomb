import {
  SNOWMAN_GAP,
  SNOWMAN_PER_CHANNEL,
  SNOWMAN_PER_PERSON,
  SNOW_STACKS_PER_CHANNEL,
  SNOW_STACKS_PER_PERSON,
  SNOWMAN_ID_RE,
  campSnowSpotOk,
  parseSnowmanInfo,
  snowGapWhy,
  snowSizesDone,
  snowSizesOk,
  snowStackAlive,
  snowmanAlive,
  type SnowBall,
  type SnowmanDenyWhy,
  type SnowmanInfo,
  type SnowStackInfo,
} from "@tomb/protocol";

// 11/17 캠핑장 눈사람 목록 (채널 하나). 메모리에 두고, 세울 때마다 DO 저장소(동기 KV)에도 적어 둔다 —
// 모두 멈추면 DO가 잠들어(hibernate) 메모리가 비기 때문 (깨어날 때 restore). 재배포로 사라져도 괜찮다 (보상 없는 놀이).
// 녹는 것은 시각으로 각자 계산하니, 여기서는 다 녹은 것을 만날 때마다(세우기·목록·복원) 조용히 지운다.

type Rec = SnowmanInfo & { visitorId: string };

export type SnowmanBuild = { ok: true; s: SnowmanInfo; gone: string[] } | { ok: false; why: SnowmanDenyWhy };

export class SnowmanYard {
  private list: Rec[] = [];
  private seq = 0;

  /** 다 녹은 것을 지운다 */
  private prune(now: number): void {
    if (this.list.some((s) => !snowmanAlive(s.at, now))) this.list = this.list.filter((s) => snowmanAlive(s.at, now));
  }

  /** 지금 서 있는 눈사람 (보낼 모양 — 방문자 id는 빼고) */
  all(now: number): SnowmanInfo[] {
    this.prune(now);
    return this.list.map(pub);
  }

  get size(): number {
    return this.list.length;
  }

  /** 서 있는 눈사람 자리와 세운 사람 (덩이 간격 판정용) */
  spots(now: number): { x: number; y: number; visitorId: string }[] {
    this.prune(now);
    return this.list.map((s) => ({ x: s.x, y: s.y, visitorId: s.visitorId }));
  }

  /** 저장할 모양 (세운 순서 그대로, 방문자 id 포함 — 한 사람 개수 제한에 쓴다) */
  snapshot(): (SnowmanInfo & { visitorId: string })[] {
    return this.list.map((r) => ({ ...r }));
  }

  /** 저장소에서 되살린다 (모양이 틀리거나 다 녹은 것은 버린다) */
  restore(raw: unknown, now: number): void {
    if (!Array.isArray(raw)) return;
    const out: Rec[] = [];
    for (const o of raw) {
      const s = parseSnowmanInfo(o);
      const v = (o as { visitorId?: unknown } | null)?.visitorId;
      if (s && typeof v === "string" && snowmanAlive(s.at, now)) out.push({ ...s, visitorId: v });
    }
    this.list = out.slice(-SNOWMAN_PER_CHANNEL);
  }

  /**
   * 세운다. 자리(캠핑장 눈밭·다른 눈사람과 간격)를 보고, 넘치면 그 사람 것 → 채널 전체 순으로 가장 오래된 것부터 녹인다 (gone).
   * seed = 모습 씨앗 (0..2^31)
   */
  build(visitorId: string, by: string, x: number, y: number, now: number, seed: number): SnowmanBuild {
    this.prune(now);
    if (!campSnowSpotOk(x, y)) return { ok: false, why: "spot" };
    if (this.list.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.4) < SNOWMAN_GAP)) return { ok: false, why: "spot" };
    const s: Rec = { id: `${now.toString(36).slice(-6)}${(++this.seq).toString(36)}`, x, y, seed: seed >>> 0, by, at: now, visitorId };
    this.list.push(s);
    const gone: string[] = [];
    const drop = (r: Rec) => {
      this.list = this.list.filter((o) => o !== r);
      gone.push(r.id);
    };
    // 목록은 세운 순서 그대로 → 앞쪽이 오래된 것
    for (let mine = this.list.filter((o) => o.visitorId === visitorId); mine.length > SNOWMAN_PER_PERSON; mine = mine.slice(1)) drop(mine[0]);
    while (this.list.length > SNOWMAN_PER_CHANNEL) drop(this.list[0]);
    return { ok: true, s: pub(s), gone };
  }
}

function pub(r: Rec): SnowmanInfo {
  return { id: r.id, x: r.x, y: r.y, seed: r.seed, by: r.by, at: r.at };
}

// ── 11/18 쌓는 중인 덩이 (만드는 과정도 같은 캠핑장에) ──
// 주인(방문자 id)·자리·쌓인 크기·마지막으로 손댄 시각. 눈사람과 같이 메모리 + DO 저장소(잠들었다 깨어날 때).
// 손대지 않은 지 SNOW_STACK_IDLE_MS가 지난 것·주인이 캠핑장에 없는 것은 만날 때 조용히 지운다 (웹도 시각으로 각자 숨긴다).

type StackRec = SnowStackInfo & { visitorId: string };

export type SnowStackResult = { ok: true; st: SnowStackInfo; gone: string[] } | { ok: false; why: SnowmanDenyWhy };

export class SnowStackYard {
  private list: StackRec[] = [];
  private seq = 0;

  /** 오래 손대지 않은 것·주인이 캠핑장에 없는 것을 지운다 (here = 그 방문자가 지금 캠핑장에 있나) */
  prune(now: number, here: (visitorId: string) => boolean): void {
    const ok = (s: StackRec) => snowStackAlive(s.at, now) && here(s.visitorId);
    if (this.list.some((s) => !ok(s))) this.list = this.list.filter(ok);
  }

  all(now: number, here: (visitorId: string) => boolean): SnowStackInfo[] {
    this.prune(now, here);
    return this.list.map(pubStack);
  }

  get size(): number {
    return this.list.length;
  }

  /** 그 id의 덩이가 (누구 것이든) 있나 */
  has(id: string): boolean {
    return this.list.some((s) => s.id === id);
  }

  /** 그 사람의 덩이 (내 것인지까지 본다). 없으면 null */
  mine(visitorId: string, id: string): SnowStackInfo | null {
    const r = this.list.find((s) => s.id === id && s.visitorId === visitorId);
    return r ? pubStack(r) : null;
  }

  /**
   * 새 덩이를 내려놓는다. 자리(캠핑장 눈밭)·간격(다른 사람 것 SNOW_STACK_GAP, 내 것 SNOWMAN_GAP)을 보고,
   * 채널이 가득이면 full, 내 것이 넘치면 가장 오래된 내 덩이를 지운다 (gone). men = 서 있는 눈사람
   */
  put(visitorId: string, sid: number, x: number, y: number, s: SnowBall, now: number, men: { x: number; y: number; visitorId: string }[]): SnowStackResult {
    if (!campSnowSpotOk(x, y)) return { ok: false, why: "spot" };
    const all = [...men, ...this.list];
    const why = snowGapWhy(
      x,
      y,
      all.filter((o) => o.visitorId === visitorId),
      all.filter((o) => o.visitorId !== visitorId),
    );
    if (why) return { ok: false, why };
    // 목록은 놓은 순서 그대로 → 앞쪽이 오래된 것. 채널이 가득이면 내 것을 지우기 전에 거절한다
    const mine = this.list.filter((o) => o.visitorId === visitorId);
    const drop = mine.slice(0, Math.max(0, mine.length - SNOW_STACKS_PER_PERSON + 1));
    if (this.list.length - drop.length >= SNOW_STACKS_PER_CHANNEL) return { ok: false, why: "full" };
    if (drop.length) this.list = this.list.filter((o) => !drop.includes(o));
    const gone = drop.map((o) => o.id);
    const r: StackRec = { id: `k${now.toString(36).slice(-6)}${(++this.seq).toString(36)}`, sid, x, y, sizes: [s], at: now, visitorId };
    this.list.push(r);
    return { ok: true, st: pubStack(r), gone };
  }

  /** 내 덩이 위에 올린다 (더 작은 것만, 세 단까지). 세 단이 됐는지는 snowSizesDone으로 부른 쪽이 본다 */
  add(visitorId: string, id: string, s: SnowBall, now: number): SnowStackResult {
    const r = this.list.find((o) => o.id === id && o.visitorId === visitorId);
    if (!r) return { ok: false, why: "lost" };
    const next = [...r.sizes, s];
    if (!snowSizesOk(next)) return { ok: false, why: "spot" };
    r.sizes = next;
    r.at = now;
    return { ok: true, st: pubStack(r), gone: [] };
  }

  /** 맨 위를 다시 든다. 마지막 덩이였으면 st = null (덩이가 사라졌다) */
  take(visitorId: string, id: string, now: number): { ok: true; st: SnowStackInfo | null; s: SnowBall } | { ok: false; why: SnowmanDenyWhy } {
    const r = this.list.find((o) => o.id === id && o.visitorId === visitorId);
    if (!r) return { ok: false, why: "lost" };
    const s = r.sizes[r.sizes.length - 1];
    r.sizes = r.sizes.slice(0, -1);
    r.at = now;
    if (r.sizes.length === 0) {
      this.list = this.list.filter((o) => o !== r);
      return { ok: true, st: null, s };
    }
    return { ok: true, st: pubStack(r), s };
  }

  /** 지운다 (눈사람으로 바뀜) */
  remove(id: string): void {
    this.list = this.list.filter((o) => o.id !== id);
  }

  /** 그 사람의 덩이를 모두 지운다 (캠핑장을 떠남). 지운 것 */
  dropOwner(visitorId: string): SnowStackInfo[] {
    const out = this.list.filter((o) => o.visitorId === visitorId);
    if (out.length) this.list = this.list.filter((o) => o.visitorId !== visitorId);
    return out.map(pubStack);
  }

  /** 세 단이 다 쌓였나 */
  static done(st: SnowStackInfo): boolean {
    return snowSizesDone(st.sizes);
  }

  snapshot(): StackRec[] {
    return this.list.map((r) => ({ ...r, sizes: [...r.sizes] }));
  }

  /** 저장소에서 되살린다 (모양이 틀리거나 오래된 것은 버린다. 주인이 없는 것은 다음에 만날 때 지운다) */
  restore(raw: unknown, now: number): void {
    if (!Array.isArray(raw)) return;
    const out: StackRec[] = [];
    for (const o of raw) {
      if (!o || typeof o !== "object") continue;
      const m = o as Record<string, unknown>;
      if (typeof m.id !== "string" || !SNOWMAN_ID_RE.test(m.id) || typeof m.visitorId !== "string") continue;
      if (![m.sid, m.x, m.y, m.at].every((v) => typeof v === "number" && Number.isFinite(v)) || !Array.isArray(m.sizes) || !snowSizesOk(m.sizes)) continue;
      if (!snowStackAlive(m.at as number, now)) continue;
      out.push({ id: m.id, sid: m.sid as number, x: m.x as number, y: m.y as number, sizes: [...m.sizes], at: m.at as number, visitorId: m.visitorId });
    }
    this.list = out.slice(-SNOW_STACKS_PER_CHANNEL);
  }
}

function pubStack(r: StackRec): SnowStackInfo {
  return { id: r.id, sid: r.sid, x: r.x, y: r.y, sizes: [...r.sizes], at: r.at };
}
