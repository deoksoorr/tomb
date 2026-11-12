import { GRAVEYARD_CAPACITY } from "@tomb/protocol";
import { DEFAULT_PASS_DAYS, SHRINE_KEEP_DAYS } from "@/lib/types";
import { InfoCard, InfoGrid, Shortcuts, TipList, type Shortcut } from "../ui/InfoBlocks";

type Props = {
  onBury?: () => void;
  onShrine?: () => void;
  onPassed?: () => void;
};

/** "내 묘비 가기" 창 아래: 묘비의 한살이와 관련 창 바로 가기 */
export default function GraveGuide({ onBury, onShrine, onPassed }: Props) {
  const links: Shortcut[] = [
    ...(onBury ? [{ label: "묘비 쓰기", icon: "grave", onClick: onBury } satisfies Shortcut] : []),
    ...(onShrine ? [{ label: "성황당", icon: "candle", onClick: onShrine } satisfies Shortcut] : []),
    ...(onPassed ? [{ label: "성불한 이야기들", icon: "book", onClick: onPassed } satisfies Shortcut] : []),
  ];
  return (
    <InfoGrid spaced>
      <InfoCard title="묘비의 한살이" icon="grave">
        <TipList
          tips={[
            "끝내지 못한 일(프로젝트·다짐)을 묘비로 세워요. 묘역은 채널마다 따로예요.",
            "지나가던 사람이 헌화하면 내 소식으로 알려 드려요.",
            `세운 지 ${DEFAULT_PASS_DAYS}일이 지나면 성불해 묘역을 떠나고, '성불한 이야기들'에 남아요.`,
            `묘역(채널마다 ${GRAVEYARD_CAPACITY}자리)이 차면 가장 오래된 묘비부터 조금 일찍 성불해요.`,
          ]}
        />
      </InfoCard>
      <InfoCard title="내 묘비 돌보기" icon="heart">
        <TipList
          tips={[
            "목록에서 묘비를 누르면 그 앞까지 걸어가요. 다른 채널이면 채널을 옮겨 가요.",
            "묘비 상세에서 내용을 고칠 수 있고, 가방의 묘비 꾸미기를 놓아 줄 수도 있어요.",
            `[이장]하면 성황당에 ${SHRINE_KEEP_DAYS}일 동안 모셔지고, 그 안에 다시 모실 수 있어요.`,
          ]}
        />
        <Shortcuts items={links} />
      </InfoCard>
    </InfoGrid>
  );
}
