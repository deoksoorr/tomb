import { CAMP_FIRE_USE_RE, campLotByNo } from "@tomb/protocol";

// 11/26 캠핑장 촌캉스 아궁이 불 (월드 채널 use "ag{터}") — 서버 판정·늦게 온 사람용 기억.
//  - 실시간 서버는 집 주인을 모른다 → 그 촌캉스 마당(터 사각형 + CAMP_FIRE_NEAR_PAD) 안에 서 있는 사람만 켜고 끌 수 있다
//    (화면의 아궁이 버튼은 아궁이 18px 안에서만 뜨고, 아궁이는 마당 안에 있다. 서버 위치는 따라가는 중이라 조금 늦을 수 있어 여유를 둔다)
//  - 사람마다 CAMP_FIRE_INTERVAL_MS에 한 번 (도배 방지)
//  - 채널이 터마다 마지막 상태를 CAMP_FIRE_KEEP_MS 동안 기억해, 캠핑장에 새로 들어온 사람에게 보낸다 (저장 없음 — DO가 쉬면 사라진다.
//    화면은 밤낮이 바뀌면 기본(밤 켜짐·낮 꺼짐)으로 돌아가므로 오래된 상태는 보내지 않는다)

export const CAMP_FIRE_INTERVAL_MS = 1_000;
export const CAMP_FIRE_NEAR_PAD = 40;
export const CAMP_FIRE_KEEP_MS = 15 * 60_000;

/** 그 자리(x, y)에서 이 아궁이 알림(u)을 보낼 수 있으면 터 번호, 아니면 null (촌캉스 터가 아니거나 마당 밖) */
export function campFireLotFor(u: string, x: number, y: number): number | null {
  const m = CAMP_FIRE_USE_RE.exec(u);
  const l = m ? campLotByNo(Number(m[1])) : undefined;
  if (!l || l.kind !== "rural") return null;
  const pad = CAMP_FIRE_NEAR_PAD;
  const inside = x >= l.x - pad && x <= l.x + l.w + pad && y >= l.y - pad && y <= l.y + l.h + pad;
  return inside ? l.lot : null;
}

/** 채널 하나의 아궁이 불 기억 (터 → 켜짐·바꾼 시각) */
export class CampFires {
  private readonly fires = new Map<number, { on: boolean; at: number }>();

  set(lot: number, on: boolean, now: number): void {
    this.fires.set(lot, { on, at: now });
  }

  /** 아직 기억하는 상태 [터, 켜짐] (오래된 것은 지운다) */
  fresh(now: number): [number, boolean][] {
    const out: [number, boolean][] = [];
    for (const [lot, f] of this.fires) {
      if (now - f.at > CAMP_FIRE_KEEP_MS) this.fires.delete(lot);
      else out.push([lot, f.on]);
    }
    return out;
  }
}
