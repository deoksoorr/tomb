import { pageMetadata } from "../../seo";
import GuidePage from "../GuidePage";
import { earnRule } from "@/lib/economy";
import { PRESENCE_INTERVAL_MS } from "@/lib/types";

const PATH = "/guide/work-music";
const H1 = "일할 때 틀어 두는 노동요 사이트";
const TITLE = "일할 때 틀어 두는 노동요 사이트 — 레트로·캐럴·시티팝·판타지·로파이 215곡 무료 배경음악, 설치 없이 | At one time...";
const DESCRIPTION =
  "일할 때 틀어 둘 노동요로 레트로, 눈꽃 캐럴, 노을 시티팝, 판타지 마을, 로파이 215곡을 무료로 들을 수 있어요. 그중 200곡은 직접 만든 곡이고, 설치 없이 브라우저에서 바로 들어요. 다른 탭으로 옮겨도 음악이 이어져요.";

export const metadata = pageMetadata(PATH, TITLE, DESCRIPTION);

// 숫자 출처: public/bgm/tracks.json (11/18 5개 목록, 215곡 — 레트로 50·눈꽃 캐럴 50·노을 시티팝 50·판타지 마을 50·로파이 15, 길이 합 약 9시간), lib/audioLife.ts(다른 탭에서도 재생), lib/economy.ts(머무르기 포인트)
const FACTS = [
  ["장르(목록)", "5가지 — 레트로, 눈꽃 캐럴, 노을 시티팝, 판타지 마을, 로파이 (전곡 섞어 듣기도 돼요)"],
  ["곡 수", "215곡 (레트로 50곡, 눈꽃 캐럴 50곡, 노을 시티팝 50곡, 판타지 마을 50곡, 로파이 15곡)"],
  ["직접 만든 곡", "레트로, 눈꽃 캐럴, 노을 시티팝, 판타지 마을 200곡"],
  ["전체 길이", "약 9시간"],
  ["요금", "무료"],
  ["설치·회원가입", "필요 없음 (브라우저에서 바로)"],
  ["다른 탭으로 옮기면", "같은 창의 다른 탭에서 일해도 음악이 계속 나와요"],
  ["소리 조절", "배경음악·환경음·효과음 볼륨을 따로"],
  ["틀어 두는 동안", `접속해 있는 ${PRESENCE_INTERVAL_MS / 60_000}분마다 ${earnRule("presence").points}포인트`],
] as const;

export default function WorkMusicPage() {
  return (
    <GuidePage
      path={PATH}
      h1={H1}
      description={DESCRIPTION}
      lead="「At one time...」에서 레트로, 눈꽃 캐럴, 노을 시티팝, 판타지 마을, 로파이 215곡을 무료로 틀어 둘 수 있어요. 설치·가입 없이 브라우저에서 바로요."
      facts={FACTS}
      steps={[
        "아래 [마을 들어가기]를 눌러 이름과 모습을 정하고 채널을 골라 들어가요.",
        "왼쪽 위 음악 플레이어를 펼쳐 목록을 골라요. 누를 때마다 다른 곡부터 나오고, 「전곡 섞어 듣기」로 모든 곡을 섞어 들을 수도 있어요.",
        "다른 탭으로 옮겨 일해요. 음악은 계속 나오고 머무는 동안 포인트도 쌓여요.",
      ]}
    />
  );
}
