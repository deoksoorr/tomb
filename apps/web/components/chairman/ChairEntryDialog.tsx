"use client";

import { useEffect, useRef, useState } from "react";
import { CHAIR_RUN } from "@/game/chairman/rules";
import { errorMessage } from "@/lib/api";
import { chairFloorText, chairWeek, type ChairMode } from "@/lib/chairman/rules";
import type { ChairStatusResponse } from "@/lib/chairman/service";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import RaceCountdown from "../grave/RaceCountdown";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { chairStatus, peekStatus } from "./chairData";
import ChairPortrait from "./ChairPortrait";
import { goState, lastedText, num, pips, pointsLine, runsText, sealRule, sealTag, techRows, weekText } from "./chairText";
import s from "./ChairEntry.module.css";

// 11/20 등대 문 앞 E → 회장님 독대 입장 창 (시안 dps3 .pk): 노멀·헬 카드, 오늘 남은 판, 판 포인트, 내 최고, 이번 주 순위.
// [연습 판]은 창을 연습 모드로 바꾸는 토글 (청록 창·연습 단추·안내 — 오늘 판을 다 썼으면 연습 모드로 열린다). 헬을 처음 고르면 한 번 확인 (연습도, 다시 묻지 않기).
// 아래에 이번 레이스 남은 시간 줄 (RaceCountdown). 출근 직전에 상태를 새로 받아 자격·남은 판을 다시 본다 (판 시작 POST는 game/chairman이 한다).

const HELL_OK_KEY = "tomb.chair.hellOk";
const readHellOk = () => {
  try {
    return localStorage.getItem(HELL_OK_KEY) === "1";
  } catch {
    return false;
  }
};

const DESC: Record<ChairMode, string> = {
  normal: "판교 회장님의 평범한(?) 하루. 기술 18가지가 무작위로 나와요.",
  hell: "마지막엔 평타만 남아요.",
};

type Props = { onClose: () => void; onStart: (mode: ChairMode, practice: boolean) => void; onOpenRace: () => void };

