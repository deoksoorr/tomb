import {
  CHAT_RECENT_MAX,
  CHAT_RECENT_MS,
  type ChatLogLine,
} from "@tomb/protocol";

// 방(월드 채널·집·사냥터 DO 하나)별 최근 채팅 링버퍼. DO 메모리에만 둔다 — 디스크·스토리지에 쓰지 않고, DO가 잠들면 사라져도 된다.
// 늦게 들어온 사람(처음 입장·재접속·실내에서 복귀)에게 최근 1분을 보내 주는 데만 쓴다.

/** 버퍼 한 줄. visitorId는 "내 줄" 표시에만 쓰고 밖으로 내보내지 않는다 */
export type RecentChat = {
  id: string;
  at: number;
  sid: number;
  visitorId: string;
  name: string;
  text: string;
  /** 운영자(대장)가 쓴 줄 */
  staff?: true;
};

export class ChatRecent {
  private readonly buf: RecentChat[] = [];
  private seq = 0;
  /** 줄 id 앞부분: DO가 다시 떠도 이전 id와 겹치지 않게 (클라이언트는 id로 중복을 거른다). 첫 줄 때 정한다 */
  private boot = "";

  constructor(
    private readonly random: () => number = Math.random,
    private readonly ttlMs = CHAT_RECENT_MS,
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
      ...(visitorId !== undefined && l.visitorId === visitorId
        ? { mine: true as const }
        : {}),
    }));
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
