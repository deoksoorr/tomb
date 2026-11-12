import { describe, expect, it } from "vitest";
import { peerAt, type PeerHitTarget } from "./peerHit";

const p = (sid: number, x: number, y: number, extra: Partial<PeerHitTarget> = {}): PeerHitTarget => ({ sid, name: `p${sid}`, x, y, visible: true, ...extra });

describe("47번 다른 사람 캐릭터 누르기", () => {
  it("몸 상자 안이면 그 사람, 밖이면 null", () => {
    const peers = [p(1, 100, 100)];
    expect(peerAt(peers, 100, 90)?.sid).toBe(1);
    expect(peerAt(peers, 108, 74)?.sid).toBe(1);
    expect(peerAt(peers, 111, 90)).toBeNull();
    expect(peerAt(peers, 100, 110)).toBeNull();
  });

  it("이름표를 눌러도 된다. 안 보이는 사람은 빼고, 겹치면 가까운 사람", () => {
    const label = { x: 80, y: 60, width: 40, height: 8 };
    expect(peerAt([p(1, 100, 100, { label })], 85, 64)?.sid).toBe(1);
    expect(peerAt([p(1, 100, 100, { visible: false })], 100, 90)).toBeNull();
    expect(peerAt([p(1, 100, 100), p(2, 104, 100)], 103, 90)?.sid).toBe(2);
  });
});
