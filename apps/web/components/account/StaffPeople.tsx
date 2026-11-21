"use client";

import { useState } from "react";
import { isAwayMap, mapOf, type MapId, type StaffPerson } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { myBig } from "@/game/camp/foodState";
import { errorMessage } from "@/lib/api";
import { staffPeopleApi, useStaffPeople } from "@/lib/hooks/useStaffPeople";
import { filterPeople, findPerson, staffTpPlan, staffWhereText } from "@/lib/staffPeople";
import { showFriendNotice } from "../overlay/FriendNotice";
import { hopChannel } from "../housing/channelHop";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./FriendsDialog.module.css";

// 11/20 운영자 친구 창: 「접속 중인 사람」 (운영자에게만). 친구가 아니어도, 쿨다운 없이 [순간이동].
// 실시간 서버도 운영자 연결의 tp만 받는다 (staffTp.ts)

/** 채널을 옮기는 중인 순간이동 (창이 닫혀도 이어 간다. 다른 사람을 누르면 앞의 것은 그만둔다) */
let hopOff: (() => void) | null = null;
function hopTo(...args: Parameters<typeof hopChannel>): void {
  hopOff?.();
  hopOff = hopChannel(...args);
}

const goto = (p: StaffPerson) => bridge.emit("friend:goto", { sid: p.sid, name: p.name, x: p.x, y: p.y, ...(isAwayMap(p.map) ? { map: p.map } : {}), tp: true });

export default function StaffPeople({ myCh, myMap, onClose }: { myCh: number | null; myMap: MapId; onClose: () => void }) {
  const { data, error, reload } = useStaffPeople(true, 15_000);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = data ? filterPeople(data.people, q) : [];

  async function tp(p: StaffPerson) {
    setPending(`${p.ch}:${p.sid}`);
    setNotice(null);
    try {
      // 누르기 직전 자리를 다시 본다 (그사이 실내로 들어갔거나 나갔을 수 있다)
      const fresh = findPerson((await staffPeopleApi.list()).people, p);
      const plan = staffTpPlan(fresh, myCh, myMap, myBig());
      if (plan.do === "block") {
        setNotice(plan.message);
        reload();
        return;
      }
      onClose();
      if (plan.do === "go") return goto(plan.p);
      const ch = plan.p.ch;
      showFriendNotice(`${ch}채널로 옮긴 뒤 순간이동해요.`);
      hopTo(
        ch,
        myCh ?? 0,
        // 옮긴 뒤 다시 물어 본다 (그 사이 움직였을 수 있다)
        () =>
          void staffPeopleApi
            .list()
            .then((r) => {
              const again = findPerson(r.people, plan.p);
              const next = staffTpPlan(again, ch, mapOf(bridge.last("net:status")?.map), myBig());
              if (next.do === "go") goto(next.p);
              else showFriendNotice(next.do === "block" ? next.message : `${plan.p.name}님이 다른 곳으로 옮겼어요.`);
            })
            .catch((e) => showFriendNotice(errorMessage(e))),
        (full) => !full && showFriendNotice(`${ch}채널로 옮기지 못했어요. 잠시 뒤 다시 해 주세요.`),
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="staff-people">
      <h3 id="staff-people" className={styles.heading}>
        접속 중인 사람 {data ? data.people.length : ""}
      </h3>
      <p className={ui.hint}>운영자에게만 보여요. 친구가 아니어도 바로 옆으로 순간이동해요.</p>
      <input className={ui.input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름으로 찾기" aria-label="이름으로 찾기" />
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p className={ui.hint}>불러오는 중…</p>}
      {data && !data.reached && <p className={ui.hint}>지금은 접속 명단을 받을 수 없어요. 잠시 뒤 다시 열어 주세요.</p>}
      {data && data.reached && list.length === 0 && <p className={ui.hint}>{q ? "그 이름은 없어요." : "지금 접속한 사람이 없어요."}</p>}
      {list.length > 0 && (
        <ul className={cx(styles.list, styles.people)}>
          {list.map((p) => {
            const here = p.ch === myCh && !p.inside && mapOf(p.map) === myMap;
            return (
              <li key={`${p.ch}:${p.sid}`} className={styles.row}>
                <span className={styles.name}>
                  <span className={cx(styles.lamp, !p.inside && styles.on)} aria-hidden="true" />
                  {p.name}
                </span>
                <span className={styles.actions}>
                  <span className={styles.meta}>{here ? `${staffWhereText(p)} (여기)` : staffWhereText(p)}</span>
                  <button
                    type="button"
                    className={cx(ui.button, !p.inside && ui.primary)}
                    disabled={pending !== null}
                    title={p.inside ? "지금 들어갈 수 없는 곳에 있어요" : undefined}
                    onClick={() => void tp(p)}
                  >
                    순간이동
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.notice} role="status">
        {notice}
      </p>
    </section>
  );
}
