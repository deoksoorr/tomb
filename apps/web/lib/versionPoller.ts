import { CLIENT_VERSION } from "@tomb/protocol";
import { CHECK_MIN_GAP_MS, nextCheckDelay, versionLevel, type UpdateLevel, type VersionInfo } from "./update";

// 새 버전 확인 일정 (React·DOM 없이 테스트한다. 연결은 lib/hooks/useNewVersion.ts).
//  - 보이는 탭: CHECK_VISIBLE_MS마다 /api/version
//  - 숨은 탭: 묻지 않는다. 다시 보이면(visibilitychange·focus·pageshow) 바로 한 번 (CHECK_MIN_GAP_MS 안에 또 보이면 건너뜀)
//  - 실시간 서버가 4010(옛 버전)으로 거절: 바로 한 번 보고, 새 배포가 보일 때까지 CHECK_WAITING_MS마다
//    (예전에는 거절 전에 걸어 둔 2분 타이머가 그대로 남아 "준비 중" 창이 최대 2분 머물렀다)
//  - 단계는 내려가지 않는다 (한 번 새 버전을 봤으면 새로고침 전까지 안내를 유지)

export type VersionStatus = {
  level: UpdateLevel;
  /** 새로고침하면 실제로 새 빌드를 받는지 (실시간 서버만 먼저 바뀌었으면 false) */
  deployReady: boolean;
};

export type PollerDeps = {
  fetchVersion: () => Promise<VersionInfo>;
  isHidden: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  /** 빌드 때 박은 배포 id. 없으면 처음 받은 응답을 기준으로 삼는다 */
  baseline: string | null;
  myClient?: number;
  onChange: (s: VersionStatus) => void;
};

const RANK: Record<UpdateLevel, number> = { none: 0, patch: 1, required: 2 };

export class VersionPoller {
  private status: VersionStatus = { level: "none", deployReady: false };
  private base: string | null;
  private rejected = false;
  private timer: unknown = null;
  private inFlight = false;
  private stopped = false;
  private lastCheckAt = -Infinity;

  constructor(private readonly d: PollerDeps) {
    this.base = d.baseline;
  }

  get current(): VersionStatus {
    return this.status;
  }

  start(): void {
    void this.check();
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  /** 탭이 보이게 됨 / 창 포커스 / bfcache 복원 */
  onVisible(): void {
    if (this.stopped || this.d.isHidden()) return;
    if (this.d.now() - this.lastCheckAt < CHECK_MIN_GAP_MS) {
      // 방금 봤다: 숨어 있던 동안 꺼 둔 타이머만 다시 건다
      if (this.timer === null) this.schedule();
      return;
    }
    void this.check();
  }

  /** 탭이 숨음: 타이머를 끈다 (보일 때 onVisible이 다시 본다) */
  onHidden(): void {
    this.clear();
  }

  /** 실시간 서버가 이 화면을 옛 버전이라 거절함(4010): 바로 큰 패치 단계, 새 배포가 보이는지 바로·자주 본다 */
  markRejected(): void {
    if (this.rejected || this.stopped) return;
    this.rejected = true;
    this.merge({ level: "required", deployReady: false });
    void this.check(true);
  }

  private async check(force = false): Promise<void> {
    if (this.stopped) return;
    if (this.inFlight) {
      // 진행 중인 확인이 끝나면 새 조건(거절 등)으로 다시 일정을 잡는다
      return;
    }
    if (!force && this.d.isHidden()) {
      this.clear();
      return;
    }
    this.inFlight = true;
    this.clear();
    this.lastCheckAt = this.d.now();
    try {
      const info = await this.d.fetchVersion();
      if (this.stopped) return;
      if (!this.base) this.base = info.version;
      this.merge(versionLevel(this.base, info, this.d.myClient ?? CLIENT_VERSION));
    } catch {
      // 확인 실패는 다음 주기에
    } finally {
      this.inFlight = false;
    }
    this.schedule();
  }

  private merge(next: VersionStatus): void {
    const prev = this.status;
    const level = RANK[next.level] > RANK[prev.level] ? next.level : prev.level;
    const deployReady = prev.deployReady || next.deployReady;
    if (level === prev.level && deployReady === prev.deployReady) return;
    this.status = { level, deployReady };
    this.d.onChange(this.status);
  }

  private schedule(): void {
    this.clear();
    if (this.stopped) return;
    const waiting = (this.rejected || this.status.level === "required") && !this.status.deployReady;
    const ms = nextCheckDelay({ hidden: this.d.isHidden(), waiting });
    if (ms !== null) this.timer = this.d.setTimer(() => void this.check(), ms);
  }

  private clear(): void {
    if (this.timer !== null) this.d.clearTimer(this.timer);
    this.timer = null;
  }
}
