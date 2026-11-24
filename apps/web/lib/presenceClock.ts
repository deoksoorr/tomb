/** 11/24 마지막 머무르기 응답(또는 게임 입장) 시각 — 오늘 미션 머무르기 줄이 그 뒤 지난 분을 더해 보인다 (lib/playGauge stayLive) */
let at = Date.now();
export const markPresence = (t = Date.now()): void => {
  at = t;
};
export const presenceAt = (): number => at;
