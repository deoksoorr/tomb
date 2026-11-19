// 11/19 촬영 모드에서 이름표를 껐는지 (아바타가 말풍선·상태 아이콘을 이름표 대신 머리 바로 위에 놓는다).
// PhotoController(촬영 모드에 들어갈 때만 읽는 덩어리)가 바꾸고, AvatarView는 프레임마다 읽기만 한다 — 평소엔 늘 false

let namesHidden = false;

export const photoNamesHidden = (): boolean => namesHidden;

export function setPhotoNamesHidden(v: boolean): void {
  namesHidden = v;
}
