import { SNOWMAN_GAP, SNOWMAN_PER_CHANNEL, SNOWMAN_PER_PERSON, campSnowSpotOk, parseSnowmanInfo, snowmanAlive, type SnowmanDenyWhy, type SnowmanInfo } from "@tomb/protocol";

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
