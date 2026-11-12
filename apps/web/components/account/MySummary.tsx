"use client";

import { useEffect, useState } from "react";
import { housingApi } from "@/lib/housing/client";
import type { PublicHouse } from "@/lib/housing/types";
import { FactGrid, InfoCard, Shortcuts, type Shortcut } from "../ui/InfoBlocks";
import type { MyGraveEntry } from "./items";

/** 내 소식 창 아래: 소식이 오는 곳(내 묘비·내 집)을 한눈에 */
export default function MySummary({ graves, onGraves, onHousing }: { graves: readonly MyGraveEntry[]; onGraves?: () => void; onHousing?: () => void }) {
  const [house, setHouse] = useState<PublicHouse | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    housingApi
      .mine()
      .then((r) => alive && setHouse(r.house))
      .catch(() => alive && setHouse(null));
    return () => {
      alive = false;
    };
  }, []);
  const flowers = graves.reduce((n, e) => n + e.grave.flowers, 0);
  const links: Shortcut[] = [
    ...(onGraves ? [{ label: "내 묘비 가기", icon: "grave", onClick: onGraves } satisfies Shortcut] : []),
    ...(onHousing ? [{ label: house ? "내 집·분양 사무소" : "분양 사무소", icon: "house", onClick: onHousing } satisfies Shortcut] : []),
  ];
  return (
    <InfoCard title="소식이 오는 곳" icon="heart">
      <FactGrid
        facts={[
          { label: "내 묘비", value: `${graves.length}개`, note: graves.length ? graves.map((e) => e.grave.name).join(", ") : "아직 세운 묘비가 없어요" },
          { label: "내 묘비가 받은 헌화", value: `${flowers}송이`, note: "헌화가 오면 소식으로 알려 드려요" },
          {
            label: "내 집",
            value: house === undefined ? "…" : house ? house.name : "없음",
            note: house ? `${house.ch}채널 · 좋아요 ${house.likes} · 꾸밈 ${house.score}점` : "분양받으면 좋아요·방명록 소식이 와요",
          },
        ]}
      />
      <Shortcuts items={links} />
    </InfoCard>
  );
}
