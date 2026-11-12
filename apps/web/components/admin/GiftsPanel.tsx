"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ITEMS, itemById, itemName, type ItemDef } from "@tomb/protocol";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { BALANCE_CAP } from "@/lib/economy";
import {
  GIFT_MAX_COUNT,
  GIFT_MAX_ITEMS,
  GIFT_TERMS,
  giftHasTerm,
  isGiftTerm,
  type GiftItem,
  type GiftTerm,
} from "@/lib/types";
import type { AdminAccountRow } from "@/app/api/admin/accounts/search/route";
import { effectLabel, KIND_LABELS } from "../account/items";
import { SLOT_NAMES, SLOT_ORDER } from "../account/wardrobe";
import ItemIcon from "../ui/ItemIcon";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import g from "./GiftsPanel.module.css";
import social from "./SocialPanels.module.css";
import { socialAdminApi } from "./socialAdminApi";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };
/** 고른 아이템 한 줄 (아이템마다 한 줄). term 없음 = 기본 (가방 이용권 count개) */
type Line = { itemId: string; count: number; term?: GiftTerm };

const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const clampCount = (n: number) =>
  Math.max(1, Math.min(GIFT_MAX_COUNT, Math.floor(n) || 1));
const lineText = (i: GiftItem) =>
  `${itemName(i.itemId)} ${i.term ? `(${GIFT_TERMS[i.term].label})` : `×${i.count}`}`;

/** 아이템 묶음: 캐릭터 꾸미기는 부위별, 나머지는 종류별 (실제 카탈로그에 있는 것만, 운영자 전용 꾸미기는 뺀다) */
const PICKABLE = ITEMS.filter((i) => !i.staff);
const groupOf = (i: ItemDef) =>
  i.kind === "cosmetic" && i.slot ? `cosmetic:${i.slot}` : i.kind;
const GROUPS: { key: string; label: string }[] = [
  ...SLOT_ORDER.filter((s) =>
    PICKABLE.some((i) => i.kind === "cosmetic" && i.slot === s),
  ).map((s) => ({ key: `cosmetic:${s}`, label: `꾸미기·${SLOT_NAMES[s]}` })),
  ...[
    ...new Set(
      PICKABLE.filter((i) => i.kind !== "cosmetic").map((i) => i.kind),
    ),
  ].map((k) => ({ key: k, label: KIND_LABELS[k] ?? k })),
];
const TERM_KEYS = Object.keys(GIFT_TERMS).filter(isGiftTerm);

