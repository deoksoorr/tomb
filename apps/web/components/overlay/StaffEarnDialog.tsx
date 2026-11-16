"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import { DAY_RESET_TEXT } from "@/lib/gameDay";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { STAFF_EARN_MAX_NAMES, STAFF_EARN_TODAY_MAX, staffEarnViews, type StaffEarnRequest, type StaffEarnResponse, type StaffEarnView } from "@/lib/staffEarn";
import { Bar, Row } from "../account/EarnGauge";
import gauge from "../account/EarnGauge.module.css";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./StaffEarnDialog.module.css";

/** 창을 연 동안 다시 묻는 간격 */
const REFRESH_MS = 30_000;
/** 지금 채널 사람들을 게임에 물은 뒤 이만큼 답이 없으면 마을 밖(캠핑장·집·사냥터 …)으로 본다 */
const PEERS_WAIT_MS = 1_500;

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fetchEarn = (body: StaffEarnRequest) =>
  request<StaffEarnResponse>("/api/staff/earn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });

type Mode = "channel" | "today";

/**
 * 운영자 전용 「포인트 현황」: 사람마다 오늘(새벽 5시 기준) 받은 포인트가 하루 한도를 얼마나 채웠는지.
 * 지금 채널 사람들(게임이 아는 이름) 또는 오늘 들어온 모든 계정. 한 줄을 누르면 항목별 게이지를 편다.
 * only = 캐릭터 메뉴에서 고른 한 사람만 (탭 없이 펼친 채로)
 */
export default function StaffEarnDialog({ onClose, only }: { onClose: () => void; only?: string }) {
  const [mode, setMode] = useState<Mode>("channel");
  const [fullOnly, setFullOnly] = useState(false);
  const [peers, setPeers] = useState<string[] | null>(null);
  const [noWorld, setNoWorld] = useState(false);
  const [data, setData] = useState<StaffEarnResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [openName, setOpenName] = useState<string | null>(only ?? null);
  const answered = useRef(false);
  // 탭을 바꾸면 앞 탭 결과를 지우고 새로 받는다
  const pickMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setData(null);
    setError(null);
  };

  // 지금 채널 사람들 이름 (월드가 peers:list로 답한다, 나는 빠진다)
  useBridgeEvent("peers:list", ({ names }) => {
    answered.current = true;
    setNoWorld(false);
    setPeers(names.slice(0, STAFF_EARN_MAX_NAMES));
  });
  useEffect(() => {
    if (only || mode !== "channel") return;
    answered.current = false;
    bridge.emit("peers:ask");
    const t = setTimeout(() => {
      if (!answered.current) setNoWorld(true);
    }, PEERS_WAIT_MS);
    return () => clearTimeout(t);
  }, [only, mode, round]);

  // 30초마다 다시 (지금 채널이면 사람 목록부터)
  useEffect(() => {
    const t = setInterval(() => setRound((r) => r + 1), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const names = only ? [only] : peers;
  const ask: StaffEarnRequest | null = mode === "today" && !only ? { mode: "today" } : names?.length ? { mode: "names", names } : null;
  // 요청 하나 = 물을 내용 + 몇 번째 새로 보기. 마지막으로 끝난 요청과 다르면 불러오는 중
  const reqKey = ask ? `${round}#${JSON.stringify(ask)}` : null;
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const loading = reqKey !== null && doneKey !== reqKey;
  useEffect(() => {
    if (!reqKey) return;
    let stop = false;
    fetchEarn(JSON.parse(reqKey.slice(reqKey.indexOf("#") + 1)) as StaffEarnRequest)
      .then((r) => {
        if (stop) return;
        setData(r);
        setError(null);
      })
      .catch((e: unknown) => !stop && setError(errorMessage(e)))
      .finally(() => !stop && setDoneKey(reqKey));
    return () => {
      stop = true;
    };
  }, [reqKey]);

  const views = data ? staffEarnViews(data.rows, data.boost) : [];
  const fullCount = views.filter((v) => v.full).length;
  const shown = fullOnly ? views.filter((v) => v.full) : views;
  const channelEmpty = mode === "channel" && !only && peers !== null && peers.length === 0;
  const waiting = !data && !error && !channelEmpty && !(mode === "channel" && noWorld && !only);

  return (
    <Dialog title={only ? `${only}님의 포인트 현황` : "포인트 현황"} onClose={onClose} fitHeight>
      <div className={styles.wrap}>
        {!only && (
          <div className={styles.bar}>
            <div className={styles.tabs} role="group" aria-label="볼 사람">
              <button type="button" className={styles.chip} aria-pressed={mode === "channel"} onClick={() => pickMode("channel")}>
                지금 채널
              </button>
              <button type="button" className={styles.chip} aria-pressed={mode === "today"} onClick={() => pickMode("today")}>
                오늘 들어온 사람 모두
              </button>
            </div>
            <button type="button" className={styles.chip} aria-pressed={fullOnly} onClick={() => setFullOnly((v) => !v)}>
              한도 다 찬 사람만
            </button>
            <button type="button" className={cx(ui.button, ui.quiet, styles.refresh)} onClick={() => setRound((r) => r + 1)} disabled={loading}>
              새로 보기
            </button>
          </div>
        )}

        {!only && data && !channelEmpty && (
          <p className={styles.summary}>
            {views.length}명 중 <b>{fullCount}명</b>이 오늘 한도를 다 채웠어요.
          </p>
        )}
        <p className={styles.note}>
          {data && data.boost.caps.length > 0 ? `오늘은 포인트 ${data.boost.mult}배 이벤트로 늘어난 한도로 계산해요. ` : ""}
          한도는 한국 시간 {DAY_RESET_TEXT}에 새로 시작해요.
          {mode === "today" && !only ? " 오늘 마을에 들어온 계정이 모두 보여요." : ""}
        </p>

        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        {mode === "channel" && !only && noWorld && <p className={styles.empty}>지금 채널 사람들은 마을에 있을 때만 볼 수 있어요.</p>}
        {channelEmpty && <p className={styles.empty}>지금 채널에 다른 사람이 없어요.</p>}
        {waiting && <p className={styles.empty}>불러오는 중이에요.</p>}
        {data && !channelEmpty && !(mode === "channel" && noWorld && !only) && (
          <>
            {shown.length === 0 && (
              <p className={styles.empty}>{only ? "이 사람의 계정을 찾지 못했어요." : fullOnly ? "아직 한도를 다 채운 사람이 없어요." : mode === "today" ? "오늘 들어온 사람이 없어요." : "오늘 포인트를 받은 사람이 없어요."}</p>
            )}
            <ul className={styles.list}>
              {shown.map((v, i) => (
                <Person key={`${i}:${v.name}`} v={v} open={openName === v.name} onToggle={() => setOpenName((n) => (n === v.name ? null : v.name))} />
              ))}
            </ul>
            {!only && data.missing && data.missing.length > 0 && <p className={styles.note}>이름으로 찾지 못한 {data.missing.length}명은 빠졌어요.</p>}
            {data.truncated && <p className={styles.note}>오늘 들어온 사람이 많아 {fmt(STAFF_EARN_TODAY_MAX)}명까지만 살펴봤어요.</p>}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** 한 사람: 이름·오늘 받은 포인트·채운 비율 + 큰 게이지. 누르면 항목별 게이지 (내 정보와 같은 줄) */
function Person({ v, open, onToggle }: { v: StaffEarnView; open: boolean; onToggle: () => void }) {
  const { total, main, rest, separate } = v.view;
  return (
    <li className={cx(gauge.box, styles.person)} data-full={v.full || undefined}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={onToggle}>
        <span className={styles.name}>{v.name}</span>
        <span className={gauge.totalNums}>
          <b>{fmt(total.earned)}</b> / {fmt(total.max)}
        </span>
        <span className={styles.pct}>{v.pct}%</span>
      </button>
      <Bar g={total} big label={`${v.name}님이 오늘 받은 포인트`} />
      {open && (
        <>
          <ul className={gauge.list}>
            {[...main, ...rest].map((r) => (
              <Row key={r.source} r={r} />
            ))}
          </ul>
          {separate.length > 0 && (
            <>
              <p className={gauge.sepHead}>아래 보상은 하루 한도와 따로 세요.</p>
              <ul className={gauge.list}>
                {separate.map((r) => (
                  <Row key={r.source} r={r} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </li>
  );
}