export default function ChairEntryDialog({ onClose, onStart, onOpenRace }: Props) {
  const [st, setSt] = useState<ChairStatusResponse | null>(() => peekStatus());
  const [error, setError] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [tech, setTech] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [noAsk, setNoAsk] = useState(false);

  // 열 때 오늘 판을 다 썼으면 연습 모드로 (처음 한 번만 — 그 뒤는 사람이 바꾼 대로)
  const autoPractice = useRef(false);
  useEffect(() => {
    if (!st || autoPractice.current) return;
    autoPractice.current = true;
    if (st.eligible && st.remaining.normal <= 0 && st.remaining.hell <= 0) setPractice(true);
  }, [st]);

  useEffect(() => {
    let alive = true;
    // 기억해 둔 값을 먼저 보이고, 열 때마다 새로 받는다 (방금 100층을 넘긴 사람)
    chairStatus(true)
      .then((v) => alive && setSt(v))
      .catch((e: unknown) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  const eligible = st?.eligible ?? false;
  const spentAny = !!st && eligible && (st.remaining.normal <= 0 || st.remaining.hell <= 0);

  /** 출근: 상태를 새로 받아 한 번 더 보고 → 연출 → 싸움 */
  const go = async (mode: ChairMode, skipAsk = false) => {
    if (busy) return;
    if (mode === "hell" && !skipAsk && !readHellOk()) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const v = await chairStatus(true);
      setSt(v);
      if (!v.eligible) return setError(chairFloorText(v.floor));
      if (!practice && v.remaining[mode] <= 0) return setError("오늘 이 모드 판은 다 썼어요. 연습 판은 할 수 있어요.");
      onStart(mode, practice);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const card = (mode: ChairMode) => {
    const left = st?.remaining[mode] ?? 0;
    const g = goState(mode, { eligible, remaining: left, practice, busy: busy || !st });
    const hell = mode === "hell";
    return (
      <article className={s.card} data-mode={mode} data-spent={(eligible && !practice && left <= 0) || undefined}>
        <ChairPortrait hell={hell} />
        <div className={s.cardBody}>
          <h4>
            {hell ? "헬" : "노멀"}
            {hell && <span className={s.tag}>{sealTag(st?.sealEveryMs ?? 45_000)}</span>}
          </h4>
          <p className={s.desc}>{hell ? `${sealRule(st?.sealEveryMs ?? 45_000)} ${DESC.hell}` : DESC[mode]}</p>
          {practice && <p className={s.practiceNote}>포인트와 기록이 남지 않아요. 판 수도 안 줄어요.</p>}
          <dl>
            {!practice && (
              <>
                <div>
                  <dt>오늘 남은 판</dt>
                  <dd>
                    <span className={s.pips} aria-hidden="true">
                      {pips(st ? left : 0).map((on, i) => (
                        <i key={i} data-on={on || undefined} />
                      ))}
                    </span>
                    {st ? runsText(left) : "…"}
                  </dd>
                </div>
                <div>
                  <dt>판 포인트</dt>
                  <dd>{pointsLine(mode)}</dd>
                </div>
              </>
            )}
            <div>
              <dt>내 최고</dt>
              <dd className={s.best}>
                {st ? (st.best[mode] > 0 ? num(st.best[mode]) : "기록 없음") : "…"}
                {st && st.best[mode] > 0 && lastedText(st.bestMs?.[mode]) && <small>{lastedText(st.bestMs?.[mode])}</small>}
              </dd>
            </div>
            <div>
              <dt>이번 주</dt>
              <dd className={st?.week[mode]?.rank === 1 ? s.gold : undefined}>{st ? weekText(st.week[mode]) : "…"}</dd>
            </div>
          </dl>
          <button type="button" className={s.go} disabled={g.disabled} onClick={() => void go(mode)}>
            {g.label}
          </button>
        </div>
      </article>
    );
  };

  return (
    <>
      <Dialog title="판교의 등대 · 꼭대기 회장실" onClose={onClose} fitHeight className={cx(s.dialog, practice && s.practice)}>
        <div className={s.pk} data-testid="chair-entry" data-practice={practice || undefined}>
          <div className={s.head}>
            <b>{practice ? "회장님 독대 (연습 모드)" : "회장님 독대"}</b>
            <span>{practice ? "실전 전에 손을 풀어 봐요." : "오늘은 사직서를 어떻게 낼까요?"}</span>
          </div>
          {st && !eligible && (
            <p className={s.gate} role="status">
              {/* 첫 문장(잼민이…) 한 줄, 나머지 한 줄 */}
              {gateLines(chairFloorText(st.floor)).map((t) => (
                <span key={t} className={s.gateLine}>
                  {t}
                </span>
              ))}
            </p>
          )}
          {error && (
            <p className={cx(ui.error, s.err)} role="alert">
              {error}
            </p>
          )}
          <div className={s.cards}>
            {card("normal")}
            {card("hell")}
          </div>
          {/* 11/22 오늘 돌려받기가 남았을 때만 한 줄 (하루 한 번, 두 모드 합쳐) */}
          {st && eligible && !practice && st.refundLeft === 1 && <p className={s.refundNote}>시작 전에 나가면 하루 한 번 판을 돌려드려요</p>}
          {tech && <TechList />}
          <RaceCountdown compact weekOf={chairWeek} />
          <div className={s.foot}>
            <button type="button" className={s.sm} aria-pressed={practice} data-hint={(spentAny && !practice) || undefined} disabled={!eligible} onClick={() => setPractice((p) => !p)}>
              {practice ? "실전으로 돌아가기" : "연습 판 (포인트·기록 없음)"}
            </button>
            <button type="button" className={s.sm} aria-expanded={tech} onClick={() => setTech((t) => !t)}>
              {tech ? "기술 목록 접기" : "오늘 나올 기술 보기"}
            </button>
            <button type="button" className={s.sm} onClick={onOpenRace}>
              이번 주 순위
            </button>
          </div>
          <RunTip />
          <p className={s.note}>
            {practice
              ? "연습 판은 몇 번이든 할 수 있어요. 포인트와 기록은 남지 않아요."
              : "포인트를 주는 판은 하루 노멀 2판, 헬 2판이에요 (새벽 5시 초기화). 다 쓰면 연습 판만 열려요. 받은 포인트는 지갑에만 들어가요."}
          </p>
        </div>
      </Dialog>
      {confirm && (
        <Dialog kind="confirm" title="헬은 정말 지옥이에요" onClose={() => setConfirm(false)} className={s.confirm}>
          <div className={s.cin} data-testid="chair-hell-confirm">
            {/* 11/22 규칙 문장은 뒤 헬 카드에 이미 있다 — 여기는 한 줄 */}
            <p>스킬이 하나씩 반려돼 마지막엔 평타만 남아요.</p>
            <div className={s.cbtn}>
              <button
                type="button"
                className={s.go}
                data-mode="hell"
                onClick={() => {
                  if (noAsk)
                    try {
                      localStorage.setItem(HELL_OK_KEY, "1");
                    } catch {
                      // 저장 못 하면 다음에 또 묻는다
                    }
                  setConfirm(false);
                  void go("hell", true);
                }}
              >
                그래도 사직서 내기
              </button>
              <button type="button" className={s.sm} onClick={() => setConfirm(false)}>
                다시 생각해 볼게요
              </button>
            </div>
            <label className={s.chk}>
              <input type="checkbox" checked={noAsk} onChange={(e) => setNoAsk(e.target.checked)} /> 다시 묻지 않기
            </label>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** 11/20 사용자 「회장님 독대에서는 달리기 가능하다고 무조건 안내」 (싸움 전 브리핑 game/chairman .runTip과 같은 초록 띠) */
function RunTip() {
  const coarse = useMediaQuery("(pointer: coarse)");
  return (
    <p className={s.runTip}>
      <b>회장실에서는 달릴 수 있어요.</b> {coarse ? `[달리기] 단추를 켜면 ${CHAIR_RUN}배 빨라져요` : `Shift를 누르고 있으면 ${CHAIR_RUN}배 빨라져요`}
    </p>
  );
}

/** 「오늘 나올 기술」: 단계마다 새로 나오는 기술 + 즉사 기술 */
function TechList() {
  const rows = techRows();
  return (
    <section className={s.tech} aria-label="회장님 기술">
      {/* 11/22 달리기 띠는 창 아래에 이미 있다 — 여기선 뺀다 */}
      <p className={s.techLead}>쉬운 기술부터 섞여 나와요. 처음 보는 기술은 피하는 법이 떠요.</p>
      <ul>
        {rows.map((r) => (
          <li key={r.id} data-kill={r.kill || undefined}>
            <span className={s.techStep}>{r.grade}</span>
            <b>{r.name}</b>
            <span className={s.techHow}>{r.how}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 자격 문구를 첫 문장 / 나머지 두 줄로 */
function gateLines(t: string): string[] {
  const k = t.indexOf(". ");
  return k < 0 ? [t] : [t.slice(0, k + 1), t.slice(k + 2)];
}
