"use client";

import { useEffect, useState } from "react";
import { itemById } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { DAILY_EARN_CAP } from "@/lib/economy";
import type { GravesState } from "@/lib/hooks/useGraves";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { fireFirework, wearCosmetic } from "./actions";
import { bagEntries, KIND_LABELS, remainingLabel } from "./items";
import MyGraves from "./MyGraves";
import styles from "./MyPanel.module.css";

type Props = {
  graves: GravesState;
  onGoToGrave: (graveId: string) => void;
  onBury: () => void;
  /** 접속 종료: 게임을 내리고 입장 화면으로 */
  onLeave: () => void;
  onClose: () => void;
};

/** 내 정보: 포인트·출석, 가방, 착용 중, 내 묘비, 개인 코드, 접속 종료 */
export default function MyPanel({ graves, onGoToGrave, onBury, onLeave, onClose }: Props) {
  const { me, error } = useMe();
  const [pending, setPending] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 남은 시간은 열 때 시각 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    void meStore.refresh();
  }, []);

  async function act(itemId: string, task: () => Promise<void>, done: string) {
    setPending(itemId);
    setNotice(null);
    try {
      await task();
      setNotice(done);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  if (!me) {
    return (
      <Dialog title="내 정보" onClose={onClose}>
        <p className={styles.state} role="status">
          {error ?? "불러오는 중…"}
        </p>
        <button type="button" className={cx(ui.button, styles.leave)} onClick={onLeave}>
          접속 종료
        </button>
      </Dialog>
    );
  }

  const bag = bagEntries(me.inventory);
  const equipped = me.equipped.filter((e) => e.until > openedAt);

  return (
    <Dialog title="내 정보" onClose={onClose}>
      <div className={styles.panel}>
        <section className={styles.points} aria-label="포인트">
          <p className={styles.balance}>
            <strong>{me.points.toLocaleString("ko-KR")}</strong> 포인트
          </p>
          <p className={styles.sub}>
            오늘 {me.todayEarned}/{DAILY_EARN_CAP} · 연속 출석 {me.attendance.streak}일
            {me.attendance.today && " · 오늘 출석 완료"}
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>가방</h3>
          {bag.length === 0 ? (
            <p className={styles.empty}>가방이 비었어요. 상점에서 포인트로 살 수 있어요.</p>
          ) : (
            <ul className={styles.list}>
              {bag.map(({ item, count }) => (
                <li key={item.id} className={styles.row}>
                  <span className={styles.rowMain}>
                    {item.name} <span className={styles.count}>×{count}</span>
                    <span className={styles.meta}>{KIND_LABELS[item.kind]}</span>
                  </span>
                  {item.kind === "firework" && (
                    <button
                      type="button"
                      className={ui.button}
                      disabled={pending !== null}
                      onClick={() =>
                        act(
                          item.id,
                          async () => {
                            await fireFirework(item.id);
                            onClose();
                          },
                          "펑!",
                        )
                      }
                    >
                      쏘기
                    </button>
                  )}
                  {item.kind === "cosmetic" && (
                    <button
                      type="button"
                      className={ui.button}
                      disabled={pending !== null}
                      onClick={() => act(item.id, () => wearCosmetic(item.id), `${item.name}을(를) 착용했어요.`)}
                    >
                      착용
                    </button>
                  )}
                  {item.kind === "decor" && <span className={styles.meta}>내 묘비 상세에서 놓아요</span>}
                  {item.kind === "graveStyle" && <span className={styles.meta}>묘비 세울 때 골라요</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {equipped.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.heading}>착용 중</h3>
            <ul className={styles.list}>
              {equipped.map((e) => (
                <li key={e.itemId} className={styles.row}>
                  <span className={styles.rowMain}>{itemById(e.itemId)?.name ?? e.itemId}</span>
                  <span className={styles.meta}>{remainingLabel(e.until, openedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.heading}>내 묘비</h3>
          <MyGraves ids={me.graves} graves={graves.graves} onGo={onGoToGrave} onBury={onBury} />
        </section>

        <CodeSection hasCode={me.hasCode} />

        <p className={styles.notice} role="status">
          {notice}
        </p>

        <section className={styles.section}>
          {leaving ? (
            <div className={styles.confirm}>
              <p>묘지를 떠날까요?</p>
              <div className={styles.confirmButtons}>
                <button type="button" className={cx(ui.button, ui.danger)} onClick={onLeave} autoFocus>
                  떠나기
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setLeaving(false)}>
                  머무르기
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={cx(ui.button, styles.leave)} onClick={() => setLeaving(true)}>
              접속 종료
            </button>
          )}
        </section>
      </div>
    </Dialog>
  );
}

/** 개인 코드 발급·재발급. 원문은 발급 응답에만 있으니 그때 복사하게 한다 */
function CodeSection({ hasCode }: { hasCode: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function issue() {
    setPending(true);
    setMessage(null);
    try {
      const res = await api.issueCode();
      setCode(res.code);
      setConfirming(false);
      void meStore.refresh();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("복사했어요. 안전한 곳에 적어 두세요.");
    } catch {
      setMessage("복사가 안 되면 길게 눌러 직접 적어 두세요.");
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>개인 코드</h3>
      <p className={ui.hint}>
        코드를 만들어 두면 다른 기기에서도 이 계정(포인트·가방·내 묘비)으로 들어올 수 있어요. 입장 화면의 &quot;개인
        코드로 들어가기&quot;에 넣으면 돼요.
      </p>
      {code ? (
        <div className={styles.codeBox}>
          <output className={styles.code} aria-label="개인 코드">
            {code}
          </output>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => copy(code)}>
            복사
          </button>
          <p className={styles.warning} role="note">
            이 코드를 알면 누구나 내 계정에 들어올 수 있어요. 지금 한 번만 보여 드려요.
          </p>
        </div>
      ) : confirming ? (
        <div className={styles.confirm}>
          <p>새로 만들면 예전 코드는 바로 쓸 수 없게 돼요.</p>
          <div className={styles.confirmButtons}>
            <button type="button" className={cx(ui.button, ui.danger)} onClick={issue} disabled={pending} autoFocus>
              새 코드 만들기
            </button>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirming(false)}>
              그만두기
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={ui.button}
          onClick={hasCode ? () => setConfirming(true) : issue}
          disabled={pending}
        >
          {pending ? "만드는 중…" : hasCode ? "코드 다시 만들기" : "개인 코드 만들기"}
        </button>
      )}
      {message && (
        <p className={styles.sub} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