/** 11번 선물 탭: 대상 → 쪽지 → 포인트 → 아이템 고르기 → 확인하고 보내기, 아래에 발송 기록 */
export default function GiftsPanel({ toast, onAuthLost }: Props) {
  const [version, setVersion] = useState(0);
  const log = usePanelData(
    () => socialAdminApi.gifts(),
    [version],
    toast,
    onAuthLost,
  );
  const [mode, setMode] = useState<"all" | "one">("one");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<AdminAccountRow[] | null>(null);
  const [target, setTarget] = useState<AdminAccountRow | null>(null);
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [points, setPoints] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [group, setGroup] = useState(GROUPS[0]?.key ?? "");
  const [itemQuery, setItemQuery] = useState("");
  const [busy, setBusy] = useState(false);
  /** 확인을 누른 때의 보낼 내용 (내용이 바뀌면 확인이 풀린다) */
  const [armedSig, setArmedSig] = useState<string | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  async function search(e: FormEvent) {
    e.preventDefault();
    try {
      setFound((await adminApi.searchAccounts(query)).accounts);
    } catch (err) {
      fail(err);
    }
  }

  // 검색어가 있으면 모든 묶음에서 찾고, 없으면 고른 묶음만
  const shown = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (q)
      return PICKABLE.filter((i) =>
        `${i.name} ${i.desc} ${i.id}`.toLowerCase().includes(q),
      );
    return PICKABLE.filter((i) => groupOf(i) === group);
  }, [itemQuery, group]);

  const full = lines.length >= GIFT_MAX_ITEMS;
  const addItem = (itemId: string) =>
    setLines((prev) => {
      const cur = prev.find((l) => l.itemId === itemId);
      if (cur)
        return cur.term
          ? prev
          : prev.map((l) =>
              l.itemId === itemId
                ? { ...l, count: clampCount(l.count + 1) }
                : l,
            );
      return prev.length >= GIFT_MAX_ITEMS
        ? prev
        : [...prev, { itemId, count: 1 }];
    });
  const patchLine = (itemId: string, patch: Partial<Line>) =>
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)),
    );
  const removeLine = (itemId: string) =>
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));

  const items: GiftItem[] = lines.map((l) =>
    l.term
      ? { itemId: l.itemId, count: 1, term: l.term }
      : { itemId: l.itemId, count: l.count },
  );
  const payload = {
    target: mode === "all" ? "all" : (target?.accountId ?? ""),
    targetName: mode === "all" ? null : (target?.name ?? null),
    from: from.trim() || null,
    note: note.trim(),
    points,
    items,
  };
  const sig = JSON.stringify(payload);
  const armed = armedSig === sig;
  const ready =
    payload.note.length > 0 &&
    (points > 0 || items.length > 0) &&
    (mode === "all" || !!target);
  const targetText =
    mode === "all"
      ? "전체 (보낸 시각 이전에 들어온 모든 계정)"
      : target
        ? `${target.name ?? "이름 없음"} (${target.accountId})`
        : "아직 안 골랐어요";

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    if (!armed) {
      setArmedSig(sig);
      return;
    }
    setBusy(true);
    setArmedSig(null);
    try {
      await socialAdminApi.sendGift(payload);
      toast(
        mode === "all"
          ? "전체에게 선물을 보냈어요."
          : `${target!.name ?? "그 계정"}에게 선물을 보냈어요.`,
      );
      setNote("");
      setPoints(0);
      setLines([]);
      setVersion((v) => v + 1);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const stepTitle = (no: number, text: string) => (
    <h3 className={g.stepTitle}>
      <span className={g.stepNo}>{no}</span>
      {text}
    </h3>
  );

  return (
    <section className={social.panel} aria-label="선물">
      <form
        className={cx(ui.panel, social.form, g.form)}
        onSubmit={(e) => void send(e)}
      >
        <h2 className={styles.subTitle}>선물 보내기</h2>

        <div className={g.step}>
          {stepTitle(1, "받는 사람")}
          <div className={styles.segmented} role="group" aria-label="받는 사람">
            <button
              type="button"
              className={ui.button}
              aria-pressed={mode === "one"}
              onClick={() => setMode("one")}
            >
              특정 계정
            </button>
            <button
              type="button"
              className={ui.button}
              aria-pressed={mode === "all"}
              onClick={() => setMode("all")}
            >
              전체
            </button>
          </div>
          {mode === "all" ? (
            <p className={ui.hint}>
              지금까지 들어온 모든 계정이 받을 수 있어요 (보낸 뒤에 처음 들어온
              계정은 제외). 계정마다 복사하지 않고 받을 때 처리해요.
            </p>
          ) : (
            <div className={social.targetBox}>
              <div className={social.row}>
                <input
                  type="search"
                  className={cx(ui.input, styles.search)}
                  placeholder="닉네임 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void search(e);
                  }}
                  aria-label="닉네임 검색"
                />
                <button
                  type="button"
                  className={ui.button}
                  onClick={(e) => void search(e)}
                  disabled={!query.trim()}
                >
                  찾기
                </button>
              </div>
              {found && !found.length && (
                <p className={ui.hint}>
                  그 닉네임의 계정이 없어요 (포인트를 모은 적 있는 계정만
                  찾아요).
                </p>
              )}
              {found && found.length > 0 && (
                <ul className={social.found}>
                  {found.map((a) => (
                    <li key={a.accountId}>
                      <button
                        type="button"
                        className={cx(
                          ui.button,
                          target?.accountId === a.accountId && ui.primary,
                        )}
                        onClick={() => setTarget(a)}
                      >
                        {a.name ?? "이름 없음"}{" "}
                        <span className={styles.meta}>
                          {a.points.toLocaleString("ko-KR")}P ·{" "}
                          {a.accountId.slice(0, 6)}…
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={social.picked}>받는 사람: {targetText}</p>
            </div>
          )}
        </div>

        <div className={g.step}>
          {stepTitle(2, "쪽지")}
          <label className={ui.field}>
            <span className={ui.label}>보내는 이 (비우면 「마을 관리인」)</span>
            <input
              className={ui.input}
              value={from}
              maxLength={20}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className={ui.field}>
            <span className={ui.label}>
              쪽지 <span className={ui.counter}>{note.length}/200</span>
            </span>
            <textarea
              className={cx(ui.input, social.note)}
              value={note}
              maxLength={200}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              required
            />
          </label>
        </div>

        <div className={g.step}>
          {stepTitle(3, "포인트")}
          <label className={ui.field}>
            <span className={ui.label}>보낼 포인트 (0이면 아이템만)</span>
            <input
              className={cx(ui.input, social.count)}
              type="number"
              min={0}
              max={BALANCE_CAP}
              value={points}
              onChange={(e) =>
                setPoints(
                  Math.max(
                    0,
                    Math.min(
                      BALANCE_CAP,
                      Math.floor(Number(e.target.value) || 0),
                    ),
                  ),
                )
              }
            />
          </label>
        </div>

        <div className={g.step}>
          {stepTitle(
            4,
            `아이템 고르기 (${lines.length}/${GIFT_MAX_ITEMS}종류)`,
          )}
          <input
            type="search"
            className={ui.input}
            placeholder="아이템 이름·설명으로 찾기 (모든 종류에서)"
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            aria-label="아이템 검색"
          />
          {!itemQuery.trim() && (
            <div className={g.tabs} role="group" aria-label="아이템 종류">
              {GROUPS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={cx(ui.button, g.tab)}
                  aria-pressed={group === t.key}
                  onClick={() => setGroup(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <p className={ui.hint}>맞는 아이템이 없어요.</p>
          ) : (
            <div className={g.grid}>
              {shown.map((i) => {
                const picked = lines.some((l) => l.itemId === i.id);
                return (
                  <button
                    key={i.id}
                    type="button"
                    className={cx(ui.button, g.card)}
                    aria-pressed={picked}
                    disabled={full && !picked}
                    onClick={() => addItem(i.id)}
                    title={i.desc}
                  >
                    <span className={g.icon}>
                      <ItemIcon itemId={i.id} size={32} />
                    </span>
                    <span className={g.name}>{i.name}</span>
                    <span className={g.sub}>
                      {i.price.toLocaleString("ko-KR")}P · {effectLabel(i)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <span className={ui.label}>고른 아이템</span>
          {lines.length === 0 ? (
            <p className={ui.hint}>
              위에서 누르면 담겨요. 같은 걸 다시 누르면 개수가 늘어요.
            </p>
          ) : (
            <ul className={g.cart}>
              {lines.map((l) => {
                const def = itemById(l.itemId);
                const termable = giftHasTerm(l.itemId);
                return (
                  <li key={l.itemId} className={g.cartLine}>
                    <ItemIcon itemId={l.itemId} size={24} />
                    <span className={g.cartName}>
                      {def?.name ?? l.itemId}{" "}
                      <span className={g.sub}>
                        {def ? `${def.price.toLocaleString("ko-KR")}P` : ""}
                      </span>
                    </span>
                    {termable && (
                      <select
                        className={cx(ui.input, g.termSelect)}
                        value={l.term ?? ""}
                        aria-label="기간"
                        onChange={(e) =>
                          patchLine(l.itemId, {
                            term: isGiftTerm(e.target.value)
                              ? e.target.value
                              : undefined,
                            count: 1,
                          })
                        }
                      >
                        <option value="">기본 24시간 (가방 이용권)</option>
                        {TERM_KEYS.map((t) => (
                          <option key={t} value={t}>
                            {GIFT_TERMS[t].label}
                            {t === "perm" ? " 소장" : " (바로 옷장에)"}
                          </option>
                        ))}
                      </select>
                    )}
                    {!l.term && (
                      <span className={g.stepper}>
                        <button
                          type="button"
                          className={cx(ui.button, g.stepBtn)}
                          aria-label="하나 빼기"
                          onClick={() =>
                            patchLine(l.itemId, {
                              count: clampCount(l.count - 1),
                            })
                          }
                          disabled={l.count <= 1}
                        >
                          −
                        </button>
                        <input
                          className={cx(ui.input, g.countInput)}
                          type="number"
                          min={1}
                          max={GIFT_MAX_COUNT}
                          value={l.count}
                          aria-label="개수"
                          onChange={(e) =>
                            patchLine(l.itemId, {
                              count: clampCount(Number(e.target.value)),
                            })
                          }
                        />
                        <button
                          type="button"
                          className={cx(ui.button, g.stepBtn)}
                          aria-label="하나 더"
                          onClick={() =>
                            patchLine(l.itemId, {
                              count: clampCount(l.count + 1),
                            })
                          }
                          disabled={l.count >= GIFT_MAX_COUNT}
                        >
                          +
                        </button>
                      </span>
                    )}
                    <button
                      type="button"
                      className={cx(ui.button, ui.quiet)}
                      onClick={() => removeLine(l.itemId)}
                    >
                      빼기
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={ui.hint}>
            꾸미기는 기간을 고를 수 있어요. 기본은 가방에 이용권으로 들어가고,
            3일·7일·30일은 받는 즉시 옷장(입고 있으면 그대로)에 기간이 더해지고,
            영구는 영구 소장이 돼요.
          </p>
        </div>

        <div className={g.step}>
          {stepTitle(5, "확인하고 보내기")}
          <dl className={g.summary}>
            <dt>받는 사람</dt>
            <dd>{targetText}</dd>
            <dt>쪽지</dt>
            <dd>
              <b>{payload.from ?? "마을 관리인"}</b>{" "}
              {payload.note || "(아직 안 적었어요)"}
            </dd>
            <dt>내용</dt>
            <dd>
              {[
                ...(points ? [`${points.toLocaleString("ko-KR")}P`] : []),
                ...items.map(lineText),
              ].join(", ") || "(포인트나 아이템을 넣어 주세요)"}
            </dd>
          </dl>
          <button
            type="submit"
            className={cx(ui.button, armed ? ui.danger : ui.primary)}
            disabled={busy || !ready}
          >
            {armed
              ? mode === "all"
                ? "정말 전체에게 보낼까요? (한 번 더 누르기)"
                : "이대로 보낼까요? (한 번 더 누르기)"
              : "확인"}
          </button>
          <p className={ui.hint}>
            받지 않은 선물은 30일 동안 보관돼요. 유저는 메뉴의 선물함(빨간
            점)에서 받아요.
          </p>
        </div>
      </form>

      <div className={social.logBox}>
        <h2 className={styles.subTitle}>발송 기록</h2>
        {!log && <p className={ui.hint}>불러오는 중…</p>}
        {log?.gifts.length === 0 && (
          <p className={ui.hint}>아직 보낸 선물이 없어요.</p>
        )}
        {log && log.gifts.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>보낸 때</th>
                <th>대상</th>
                <th>쪽지</th>
                <th>내용</th>
                <th>받음</th>
              </tr>
            </thead>
            <tbody>
              {log.gifts.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.createdAt)}</td>
                  <td>
                    {r.target === "all"
                      ? "전체"
                      : (r.targetName ?? r.target.slice(0, 8))}
                  </td>
                  <td className={social.noteCell} title={r.note}>
                    <b>{r.from}</b> {r.note}
                  </td>
                  <td>
                    {[
                      ...(r.points ? [`${r.points}P`] : []),
                      ...r.items.map(lineText),
                    ].join(", ")}
                  </td>
                  <td>{r.claims}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
