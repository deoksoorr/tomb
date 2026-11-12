// 47번: 화면을 눌렀을 때 다른 사람 캐릭터(몸 또는 이름표)를 맞혔는지. 순수 함수라 Phaser 없이 테스트한다.

/** 발밑 기준 몸 판정 상자 (월드 픽셀). 아바타 그림은 폭 약 16, 키 약 24 */
export const PEER_HIT = { halfW: 9, top: 28, bottom: 3 } as const;

export type PeerHitTarget = {
  sid: number;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  /** 이름표 사각형 (월드 좌표, 없으면 몸만) */
  label?: { x: number; y: number; width: number; height: number } | null;
};

/** 누른 곳에 걸리는 사람 중 발밑이 가장 가까운 사람 (안 보이는 사람은 뺀다). 없으면 null */
export function peerAt<T extends PeerHitTarget>(peers: Iterable<T>, wx: number, wy: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const p of peers) {
    if (!p.visible) continue;
    const body = Math.abs(wx - p.x) <= PEER_HIT.halfW && wy >= p.y - PEER_HIT.top && wy <= p.y + PEER_HIT.bottom;
    const l = p.label;
    const onLabel = !!l && l.width > 0 && wx >= l.x && wx <= l.x + l.width && wy >= l.y && wy <= l.y + l.height;
    if (!body && !onLabel) continue;
    const d = Math.hypot(wx - p.x, wy - (p.y - 12));
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
