import { BugsScene } from "./BugsScene";
import { HuntScene } from "./HuntScene";
import { RpgHostScene } from "./RpgHostScene";
import { StarsScene } from "./StarsScene";

/** createGame의 scene 목록에 펼쳐 넣는다 (호스트는 게임이 뜰 때 바로 켜진다) */
export const RPG_SCENES = [RpgHostScene, HuntScene, BugsScene, StarsScene];
