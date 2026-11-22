// 11/22 새싹 표시: 총 접속 시간이 3시간이 안 된 새 이웃은 머리 위 이름표·채팅 이름 앞에 작은 새싹 (운영자·매니저 빼고).
// 누가 새싹인지는 Vercel이 계정 기록(stayMin·createdAt)으로 정해 입장 토큰에 "남은 분"(nb)으로 싣는다.
// 실시간 서버는 들어온 시각 + 남은 분 = 끝나는 시각(epoch ms)을 접속자 정보(PeerInfo.nb)에 싣고,
// 화면은 그 시각까지만 그린다 → 접속해 있는 동안 3시간이 차면 따로 알리지 않아도 저절로 사라진다.

/** 새싹으로 보이는 총 접속 시간 (분) */
export const SPROUT_MINUTES = 180;

/** 입장 토큰의 남은 분 (1 ~ SPROUT_MINUTES 정수) */
export function isSproutLeft(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= SPROUT_MINUTES;
}

/** 접속자 정보의 끝나는 시각 (epoch ms, 양의 정수) */
export function isSproutUntil(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** 지금 새싹으로 보이는지 (끝나는 시각 전이면) */
export function sproutOn(until: number | undefined, now: number): boolean {
  return typeof until === "number" && until > now;
}
