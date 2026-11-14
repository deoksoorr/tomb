import { pageMetadata } from "../../seo";
import GuidePage from "../GuidePage";
import { earnRule } from "@/lib/economy";
import { PRESENCE_INTERVAL_MS } from "@/lib/types";

const PATH = "/guide/work-music";
const H1 = "일할 때 틀어 두는 노동요 사이트";
const TITLE = "일할 때 틀어 두는 노동요 사이트 — 로파이·재즈·어쿠스틱 기타 55곡 무료 배경음악, 설치 없이 | 한때는...";
const DESCRIPTION =
  "일할 때 틀어 둘 노동요를 찾나요? 한때는...에서 로파이·재즈·어쿠스틱 기타 3가지 장르 55곡을 무료로 틀어 둘 수 있어요. 설치·가입 없이 브라우저에서 바로, 다른 탭으로 옮겨도 음악이 계속 나와요.";

export const metadata = pageMetadata(PATH, TITLE, DESCRIPTION);

// 숫자 출처: public/bgm/tracks.json (로파이 16·재즈 19·어쿠스틱 기타 20곡, 길이 합 약 2시간 56분), lib/audioLife.ts(다른 탭에서도 재생), lib/economy.ts(머무르기 포인트)
const FACTS = [
  ["장르(목록)", "3가지 — 로파이, 재즈, 어쿠스틱 기타"],
  ["곡 수", "55곡 (로파이 16곡, 재즈 19곡, 어쿠스틱 기타 20곡)"],
  ["전체 길이", "약 2시간 56분"],
  ["요금", "무료"],
  ["설치·회원가입", "필요 없음 (브라우저에서 바로)"],
  ["다른 탭으로 옮기면", "같은 창의 다른 탭에서 일해도 음악이 계속 나와요"],
  ["소리 조절", "배경음악·환경음·효과음 볼륨을 따로"],
  ["틀어 두는 동안", `접속해 있는 ${PRESENCE_INTERVAL_MS / 60_000}분마다 ${earnRule("presence").points}포인트 (하루 최대 ${earnRule("presence").dailyMax}포인트)`],
] as const;

export default function WorkMusicPage() {
  return (
    <GuidePage
      path={PATH}
      h1={H1}
      description={DESCRIPTION}
      lead="「한때는...」에서 3가지 장르 55곡을 무료로 틀어 둘 수 있어요. 설치·가입 없이 브라우저에서 바로요."
      facts={FACTS}
      steps={[
        "아래 [마을 들어가기]를 눌러 이름과 모습을 정하고 채널을 골라 들어가요.",
        "왼쪽 위 음악 플레이어를 펼쳐 목록에서 장르를 골라요. 누를 때마다 다른 곡부터 나와요.",
        "다른 탭으로 옮겨 일해요. 음악은 계속 나오고 머무는 동안 포인트도 쌓여요.",
      ]}
    />
  );
}
