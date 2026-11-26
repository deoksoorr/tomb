"use client";

import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { megaphoneStore, useMegaphone } from "@/lib/hooks/useMegaphone";
import { isOpShout } from "@/lib/opShout";
import MegaphoneSpotlight from "./MegaphoneSpotlight";

/**
 * 11/26 운영자 외치기 가운데 알림. 확성기 알림과 같은 줄(megaphoneStore)로 차례를 지켜 겹치지 않고,
 * 월드 HUD 밖에 그려 집·사냥터·미니게임 안이나 폰 새 이웃 화면(확성기 칸이 없는 곳)에서도 보인다. 소식 기록에는 넣지 않는다
 */
export default function OpShoutSpot() {
  const { flash, flashUntil } = useMegaphone();
  useBridgeEvent("megaphone:heard", (m) => {
    if (isOpShout(m)) megaphoneStore.push(m);
  });
  return <MegaphoneSpotlight op entry={flash} until={flashUntil} />;
}
