import { pageMetadata } from "../../seo";
import GuidePage from "../GuidePage";
import { DEFAULT_CHANNEL_CAPACITY } from "@tomb/protocol";

const PATH = "/guide/bulmeong";
const H1 = "모닥불·빗소리 불멍 사이트";
const TITLE = "모닥불·빗소리 불멍 사이트 — 도트 마을 모닥불 곁에서 쉬기, 무료 배경음악 | At one time...";
const DESCRIPTION =
  "모닥불 앞에 앉아 멍하니 쉬고 싶다면 At one time...의 모닥불 광장으로 오세요. 곁에 앉으면 타닥이는 모닥불 소리와 함께 불멍을 할 수 있고, 로파이 같은 잔잔한 배경음악도 틀어 둘 수 있어요. 비 오는 날엔 빗소리도 들려요. 무료, 설치 없이.";

export const metadata = pageMetadata(PATH, TITLE, DESCRIPTION);

// 출처: GuideDialog(모닥불 불멍), game/world/Sfx.ts(모닥불 소리)·WeatherSound.ts(비 소리), lib/ambience.ts(30분 날씨·KST 하늘), public/bgm/tracks.json(11/18 5개 목록 215곡)
const FACTS = [
  ["모닥불", "곁에 앉으면 불멍, 가까울수록 모닥불 소리가 커져요"],
  ["배경음악", "레트로, 눈꽃 캐럴, 노을 시티팝, 판타지 마을, 로파이 215곡"],
  ["날씨", "맑음·흐림·안개·비·눈, 한국 시간 30분마다 바뀌고 비가 오면 빗소리가 들려요"],
  ["하늘", "한국 시간에 맞춰 새벽·낮·해질녘·밤"],
  ["함께 쉬는 사람", `채널마다 최대 ${DEFAULT_CHANNEL_CAPACITY}명`],
  ["요금", "무료 (설치·회원가입 없음)"],
] as const;

export default function BulmeongPage() {
  return (
    <GuidePage
      path={PATH}
      h1={H1}
      description={DESCRIPTION}
      lead="「At one time...」 마을의 모닥불 곁에 앉으면 타닥이는 소리와 함께 불멍을 할 수 있어요. 잔잔한 배경음악도 틀어 둘 수 있어요."
      facts={FACTS}
      steps={[
        "아래 [마을 들어가기]를 눌러 이름과 모습을 정하고 채널을 골라 들어가요.",
        "모닥불 광장으로 걸어가 모닥불 곁에서 X 또는 C(휴대폰은 앉기 버튼)로 앉아요.",
        "왼쪽 위 음악 플레이어의 목록에서 '로파이'를 골라 틀어 둬요.",
      ]}
    />
  );
}
