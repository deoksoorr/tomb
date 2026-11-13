import { pageMetadata } from "../../seo";
import GuidePage from "../GuidePage";
import { CHAT_MAX, CHAT_RECENT_MS, DEFAULT_CHANNEL_CAPACITY, DEFAULT_MAX_CHANNELS } from "@tomb/protocol";
import { earnRule } from "@/lib/economy";
import { PRESENCE_INTERVAL_MS } from "@/lib/types";

const PATH = "/guide/cowork";
const H1 = "재택근무할 때 같이 일하는 느낌 나는 사이트";
const TITLE = "재택근무할 때 같이 일하는 느낌 나는 사이트 — 최대 40명 실시간 도트 마을 | 한때는...";
const DESCRIPTION =
  "혼자 재택근무할 때 누군가 곁에 있는 느낌이 필요하다면 한때는...에 들어와 보세요. 채널마다 최대 40명이 한 마을에 모이고, 벤치에 앉아 '일하는 중' 상태를 띄워 두면 같은 채널 모두에게 보여요. 무료, 설치·가입 없이.";

export const metadata = pageMetadata(PATH, TITLE, DESCRIPTION);

// 숫자 출처: packages/protocol constants(DEFAULT_CHANNEL_CAPACITY 40, DEFAULT_MAX_CHANNELS 10, SEAT_MOODS 7가지), lib/economy.ts
const FACTS = [
  ["한 채널에 함께 있는 인원", `최대 ${DEFAULT_CHANNEL_CAPACITY}명`],
  ["채널 수", `최대 ${DEFAULT_MAX_CHANNELS}채널 (가득 차면 대기열)`],
  ["지금 하는 일 표시 (벤치 상태)", "7가지 — 공부 중, 일하는 중, 밥 먹는 중, 쉬는 중, 음악 듣는 중, 통화 중, 커피 마시는 중"],
  ["누구에게 보이나", "같은 채널 모두에게 (일어나면 풀려요)"],
  ["인사·대화", `정해진 문장 말풍선·이모티콘, 자유 채팅 (${CHAT_MAX}자, 같은 채널에 보이고 서버에 ${CHAT_RECENT_MS / 60_000}분만 머물러요)`],
  ["틀어 두는 동안", `접속해 있는 ${PRESENCE_INTERVAL_MS / 60_000}분마다 ${earnRule("presence").points}포인트 (다른 창을 봐도 괜찮아요, 하루 최대 ${earnRule("presence").dailyMax}포인트)`],
  ["요금", "무료 (설치·회원가입 없음)"],
] as const;

export default function CoworkPage() {
  return (
    <GuidePage
      path={PATH}
      h1={H1}
      description={DESCRIPTION}
      lead="「한때는...」은 여러 사람이 실시간으로 함께 있는 도트 마을이에요. 벤치에 앉아 '일하는 중'을 띄우고 같이 일해요."
      facts={FACTS}
      steps={[
        "아래 [마을 들어가기]를 눌러 이름과 모습을 정하고 채널을 골라 들어가요.",
        "벤치나 의자 근처에서 X 또는 C(휴대폰은 앉기 버튼)로 앉아요.",
        "T(휴대폰은 [표현] 버튼) → 벤치 상태에서 '일하는 중'을 골라 띄워 두고 일해요.",
      ]}
    />
  );
}
