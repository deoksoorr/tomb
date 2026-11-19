import { bridge } from "../bridge";

// 11/19 폰 [상호작용] 단추 이름: 문 앞이면 「들어가기」·「나가기」 (잡화점·집·분양 마을·월드 잡화점 문 — logic/doorExit와 같은 판정).
// 장면은 매 프레임 setDoorHint를 부르고, 값이 바뀔 때만 door:near를 보낸다. 장면이 바뀌면 지운다 (다음 장면이 다시 알린다)

export type DoorHint = "들어가기" | "나가기";

let last: DoorHint | null = null;

export function setDoorHint(v: DoorHint | null): void {
  if (v === last) return;
  last = v;
  bridge.emit("door:near", v);
}

bridge.on("scene:changed", () => setDoorHint(null));
