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

function tutorialSteps(touch: boolean): Step[] {
  return [
    {
      title: "걸어 보기",
      text: touch ? "왼쪽 아래 조이스틱으로 걸어요. [점프]로 묘비를 넘을 수 있어요." : "WASD나 방향키로 걸어요. Shift는 달리기, Space는 점프예요.",
    },
    { title: "가까운 묘비로", text: "화살표가 가리키는 묘비 앞으로 가 보세요.", point: "nearestGrave", waitFor: "near" },
    {
      title: "헌화하기",
      text: touch
        ? "묘비 앞에서 [상호작용]을 누르고 🌼 헌화하기를 눌러 보세요."
        : "묘비 앞에서 E를 누르고 🌼 헌화하기를 눌러 보세요.",
      waitFor: "flowered",
    },
    {
      title: "포인트",
      text: `+${earnRule("flower").points} 포인트가 쌓였어요. 포인트로 상점에서 폭죽·꾸미기를 살 수 있어요.`,
    },
    { title: "상점", text: "유령 잡화점이에요. 주인장에게 말을 걸면 상점이 열려요.", point: "shop" },
    { title: "사냥터", text: "미니게임으로 포인트를 모으는 곳이에요.", point: "hunt" },
    { title: "분양 사무소", text: "나만의 집을 얻어 꾸밀 수 있어요.", point: "housing" },
    { title: "모닥불", text: "모닥불 곁에 앉으면 잠시 불멍을 할 수 있어요.", point: "campfire" },
    { title: "이제 자유롭게", text: "다시 보고 싶으면 ⓘ 안내에서 언제든 볼 수 있어요." },
  ];
}

/** 첫 방문 안내 (1분). 단계마다 월드의 장소를 가리키고, 묘비 근처·헌화는 실제로 해 보면 넘어간다 */
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
