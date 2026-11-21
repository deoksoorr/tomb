import { BugsScene } from "./BugsScene";
import { HuntScene } from "./HuntScene";
import { RpgHostScene } from "./RpgHostScene";
import { StarsScene } from "./StarsScene";
// 11/20 회장님 독대 진입·결과 (보이지 않는 씬 — 싸움은 HuntScene이 play.chairman으로)
import { ChairmanHostScene } from "../chairman/ChairmanHostScene";

/** createGame의 scene 목록에 펼쳐 넣는다 (호스트는 게임이 뜰 때 바로 켜진다) */
export const RPG_SCENES = [RpgHostScene, HuntScene, BugsScene, StarsScene, ChairmanHostScene];
