import {
  CHAT_HISTORY_MS,
  CHAT_MAX,
  CHAT_RECENT_MAX,
  CHAT_STORE_MAX,
  isChatPlace,
  type ChatLogLine,
  type ChatPlace,
} from "@tomb/protocol";

// 방(월드 채널·집·사냥터)별 최근 채팅 링버퍼 (11/16 월드 채널은 마을·캠핑장이 한 버퍼 — 줄마다 맵 표시 m) (메모리 최대 CHAT_RECENT_MAX줄, CHAT_HISTORY_MS 지난 줄은 버린다).
// 늦게 들어온 사람(처음 입장·재접속·실내에서 복귀·맵 이동)에게 보내 주는 데만 쓴다.
// 월드 채널은 DO가 snapshot()(최근 CHAT_STORE_MAX줄)을 저장소에 모아 쓰고, 깨어나면 restore()로 되살린다.

/** 버퍼 한 줄. visitorId는 "내 줄" 표시에만 쓰고 밖으로 내보내지 않는다 */
export type RecentChat = {
  id: string;
  at: number;
  sid: number;
  visitorId: string;
  name: string;
  text: string;
  /** 운영자가 쓴 줄 */
  staff?: true;
  /** 11/16 매니저가 쓴 줄 */
  mgr?: true;
  /** 11/16 쓴 사람이 있던 맵 (캠핑장 "camp"·바닷가 "sea", 마을이면 없음). 11/17 사냥 중에 쓴 줄은 "hunt" */
  m?: ChatPlace;
};

export class ChatRecent {
  private readonly buf: RecentChat[] = [];
  private seq = 0;
  /** 줄 id 앞부분: DO가 다시 떠도 이전 id와 겹치지 않게 (클라이언트는 id로 중복을 거른다). 첫 줄 때 정한다 */
  private boot = "";

  constructor(
    private readonly random: () => number = Math.random,
    private readonly ttlMs = CHAT_HISTORY_MS,
    private readonly max = CHAT_RECENT_MAX,
  ) {}

  /** 새 줄을 넣고 그 줄을 돌려준다 (id·at은 여기서 붙인다). 지난 줄·넘치는 줄은 버린다 */
  push(line: Omit<RecentChat, "id" | "at">, now: number): RecentChat {
    this.boot ||= Math.floor(this.random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0");
    const rec: RecentChat = {
      ...line,
      id: `${this.boot}.${(++this.seq).toString(36)}`,
      at: now,
    };
    this.prune(now);
    this.buf.push(rec);
    if (this.buf.length > this.max)
      this.buf.splice(0, this.buf.length - this.max);
    return rec;
  }

  /** 아직 ttl이 안 지난 줄 (오래된 순). visitorId가 같은 줄은 mine 표시 */
  recent(now: number, visitorId?: string): ChatLogLine[] {
    this.prune(now);
    return this.buf.map((l) => ({
      id: l.id,
      at: l.at,
      name: l.name,
      text: l.text,
      ...(l.staff ? { staff: true as const } : {}),
      ...(l.mgr ? { mgr: true as const } : {}),
      ...(isChatPlace(l.m) ? { m: l.m } : {}),
      ...(visitorId !== undefined && l.visitorId === visitorId
        ? { mine: true as const }
        : {}),
    }));
  }

  /** 저장할 최근 n줄 (visitorId 포함 — 저장소 안에서만 쓴다). 지난 줄은 먼저 버린다 */
  snapshot(now: number, n = CHAT_STORE_MAX): RecentChat[] {
    this.prune(now);
    return this.buf.slice(-n).map((l) => ({ ...l }));
  }

  /**
   * 저장소에서 읽은 줄로 되살린다 (깨어난 직후, 아직 새 줄이 없을 때). 형식이 이상한 줄·지난 줄은 버리고 시각 순으로 둔다.
   * 지금 버퍼에 있는 줄과 id가 같으면 건너뛴다. 되살린 줄 수
   */
  restore(raw: unknown, now: number, map?: "camp"): number {
    if (!Array.isArray(raw)) return 0;
    const have = new Set(this.buf.map((l) => l.id));
    let n = 0;
    for (const v of raw.slice(-this.max)) {
      const l = readStored(v);
      if (!l || have.has(l.id) || now - l.at >= this.ttlMs) continue;
      // 11/16 맵별로 따로 남기던 옛 캠핑장 기록: 줄에 맵 표시가 없으니 붙여 준다
      if (map === "camp") l.m = "camp";
      have.add(l.id);
      this.buf.push(l);
      n++;
    }
    this.buf.sort((a, b) => a.at - b.at);
    if (this.buf.length > this.max) this.buf.splice(0, this.buf.length - this.max);
    return n;
  }

  /** 그 사람의 줄을 모두 지운다 (강퇴·이용 제한). 지운 줄이 있으면 true */
  purge(visitorId: string): boolean {
    const before = this.buf.length;
    for (let i = this.buf.length - 1; i >= 0; i--) if (this.buf[i].visitorId === visitorId) this.buf.splice(i, 1);
    return this.buf.length !== before;
  }

  get size(): number {
    return this.buf.length;
  }

  private prune(now: number): void {
    let i = 0;
    while (i < this.buf.length && now - this.buf[i].at >= this.ttlMs) i++;
    if (i) this.buf.splice(0, i);
  }
}

/** 저장소 한 줄 검증 (옛·깨진 값은 버린다) */
function readStored(v: unknown): RecentChat | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  if (typeof l.id !== "string" || !l.id || l.id.length > 64) return null;
  if (typeof l.at !== "number" || !Number.isFinite(l.at) || typeof l.sid !== "number") return null;
  if (typeof l.visitorId !== "string" || typeof l.name !== "string" || typeof l.text !== "string" || !l.text) return null;
  return {
    id: l.id,
    at: l.at,
    sid: l.sid,
    visitorId: l.visitorId,
    name: l.name.slice(0, 40),
    text: l.text.slice(0, CHAT_MAX * 2),
    ...(l.staff === true ? { staff: true as const } : {}),
    ...(l.mgr === true ? { mgr: true as const } : {}),
    ...(isChatPlace(l.m) ? { m: l.m } : {}),
  };
}
