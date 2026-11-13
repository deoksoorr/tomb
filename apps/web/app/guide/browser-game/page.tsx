import { pageMetadata } from "../../seo";
import GuidePage from "../GuidePage";
import { DEFAULT_CHANNEL_CAPACITY, DEFAULT_MAX_CHANNELS } from "@tomb/protocol";

const PATH = "/guide/browser-game";
const H1 = "설치 없이 하는 브라우저 도트 멀티 게임";
const TITLE = "설치 없이 하는 브라우저 도트 멀티 게임 — 가입 없는 무료 실시간 마을 | 한때는...";
const DESCRIPTION =
  "설치도 회원가입도 없이 브라우저에서 바로 하는 무료 실시간 멀티 도트 게임, 한때는...입니다. 채널마다 최대 40명과 함께 사냥터·미니게임, 낚시, 집 꾸미기, 묘비 세우기를 즐겨요. 키보드와 휴대폰 터치 모두 돼요.";

export const metadata = pageMetadata(PATH, TITLE, DESCRIPTION);

// 출처: 이용약관(무료 웹 서비스)·개인정보처리방침(회원가입 없음), components/overlay/GuideDialog.tsx(조작·장소), packages/protocol constants
const FACTS = [
  ["요금", "무료"],
  ["설치", "필요 없음 (웹 브라우저)"],
  ["회원가입", "필요 없음 (이름과 모습만 정하면 입장)"],
  ["함께 노는 인원", `채널마다 최대 ${DEFAULT_CHANNEL_CAPACITY}명, 최대 ${DEFAULT_MAX_CHANNELS}채널`],
  ["조작", "키보드(WASD·방향키) 또는 터치(왼쪽 아래 조이스틱과 버튼)"],
  ["할 수 있는 것", "채팅·친구, 사냥터(스킬 트리)·미니게임, 낚시(자동 낚시)·채집·도감, 동물원 펫, 캐릭터·집 꾸미기와 랭킹, 묘비 세우기·헌화, 관람차·열기구, 귀신의집, 폭죽"],
  ["다른 기기에서 이어 하기", "개인 코드로 포인트·가방·내 묘비를 그대로"],
  ["앱처럼 쓰기", "크롬·엣지 앱 설치 또는 휴대폰 홈 화면에 추가로 아이콘 만들기"],
] as const;

export default function BrowserGamePage() {
  return (
    <GuidePage
      path={PATH}
      h1={H1}
      description={DESCRIPTION}
      lead="「한때는...」은 설치·회원가입 없이 브라우저에서 바로 하는 무료 실시간 멀티 도트 마을이에요."
      facts={FACTS}
      steps={[
        "아래 [마을 들어가기]를 누르고 [새로 시작]에서 이름과 모습을 정해요.",
        "채널을 골라 들어가요. 같은 채널 사람들이 실시간으로 함께 움직여요.",
        "WASD·방향키(휴대폰은 조이스틱)로 걸어 다니며 사냥터·낚시터·분양 사무소를 찾아가요.",
      ]}
    />
  );
}
