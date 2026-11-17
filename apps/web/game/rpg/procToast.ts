import type { ProcInfo } from "@/lib/rpg/procs";
import { bridge } from "../bridge";

// 11/17 「발동」 표시를 부르는 단 하나의 길 — 카드(CardRun)·세트 장비·부활(HuntScene) 모두 여기로.
// 화면(components/rpg/ProcToasts)이 rpg:proc을 받아 카드 그림을 오른쪽(폰은 위 가운데)에 2초 띄운다. 무엇을 적을지는 lib/rpg/procs

let seq = 0;

export function showProc(p: ProcInfo): void {
  bridge.emit("rpg:proc", { ...p, seq: ++seq });
}
