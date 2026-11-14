"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { opsAdminApi, type AdminHealthReport } from "./opsAdminApi";
import type { AdminChampResponse } from "@/app/api/admin/champ/route";
import type { AdminChampTestResponse } from "@/app/api/admin/champ/test/route";
import type { AdminTestDropsResponse } from "@/app/api/admin/rpg/test-drops/route";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const STEP_LABEL: Record<string, string> = {
  put: "묘비 쓰기",
  get: "방금 쓴 묘비 읽기",
  list: "채널 목록 읽기",
  flower: "헌화 반영",
  settings: "설정 읽기",
  remove: "임시 묘비 지우기",
};

/**
 * 운영 점검: ① 저장소 점검(임시 묘비를 실제로 쓰고·읽고·지워 어느 단계에서 막히는지) ② 닉네임 색인 채우기(옛 계정 이름을 색인에 넣기)
 * ③ 사냥 레벨·꾸미기 랭킹 다시 채우기(기존 캐릭터·착용을 랭킹에 다시 적기). 모두 누를 때만 돈다 (화면을 연다고 저절로 돌지 않는다)
 */
export default function SystemPanel({ toast, onAuthLost }: Props) {
  const [health, setHealth] = useState<AdminHealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [reindex, setReindex] = useState<{ indexed: number; dup: number; rounds: number; done: boolean } | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  const check = async () => {
    setChecking(true);
    try {
      setHealth(await opsAdminApi.health());
    } catch (e) {
      fail(e);
    } finally {
      setChecking(false);
    }
  };

  const runReindex = async () => {
    setReindexing(true);
    let cursor = "0";
    let total = { indexed: 0, dup: 0, rounds: 0, done: false };
    setReindex(total);
    try {
      // 커서가 "0"으로 돌아올 때까지 200개씩 (한 번에 다 하면 요청 시간이 길어진다)
      do {
        const r = await opsAdminApi.reindexNames(cursor);
        cursor = r.next;
        total = { indexed: total.indexed + r.indexed, dup: total.dup + r.dup, rounds: total.rounds + 1, done: r.next === "0" };
        setReindex(total);
      } while (cursor !== "0" && total.rounds < 500);
      toast(`닉네임 색인을 채웠어요. 새로 ${total.indexed}개, 겹친 이름 ${total.dup}개.`);
    } catch (e) {
      fail(e);
    } finally {
      setReindexing(false);
    }
  };

  return (
    <section className={styles.notices} aria-label="운영 점검">
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>저장소 점검</h2>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void check()} disabled={checking}>
            {checking ? "점검 중…" : "점검 실행"}
          </button>
        </div>
        <p className={ui.hint}>
          저장소에 「상태 점검」 임시 묘비를 실제로 쓰고·읽고·헌화하고·지워 봐요. 묘비 작성이 실패할 때 어느 단계에서 막히는지 바로 보여요. 임시 묘비는 점검 끝에
          지워져요.
        </p>
        {health && (
          <>
            <div className={styles.channels}>
              <span className={cx(styles.badge, health.ok ? styles.badgeOpen : styles.badgeHidden)}>{health.ok ? "모두 정상" : "실패한 단계 있음"}</span>
              <span className={styles.chip}>저장소 {health.store === "redis" ? "Redis" : "메모리 (개발용)"}</span>
              <span className={styles.chip}>
                사진 저장소 {health.blob.token || health.blob.storeId ? "연결됨" : "없음 (개발용 로컬 업로드)"}
              </span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label="점검 단계">
                <thead>
                  <tr>
                    <th scope="col">단계</th>
                    <th scope="col">결과</th>
                    <th scope="col" className={styles.num}>
                      걸린 시간
                    </th>
                    <th scope="col">오류</th>
                  </tr>
                </thead>
                <tbody>
                  {health.steps.map((s) => (
                    <tr key={s.step}>
                      <td>{STEP_LABEL[s.step] ?? s.step}</td>
                      <td className={s.ok ? styles.checkOk : styles.checkFail}>{s.ok ? "성공" : "실패"}</td>
                      <td className={styles.num}>{s.ms.toLocaleString("ko-KR")}ms</td>
                      <td>{s.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>닉네임 색인 채우기</h2>
          <button type="button" className={ui.button} onClick={() => void runReindex()} disabled={reindexing}>
            {reindexing ? "채우는 중…" : "색인 채우기"}
          </button>
        </div>
        <p className={ui.hint}>
          계정을 200개씩 훑어 이름 색인(이름 → 계정)에 빠진 옛 계정 이름을 채워요. 이미 다른 계정이 쓰는 이름은 바꾸지 않고 「겹침」 표시만 해요. 안 해도 각 계정이
          다음 입장 때 저절로 채워지니, 회원 검색에 옛 계정이 안 나올 때만 쓰면 돼요.
        </p>
        {reindex && (
          <p className={styles.meta} aria-live="polite">
            {reindex.rounds}번 훑음 · 새로 채운 이름 {reindex.indexed.toLocaleString("ko-KR")}개 · 겹친 이름 {reindex.dup.toLocaleString("ko-KR")}개
            {reindex.done ? " · 끝까지 훑었어요" : reindexing ? " · 계속 훑는 중" : " · 중간에 멈췄어요"}
          </p>
        )}
      </div>

      <ChampCard toast={toast} fail={fail} />

      <TestDropsCard toast={toast} fail={fail} />

      <RankFillCard
        board="huntLevel"
        title="사냥 레벨 랭킹 다시 채우기"
        hint="사냥 캐릭터를 200개씩 훑어 지금 레벨·경험치를 사냥 레벨 랭킹에 다시 적어요. 랭킹을 처음 볼 때 서버가 한 번 저절로 채우니, 레벨을 올린 사람이 랭킹에 안 보일 때만 쓰면 돼요. 운영자는 빼고, 정지 계정은 목록에서 빠져요."
        toast={toast}
        fail={fail}
      />
      <RankFillCard
        board="look"
        title="꾸미기 랭킹 다시 채우기"
        hint="코디를 입은 계정을 200개씩 훑어 지금 착용으로 꾸미기 점수를 다시 적어요. 랭킹을 처음 볼 때 서버가 한 번 저절로 채우니, 입고 있는 사람이 랭킹에 안 보일 때만 쓰면 돼요. 운영자는 빼고, 정지 계정은 목록에서 빠져요."
        toast={toast}
        fail={fail}
      />
    </section>
  );
}

/** 랭킹 다시 채우기 카드 하나 (커서가 "0"으로 돌아올 때까지 200개씩) */
function RankFillCard({
  board,
  title,
  hint,
  toast,
  fail,
}: {
  board: "huntLevel" | "look";
  title: string;
  hint: string;
  toast: (message: string) => void;
  fail: (e: unknown) => void;
}) {
  const [state, setState] = useState<{ filled: number; rounds: number; done: boolean } | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    let cursor = "0";
    let total = { filled: 0, rounds: 0, done: false };
    setState(total);
    try {
      do {
        const r = await opsAdminApi.fillRank(board, cursor);
        cursor = r.next;
        total = { filled: total.filled + r.filled, rounds: total.rounds + 1, done: r.next === "0" };
        setState(total);
      } while (cursor !== "0" && total.rounds < 500);
      toast(`${title.replace(/ 다시 채우기$/, "")}을 다시 채웠어요. 랭킹에 오른 ${total.filled.toLocaleString("ko-KR")}명.`);
    } catch (e) {
      fail(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <button type="button" className={ui.button} onClick={() => void run()} disabled={running}>
          {running ? "채우는 중…" : "다시 채우기"}
        </button>
      </div>
      <p className={ui.hint}>{hint}</p>
      {state && (
        <p className={styles.meta} aria-live="polite">
          {state.rounds}번 훑음 · 랭킹에 적은 {state.filled.toLocaleString("ko-KR")}명
          {state.done ? " · 끝까지 훑었어요" : running ? " · 계속 훑는 중" : " · 중간에 멈췄어요"}
        </p>
      )}
    </div>
  );
}

const CHAMP_BOARD_LABEL: Record<string, string> = { points: "포인트", huntKills: "사냥 처치", fish: "낚시" };

/** 주간 랭킹 1위 보상: 그 주 1위·지급 상태 보기 + 다시 지급 (이미 준 랭킹은 다시 주지 않는다 — 계정 저장소가 주·랭킹마다 한 번만) */
function ChampCard({ toast, fail }: { toast: (message: string) => void; fail: (e: unknown) => void }) {
  const [week, setWeek] = useState("");
  const [state, setState] = useState<AdminChampResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (settle: boolean) => {
    setBusy(true);
    try {
      const w = week.trim() || undefined;
      const r = settle ? await opsAdminApi.champSettle(w) : await opsAdminApi.champ(w);
      setState(r);
      if (settle) toast(r.busy ? "다른 요청이 정리 중이에요. 잠시 뒤 다시 보세요." : r.paidNow?.length ? `새로 지급: ${r.paidNow.map((b) => CHAMP_BOARD_LABEL[b]).join("·")}` : "새로 줄 보상이 없어요 (이미 모두 지급).");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>주간 1위 보상</h2>
        <button type="button" className={ui.button} onClick={() => void run(false)} disabled={busy}>
          상태 보기
        </button>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void run(true)} disabled={busy}>
          {busy ? "처리 중…" : "다시 지급"}
        </button>
      </div>
      <p className={ui.hint}>
        매주 월요일 새벽 5시(한국 시간) 마감 뒤 첫 요청(입장·랭킹 창)이 지난주 1위(포인트·사냥 처치·낚시, 운영자 제외)를 정하고 보상(1위 전용 모자 대여 · 1,000P)을 줘요. 실패했을 때만
        [다시 지급]을 누르세요 — 이미 받은 랭킹은 다시 주지 않아요. 주를 비우면 지난주, 다른 주는 그 주 월요일(YYYYMMDD).
      </p>
      <label className={styles.meta}>
        주(월요일){" "}
        <input value={week} onChange={(e) => setWeek(e.target.value)} placeholder="비우면 지난주" inputMode="numeric" maxLength={8} />
      </label>
      <ChampTestBox toast={toast} fail={fail} />
      {state && (
        <div className={styles.tableWrap}>
          <p className={styles.meta}>
            {state.week} 주 · {state.over ? "마감됨" : "아직 마감 전"} · 기능 시작 주 {state.firstWeek}
            {!state.rec && " · 아직 정리 전 (1위 기록 없음)"}
          </p>
          {state.rec && (
            <table className={styles.table} aria-label="주간 1위 지급 상태">
              <thead>
                <tr>
                  <th scope="col">랭킹</th>
                  <th scope="col">1위</th>
                  <th scope="col" className={styles.num}>
                    값
                  </th>
                  <th scope="col">지급</th>
                </tr>
              </thead>
              <tbody>
                {state.rec.winners.length === 0 && (
                  <tr>
                    <td colSpan={4}>그 주 기록이 없어 1위가 없어요.</td>
                  </tr>
                )}
                {state.rec.winners.map((w) => (
                  <tr key={w.board}>
                    <td>{CHAMP_BOARD_LABEL[w.board]}</td>
                    <td>
                      {w.name} <span className={styles.meta}>{w.accountId}</span>
                    </td>
                    <td className={styles.num}>{w.value.toLocaleString("ko-KR")}</td>
                    <td className={state.paid[w.board] === w.accountId ? styles.checkOk : styles.checkFail}>{state.paid[w.board] === w.accountId ? "지급됨" : "아직"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 테스트 서버 전용 (운영에서는 서버가 404라 이 칸이 아예 안 보인다): 운영자 계정에 시험 1위 주기·해제.
 * 실제 지급과 같은 경로(전용 모자 한 주 대여 · 1,000P씩 · 배지·전용 오라)로 주고, 자격은 몇 시간 뒤 저절로 끝난다 (해제하면 시험으로 준 모자도 거둔다). 전용 모자는 늘 지금 자격에 맞는 것 하나만 남는다.
 * 주간 1위 기록·랭킹·명예의 전당은 건드리지 않는다. 운영자가 게임 화면을 열어 두면 그 자리에서 알림 창이 뜨고 오라가 붙는다
 */
function ChampTestBox({ toast, fail }: { toast: (message: string) => void; fail: (e: unknown) => void }) {
  const [info, setInfo] = useState<AdminChampTestResponse | null>(null);
  const [boards, setBoards] = useState<string[]>(["points"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // 운영(404)이면 조용히 숨긴다
    opsAdminApi
      .champTest()
      .then((r) => alive && setInfo(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!info) return null;

  const run = async (list: string[]) => {
    setBusy(true);
    try {
      const r = await opsAdminApi.setChampTest(list);
      setInfo(r);
      toast(list.length ? "운영자 계정에 시험 1위를 줬어요. 게임 화면에 알림 창이 뜨고 전용 오라가 붙어요." : "시험 1위를 끝냈어요. 시험으로 준 전용 모자도 거뒀어요.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (b: string) => setBoards((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));

  return (
    <div className={styles.meta}>
      <p className={ui.hint}>
        <b>테스트 서버 전용</b> · 운영자 계정에 시험 1위 주기 (전용 모자 한 주 대여 — 실제 지급과 같은 길이 · 1,000P씩 · 배지·전용 오라 3시간). 랭킹·명예의 전당에는 나오지 않아요. 전용 모자는 늘 지금 자격에 맞는 것 하나만 남아요 (다관왕을 주면 이전 모자는 거둬요). [시험 해제]는 시험 모자도 거둬요.
        {!info.staffId && " 먼저 운영자 계정을 지정해 주세요."}
      </p>
      {(["points", "huntKills", "fish"] as const).map((b) => (
        <label key={b} style={{ marginRight: 10 }}>
          <input type="checkbox" checked={boards.includes(b)} onChange={() => toggle(b)} /> {CHAMP_BOARD_LABEL[b]}
        </label>
      ))}
      <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void run(boards)} disabled={busy || !boards.length || !info.staffId}>
        운영자 계정에 시험 1위 주기
      </button>{" "}
      <button type="button" className={ui.button} onClick={() => void run([])} disabled={busy || !info.test}>
        시험 해제
      </button>
      <p className={styles.meta}>{info.test ? `지금 시험 1위: ${["points", "huntKills", "fish"].filter((_, i) => info.test!.bits & (1 << i)).map((b) => CHAMP_BOARD_LABEL[b]).join("·")} · ${new Date(info.test.until).toLocaleTimeString("ko-KR")}까지` : "지금 시험 1위 없음"}</p>
    </div>
  );
}

/**
 * 테스트 서버 전용 (운영에서는 서버가 404라 카드가 아예 안 보인다): 운영자 계정의 "다음 판 시험 드롭" 예약.
 * 운영자 계정이 사냥 판을 시작할 때마다 맨 앞 한 판을 꺼내, 판이 끝나면(승리·쓰러짐 관계없이) 우두머리 자리에 떨어지고 실제로 지급된다
 */
function TestDropsCard({ toast, fail }: { toast: (message: string) => void; fail: (e: unknown) => void }) {
  const [info, setInfo] = useState<AdminTestDropsResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // 운영(404)이면 조용히 숨긴다
    opsAdminApi
      .testDrops()
      .then((r) => alive && setInfo(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!info) return null;

  const run = async (action: "preset" | "clear") => {
    setBusy(true);
    try {
      setInfo(await opsAdminApi.setTestDrops(action));
      toast(action === "preset" ? "운영자 계정에 두 판 시험 드롭을 예약했어요. 사냥 판을 시작할 때마다 한 판씩 쓰여요." : "시험 드롭 예약을 비웠어요.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>시험 드롭 예약 (운영자 계정)</h2>
      </div>
      <p className={ui.hint}>
        <b>테스트 서버 전용</b> · 운영자 계정이 사냥 판을 시작할 때마다 맨 앞 예약 한 판을 꺼내요. 그 판이 끝나면(이기든 쓰러지든) 우두머리 자리에 예약한 드롭이 떨어지고, 확률 굴림 대신 그대로
        지급돼요 (장비는 그 사냥터에 어울리는 해당 등급에서 무작위, 꾸미기 선물은 이미 가진 것을 피해서). 일반 계정과 운영 서버에는 아무 영향이 없어요.
        {!info.staffId && " 먼저 운영자 계정을 지정해 주세요."}
      </p>
      <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void run("preset")} disabled={busy || !info.staffId}>
        고급+희귀 → 꾸미기+전설 두 판 예약
      </button>{" "}
      <button type="button" className={ui.button} onClick={() => void run("clear")} disabled={busy || !info.left.length}>
        예약 비우기
      </button>
      <p className={styles.meta} aria-live="polite">
        {info.left.length ? `남은 예약: ${info.left.map((l, i) => `${i + 1}판 ${l}`).join(" → ")}` : "남은 예약 없음"}
      </p>
    </div>
  );
}
