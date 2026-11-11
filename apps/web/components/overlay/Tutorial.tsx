"use client";

import { useEffect, useState } from "react";
import { bridge, type UiEvents } from "@/game/bridge";
import { api } from "@/lib/api";
import { earnRule } from "@/lib/economy";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { meStore } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Tutorial.module.css";

type Target = UiEvents["guide:point"]["target"];
type Step = { title: string; text: string; point?: Target; waitFor?: "near" | "flowered" };

/**
 * 48번 순서: 이동·앉기·모닥불 → 사냥 → 집 → 상점 → (묘비는 뒤쪽, 해 보라고 붙잡지 않는다)
 */
function tutorialSteps(touch: boolean): Step[] {
  return [
    {
      title: "걸어 보기",
      text: touch ? "왼쪽 아래 조이스틱으로 걸어요. [점프]로 낮은 것을 넘을 수 있어요." : "WASD나 방향키로 걸어요. Shift는 달리기, Space는 점프예요.",
    },
    {
      title: "앉아 쉬기",
      text: touch
        ? "벤치나 의자 앞에서 [앉기]를 누르면 앉아요. 다시 걸으면 일어나요."
        : "벤치나 의자 앞에서 X(또는 C)를 누르면 앉아요. 다시 걸으면 일어나요.",
      point: "bench",
    },
    { title: "모닥불", text: "모닥불 곁에 앉으면 잠시 불멍을 할 수 있어요. 다른 사람과 같이 앉아도 좋아요.", point: "campfire" },
    {
      title: "사냥터",
      text: `사냥과 미니게임으로 포인트를 모으는 곳이에요. 하루 최대 ${earnRule("hunt").dailyMax}포인트. ${touch ? "메뉴" : "왼쪽 위 [사냥]"}으로도 열 수 있어요.`,
      point: "hunt",
    },
    {
      title: "분양 사무소",
      text: `나만의 집을 얻어 가구로 꾸밀 수 있어요. ${touch ? "메뉴" : "왼쪽 위 [집]"}으로도 열 수 있어요.`,
      point: "housing",
    },
    { title: "상점", text: "유령 잡화점이에요. 주인장에게 말을 걸면 포인트로 꾸미기·폭죽을 살 수 있어요.", point: "shop" },
    {
      title: "작은 묘역",
      text: `끝내지 못한 것들이 잠든 곳이에요. 묘비 앞에서 ${touch ? "[상호작용]" : "E"}를 누르면 꽃을 놓을 수 있어요(+${earnRule("flower").points}P). 내 묘비는 메뉴에서 한 사람에 하나 쓸 수 있고, 시간이 지나면 성불해요.`,
      point: "nearestGrave",
    },
    { title: "이제 자유롭게", text: "다시 보고 싶으면 ⓘ 안내에서 언제든 볼 수 있어요." },
  ];
}

/** 첫 방문 안내 (1분). 단계마다 월드의 장소를 가리킨다 (waitFor 단계는 실제로 해 보면 넘어간다) */
export default function Tutorial({ touch, onDone }: { touch: boolean; onDone: () => void }) {
  const [steps] = useState(() => tutorialSteps(touch));
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    bridge.emit("guide:point", { target: step.point ?? null, label: step.point ? step.title : undefined });
  }, [step]);
  useEffect(() => () => bridge.emit("guide:point", { target: null }), []);

  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  useBridgeEvent("grave:near", (near) => {
    if (step.waitFor === "near" && near) next();
  });
  useBridgeEvent("grave:flowered", () => {
    if (step.waitFor === "flowered") next();
  });

  function finish() {
    api.finishTutorial().catch(() => {
      // 다음 입장 때 다시 뜰 뿐이다
    });
    const me = meStore.getSnapshot().me;
    if (me) meStore.set({ ...me, tutorialDone: true });
    onDone();
  }

  return (
    <section className={styles.card} aria-label="첫 방문 안내">
      <div className={styles.head}>
        <h2 className={styles.title}>{step.title}</h2>
        <button type="button" className={styles.skip} onClick={finish}>
          건너뛰기
        </button>
      </div>
      <p className={styles.text} aria-live="polite">
        {step.text}
      </p>
      <div className={styles.foot}>
        <ol className={styles.dots} aria-label={`${steps.length}단계 중 ${index + 1}단계`}>
          {steps.map((s, i) => (
            <li key={s.title} className={styles.dot} data-on={i === index} data-done={i < index} />
          ))}
        </ol>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={last ? finish : next}>
          {last ? "시작하기" : step.waitFor ? "건너뛰고 다음" : "다음"}
        </button>
      </div>
    </section>
  );
}
