"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DIR, GEAR_DYE_SEPARATE, isDyeableCosmetic, isDyeSlotCosmetic, isFixedDyeId, ITEMS, type DirId } from "@tomb/protocol";
import { withDyePart } from "@/game/sprites/avatar";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import { swatchStyle } from "@/lib/dye/look";
import { wobbleLabel } from "@/lib/dye/palette";
import { waitLabel } from "@/lib/dye/rules";
import { noteSelectLock, selectLockUntil } from "@/lib/dye/selectLock";
import type { DyeSessionView, FixedDyeDef } from "@/lib/dye/types";
import type { Me } from "@/lib/types";
import { applyStyle } from "../account/actions";
import { entryStatus, SLOT_NAMES, wearAction, type WardrobeEntry } from "../account/wardrobe";
import { fittingLook, FITTING_VIEWS } from "../shop/fitting";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import LookScoreBadge from "../ui/LookScoreBadge";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { canWearPick, colorSlots, firstPick, nextLockedSlot, previewColor, wornSlot, type ItemDyes } from "./colorSlots";
import DyeDialog, { type DyeTicket } from "./DyeDialog";
import { colorText, SlotOpenDialog } from "./DyeTargetPicker";
import { fixedTicket, ticketOf } from "./StylePanel";
import ZoomStage from "./ZoomStage";
import styles from "./ItemWardrobe.module.css";

// 11/22 가방 [꾸미기] 아이템 페이지 (색 보관함). 가방 자세히 보기의 [색 보관함]·[자세히 보기]로 연다.
//  - 왼쪽(폰은 위): 내 캐릭터를 크게 (앞·옆·뒤). 오른쪽: 아이템 머리말(점수·칸·착용 상태·입기/벗기)
//  - 색 칸 4개 [원래 색] [커스텀 1~3]: 누르면 미리보기만 (큰 캐릭터·아이콘에 그 색, 서버 요청 없음). 빈 칸 「비었어요」, 잠긴 칸 「🔒 500P」
//    「입는 중」 리본은 지금 입은 칸에 그대로, 미리보기 중인 칸은 「미리보기」 표시. 창을 닫으면 미리보기는 버린다
//  - 고른 칸 한 줄 설명 + 할 일 한 줄 [이 색 입기](미리보기 칸이 입은 칸과 다를 때만 — 무료, 연타하면 서버가 잠근다) [커스텀 N 칠하기] [칸 열기].
//    잠긴 칸을 고르면 [N P로 칸 열기] 하나. 잠금 중이면 [이 색 입기] 자리에 「너무 자주 바꿨어요 · 9:41 뒤에 다시」
//  - [이 칸 칠하기] → 가진 염색권만 가운데 작은 창에 → 예전 염색 화면 (이 아이템·이 칸이 정해진 채, 무작위는 바로 60초 판)
//  - 연·noDye·보상·염색 안 하는 칸은 「염색 불가」 (11/22 날개는 염색된다). 되팔기는 상점 자세히 보기에서만 (11/22 운영자 — components/shop/SellConfirm)

type Avatar = { color: string; body: string };

/** 아래 판(염색권 고르기)의 한 줄 */
type SheetTicket = { id: string; name: string; how: string; n: number; ticket: DyeTicket; color?: string };

/** 가진 염색권 중 아이템에 쓸 수 있는 것 (캐릭터 부위 전용 고정 색은 뺀다) */
function itemTickets(inventory: Record<string, number>, defs: Record<string, FixedDyeDef>): SheetTicket[] {
  const out: SheetTicket[] = [];
  for (const it of ITEMS) {
    const n = inventory[it.id] ?? 0;
    const t = it.kind === "dye" && n > 0 ? ticketOf(it) : null;
    if (!t || (t.mode === "fixed" && t.parts?.length)) continue;
    const how =
      t.mode === "random" ? `60초 색판 · 흔들림 ${wobbleLabel(t.tier)}` : t.mode === "fixed" ? `정해진 색 ${t.color}` : t.mode === "pick" ? "원하는 색을 그대로" : "금빛·반짝이·무지개·야광";
    out.push({ id: it.id, name: it.name, how, n, ticket: t });
  }
  for (const d of Object.values(defs)) {
    const n = inventory[d.id] ?? 0;
    if (n > 0 && isFixedDyeId(d.id) && !d.parts?.length) out.push({ id: d.id, name: d.name, how: `정해진 색 ${d.color}`, n, ticket: fixedTicket(d), color: d.color });
  }
  return out;
}

/** 염색 불가 까닭 두 줄 (연 · noDye · 보상 · 염색 안 하는 칸) */
function noDyeText(entry: WardrobeEntry): [string, string] {
  const id = entry.item.id;
  if (!isDyeSlotCosmetic(id)) return [`${SLOT_NAMES[entry.slot]} 꾸미기는 색을 바꾸지 않아요`, "염색은 머리·목·옷·등 꾸미기만 해요."];
  if (GEAR_DYE_SEPARATE.has(id)) return ["연은 색을 바꿀 수 없어요", "따로 움직이는 그림이라 원래 색만 입어요."];
  const it = entry.item;
  // 11/22 순위 1위 모자·사이렌 모자·도장 교환소 보상은 그 모습이 보상 표시라 못 바꾼다 (protocol isDyeableCosmetic)
  if (it.champ || it.chair || it.urgent || it.quest) return ["이 꾸미기는 색을 바꿀 수 없어요", "보상 표시라 원래 색만 입어요."];
  return ["이 꾸미기는 색을 바꿀 수 없어요", "무늬가 정해진 그림이라 원래 색만 입어요."];
}

export default function ItemWardrobe({
  me,
  entry,
  look,
  avatar,
  name,
  now,
  pending,
  onWear,
  onClose,
  onNotice,
}: {
  me: Me;
  entry: WardrobeEntry;
  /** 지금 입은 것 (부위 순) */
  look: readonly string[];
  avatar: Avatar;
  /** 내 이름 (무대 왼쪽 위) */
  name: string;
  now: number;
  pending: boolean;
  /** 입기·벗기 (가방의 runWear) */
  onWear: () => Promise<void>;
  onClose: () => void;
  onNotice: (m: string | null) => void;
}) {
  const id = entry.item.id;
  const itemName = entry.item.name;
  const itemDyes: ItemDyes | undefined = me.itemDyes;
  const dyeable = isDyeableCosmetic(id);
  const [pick, setPick] = useState(() => firstPick(itemDyes, id));
  // 11/22 운영자: 등 칸 꾸미기는 뒷모습부터 보여 준다
  const [dir, setDir] = useState<DirId>(entry.item.slot === "pack" ? DIR.up : DIR.down);
  const [busy, setBusy] = useState(false);
  /** 고른 칸 설명 줄 대신 잠깐 보이는 결과·오류 */
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [buying, setBuying] = useState(false);
  const [dye, setDye] = useState<{ ticket: DyeTicket | null; resume: DyeSessionView | null; auto: boolean } | null>(null);
  /** 「이 색 입기」 연타 잠금이 끝나는 시각 (이 탭이 서버에서 들은 값) */
  const [lockUntil, setLockUntil] = useState(selectLockUntil);
  const [clock, setClock] = useState(() => Date.now());
  const lockLeft = lockUntil - clock;
  useEffect(() => {
    if (lockUntil <= Date.now()) return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockUntil]);

  const slots = colorSlots(itemDyes, id);
  const worn = wornSlot(itemDyes, id);
  const next = nextLockedSlot(itemDyes, id);
  const picked = pick >= 0 ? slots[pick] : null;
  const wearing = entry.state === "worn";
  // 미리보기: 고른 칸의 색 (서버 요청 없음). 지금 입은 칸과 다르면 [이 색 입기]
  const shownColor = previewColor(itemDyes, id, pick);
  const previewing = canWearPick(itemDyes, id, pick);
  // 무대: 지금 입은 모습 + 이 아이템(입지 않았으면 입혀 본다)을 미리보기 색으로
  const stageLook = fittingLook(look, id).look;
  const stageColor = withDyePart(avatar.color, id, shownColor);
  const act = wearAction(entry);

  /** [이 색 입기]: 미리보기 칸을 입는다 (무료). 연타 잠금이면 남은 시간을 기억해 단추 자리에 센다 */
  async function wearPick() {
    setBusy(true);
    setMsg(null);
    try {
      applyStyle(await dyeApi.select(id, pick));
      const text = pick < 0 ? "원래 색으로 갈아입었어요." : `커스텀 ${pick + 1} 색으로 갈아입었어요.`;
      setMsg({ text });
      onNotice(text);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "DYE_SELECT_LOCKED" && e.retryAfter) {
        // 잠금: 설명은 안내 줄(아래 detailSub), 단추 자리에는 남은 시간만 센다
        setLockUntil(noteSelectLock(e.retryAfter));
        setClock(Date.now());
        return;
      }
      setMsg({ text: errorMessage(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  /** 칸 누르기: 미리보기만 (서버 요청 없음 — 잠금 중에도 된다) */
  function tap(k: number) {
    setPick(k);
    setMsg(null);
  }

  // 고른 칸 한 줄 설명
  let detailTitle: ReactNode;
  let detailSub: string;
  let detailBox: ReactNode;
  if (!picked) {
    detailBox = <ItemIcon itemId={id} size={32} />;
    detailTitle = <b>원래 색</b>;
    detailSub = worn < 0 ? "지금 입은 색이에요. 원래 색 칸은 칠할 수 없어요." : "미리 보는 중이에요. [이 색 입기]를 누르면 원래 색으로 입어요.";
  } else if (picked.state === "painted") {
    detailBox = <span className={styles.big} style={swatchStyle(picked.color)} aria-hidden="true" />;
    detailTitle = (
      <>
        <b>커스텀 {picked.k + 1}</b> <span className={styles.hex}>{colorText(picked.color)}</span>
      </>
    );
    detailSub = picked.worn ? "지금 입은 색이에요. 다시 칠해도 다른 칸은 그대로예요." : "미리 보는 중이에요. [이 색 입기]를 누르면 이 색으로 입어요.";
  } else if (picked.state === "empty") {
    detailBox = <span className={cx(styles.big, styles.bigEmpty)} aria-hidden="true" />;
    detailTitle = (
      <>
        <b>커스텀 {picked.k + 1}</b> <span className={styles.muted}>빈 칸</span>
      </>
    );
    detailSub = "염색권으로 칠하면 여기에 남아요.";
  } else {
    detailBox = (
      <span className={cx(styles.big, styles.bigLock)} aria-hidden="true">
        <PixelIcon name="lock" size={18} />
      </span>
    );
    detailTitle = (
      <>
        <b>커스텀 {picked.k + 1}</b> <span className={styles.gold}>{picked.price.toLocaleString("ko-KR")}P</span>
      </>
    );
    detailSub = picked.next ? `한 번 열면 계속 써요. 내 포인트 ${me.points.toLocaleString("ko-KR")}P` : `커스텀 ${(next?.k ?? 0) + 1}부터 차례로 열어요.`;
  }

  // 「이 색 입기」 연타 잠금 중이면 미리보기 칸 설명 대신 까닭 (단추에는 남은 시간만)
  const lockNote = previewing && lockLeft > 0;
  if (lockNote) detailSub = "너무 자주 바꿨어요. 시간이 지나면 다시 입을 수 있어요. 미리보기는 계속 돼요.";
  const [noTitle, noSub] = noDyeText(entry);

  return (
    // 11/22 가방 창 안에서 한 단계 들어간 화면: 가방 창은 감추고(coverBelow), 데스크톱은 창 높이를 내용에 맞춘다. 폰은 화면 전체
    <Dialog title={itemName} onClose={onClose} onBack={onClose} coverBelow fitHeight>
      <div className={styles.page}>
        <div className={styles.left}>
          <div className={styles.stageWrap}>
            <ZoomStage className={styles.stage} color={stageColor} body={avatar.body} look={stageLook} label={`${itemName}을(를) 입은 내 모습`} dir={dir} />
            <span className={styles.who}>{name}</span>
            <span className={styles.seg} role="group" aria-label="보는 방향">
              {FITTING_VIEWS.map((v) => (
                <button key={v.dir} type="button" aria-pressed={dir === v.dir} onClick={() => setDir(v.dir)}>
                  {v.label}
                </button>
              ))}
            </span>
            {dyeable && (
              <span className={styles.live}>
                {previewing ? `${pick < 0 ? "원래 색" : `커스텀 ${pick + 1}`} 미리보기` : !wearing ? "입어 본 모습" : worn >= 0 ? `커스텀 ${worn + 1} 입는 중` : "원래 색 입는 중"}
              </span>
            )}
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.info}>
            <span className={styles.ic}>
              <ItemIcon itemId={id} size={48} dye={shownColor} />
            </span>
            <div className={styles.infoText}>
              <p className={styles.nm}>{itemName}</p>
              <p className={styles.meta}>
                <LookScoreBadge itemId={id} short />
                <span className={styles.tag}>{SLOT_NAMES[entry.slot]}</span>
                <span className={styles.muted}>{entryStatus(entry, now)}</span>
              </p>
            </div>
            <button type="button" className={cx(ui.button, !wearing && ui.primary)} disabled={pending || busy} onClick={() => void onWear()}>
              {act.label}
            </button>
          </div>

          {dyeable ? (
            <>
              <div className={styles.sec}>
                <h3>색 보관함</h3>
                <span className={styles.muted}>칸을 누르면 미리 봐요</span>
              </div>
              <div className={styles.slots} role="group" aria-label={`${itemName} 색 보관함`}>
                <button type="button" className={styles.slot} data-worn={worn < 0 || undefined} aria-pressed={pick < 0} disabled={busy} onClick={() => tap(-1)}>
                  {worn < 0 ? <Ribbon wearing={wearing} /> : pick < 0 && <PreviewTag />}
                  <span className={styles.lb}>원래 색</span>
                  <span className={styles.art}>
                    <ItemIcon itemId={id} size={48} />
                  </span>
                  <span className={cx(styles.hx, styles.faint)}>기본 그림</span>
                </button>
                {slots.map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    className={styles.slot}
                    data-state={s.state}
                    data-worn={(s.state === "painted" && s.worn) || undefined}
                    aria-pressed={pick === s.k}
                    disabled={busy}
                    onClick={() => tap(s.k)}
                  >
                    {s.state === "painted" && (s.worn ? <Ribbon wearing={wearing} /> : pick === s.k && <PreviewTag />)}
                    <span className={styles.lb}>커스텀 {s.k + 1}</span>
                    <span className={styles.art}>
                      {s.state === "painted" ? (
                        <ItemIcon itemId={id} size={48} dye={s.color} />
                      ) : s.state === "empty" ? (
                        <PixelIcon name="plus" size={18} />
                      ) : (
                        <span className={styles.shadow}>
                          <ItemIcon itemId={id} size={48} />
                        </span>
                      )}
                    </span>
                    {s.state === "painted" ? (
                      <span className={styles.hx}>
                        <span className={styles.chip} style={swatchStyle(s.color)} aria-hidden="true" />
                        {colorText(s.color)}
                      </span>
                    ) : s.state === "empty" ? (
                      <span className={cx(styles.hx, styles.muted)}>비었어요</span>
                    ) : (
                      <span className={cx(styles.hx, styles.gold)}>
                        <PixelIcon name="lock" size={10} />
                        {s.price.toLocaleString("ko-KR")}P
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className={styles.detail} role="status">
                {detailBox}
                <div className={styles.detailText}>
                  <p>{detailTitle}</p>
                  <p className={msg?.error || lockNote ? ui.error : styles.muted}>{msg?.text || detailSub}</p>
                </div>
              </div>

              {picked?.state === "locked" ? (
                <div className={styles.acts}>
                  <button type="button" className={cx(ui.button, styles.goldBtn, styles.grow)} disabled={busy || !next} onClick={() => setBuying(true)}>
                    <PixelIcon name="lock" size={12} />
                    {next ? `${next.price.toLocaleString("ko-KR")}P로 ${next.k === picked.k ? "칸 열기" : `커스텀 ${next.k + 1} 열기`}` : "칸 열기"}
                  </button>
                </div>
              ) : (
                <div className={styles.acts}>
                  {previewing &&
                    (lockLeft > 0 ? (
                      <button type="button" className={cx(ui.button, styles.grow, styles.lockBtn)} disabled>
                        <PixelIcon name="lock" size={12} />
                        {waitLabel(lockLeft)} 뒤에 다시
                      </button>
                    ) : (
                      <button type="button" className={cx(ui.button, ui.primary, styles.grow)} disabled={busy} onClick={() => void wearPick()}>
                        <PixelIcon name="check" size={12} />이 색 입기
                      </button>
                    ))}
                  {picked && (
                    <button type="button" className={cx(ui.button, !previewing && ui.primary, !previewing && styles.grow)} disabled={busy} onClick={() => setSheet(true)}>
                      <PixelIcon name="brush" size={12} />
                      커스텀 {picked.k + 1} 칠하기
                    </button>
                  )}
                  {next && (
                    <button type="button" className={cx(ui.button, styles.goldText)} disabled={busy} onClick={() => setBuying(true)}>
                      <PixelIcon name="lock" size={12} />칸 열기
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className={styles.nodye}>
              <span className={styles.nodyeIcon} aria-hidden="true">
                ⊘
              </span>
              <p className={styles.nodyeTitle}>{noTitle}</p>
              <p className={styles.muted}>{noSub}</p>
              {msg?.error && <p className={ui.error}>{msg.text}</p>}
            </div>
          )}

        </div>

        {sheet && picked && picked.state !== "locked" && (
          <TicketSheet
            me={me}
            slot={picked.k}
            current={picked.state === "painted" ? picked.color : null}
            onClose={() => setSheet(false)}
            onGo={(ticket) => {
              setSheet(false);
              setDye({ ticket, resume: null, auto: ticket.mode === "random" });
            }}
            onResume={(s) => {
              setSheet(false);
              setDye({ ticket: null, resume: s, auto: false });
            }}
          />
        )}
      </div>

      {buying && (
        <SlotOpenDialog
          item={id}
          onClose={() => setBuying(false)}
          onOpened={(k) => {
            setBuying(false);
            setPick(k);
            setMsg({ text: `커스텀 ${k + 1} 칸을 열었어요. 염색권으로 칠해 주세요.` });
          }}
        />
      )}
      {dye && (
        <DyeDialog
          ticket={dye.ticket}
          resume={dye.resume}
          avatar={avatar}
          look={look}
          itemDyes={itemDyes}
          initialTarget={id}
          initialSlot={pick >= 0 ? pick : undefined}
          lockTarget
          autoStart={dye.auto}
          onClose={() => {
            setDye(null);
            // 칠한 칸을 입는다 (빈 칸에 칠하기를 골랐으면 그 칸) → 고른 칸도 그 칸으로
            const w = wornSlot(itemDyes, id);
            if (w >= 0) setPick(w);
          }}
          onDone={onNotice}
        />
      )}
    </Dialog>
  );
}

/** 미리보기 중인 칸 (입은 칸이 아닐 때만) */
function PreviewTag() {
  return <span className={cx(styles.ribbon, styles.previewTag)}>미리보기</span>;
}

function Ribbon({ wearing }: { wearing: boolean }) {
  return (
    <span className={styles.ribbon}>
      <PixelIcon name="check" size={9} />
      {wearing ? "입는 중" : "고른 색"}
    </span>
  );
}

/** 염색권 고르기 (가운데 작은 창): 가진 염색권만. 무작위는 바로 60초 판, 나머지는 예전 염색 화면(색 고르기)으로 */
function TicketSheet({
  me,
  slot,
  current,
  onClose,
  onGo,
  onResume,
}: {
  me: Me;
  slot: number;
  /** 그 칸에 칠해 둔 색 (있으면 덮어 칠한다고 한 줄 알린다 — 실제 확인은 염색 창이 한 번 더 묻는다) */
  current: string | null;
  onClose: () => void;
  onGo: (t: DyeTicket) => void;
  onResume: (s: DyeSessionView) => void;
}) {
  const [defs, setDefs] = useState<Record<string, FixedDyeDef>>({});
  const [session, setSession] = useState<DyeSessionView | null>(null);
  const tickets = itemTickets(me.inventory, defs);
  const [sel, setSel] = useState<string | null>(null);
  const cur = tickets.find((t) => t.id === sel) ?? tickets[0] ?? null;

  useEffect(() => {
    let alive = true;
    dyeApi
      .state()
      .then((s) => {
        if (!alive) return;
        setDefs(s.tickets);
        setSession(s.session);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const go = cur?.ticket.mode === "random" ? "판 시작 · 60초" : cur?.ticket.mode === "pick" ? "색 고르기" : cur?.ticket.mode === "special" ? "특수 색 고르기" : "미리 보고 칠하기";

  return (
    <Dialog title={`커스텀 ${slot + 1}에 무엇으로 칠할까요`} onClose={onClose} kind="confirm">
      <div className={styles.picker}>
        {current ? (
          <p className={styles.muted}>
            <span className={styles.chip} style={swatchStyle(current)} aria-hidden="true" /> 커스텀 {slot + 1}의 {colorText(current)} 위에 덮어 칠해요.
          </p>
        ) : (
          <p className={styles.muted}>비어 있는 커스텀 {slot + 1}에 칠해요.</p>
        )}
        {session && (
          <div className={styles.resume}>
            <span>진행 중인 염색이 있어요. 끝내야 새 판을 시작해요.</span>
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => onResume(session)}>
              이어서 하기
            </button>
          </div>
        )}
        {tickets.length === 0 ? (
          <p className={styles.muted}>염색권이 없어요. 잡화점의 염색·외형에서 살 수 있어요.</p>
        ) : (
          <>
            <ul className={styles.tks} role="radiogroup" aria-label="가진 염색권">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" role="radio" aria-checked={cur?.id === t.id} className={styles.tk} onClick={() => setSel(t.id)}>
                    {t.color ? <span className={styles.tkSw} style={{ background: t.color }} aria-hidden="true" /> : <ItemIcon itemId={t.id} size={32} />}
                    <span className={styles.tkText}>
                      <span>{t.name}</span>
                      <span className={styles.muted}>{t.how}</span>
                    </span>
                    <span className={styles.tkN}>×{t.n}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={cx(ui.button, ui.primary, styles.sheetGo)} disabled={!cur || (!!session && cur.ticket.mode === "random")} onClick={() => cur && onGo(cur.ticket)}>
              {cur ? `${cur.name} · ${go}` : go}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * 가방 목록 한 줄의 작은 색 칸 4개 ([원래 색] [커스텀 1~3]): 보기 전용 (11/22 운영자 — 갈아입기는 아이템 페이지의 색 보관함에서만).
 * 지금 입는 칸에 테두리, 빈 칸은 점선, 잠긴 칸은 빗금
 */
export function MiniColorSlots({ itemId, itemDyes, className }: { itemId: string; itemDyes: ItemDyes | undefined; className?: string }) {
  // 11/22 운영자: 염색이 안 되는 꾸미기(손·오라·발·펫·이름, 연, 보상 모자 등)도 칸은 보여 주되 커스텀 칸을 모두 ×로
  if (!isDyeableCosmetic(itemId)) {
    return (
      <span className={cx(styles.minis, className)} role="img" aria-label="염색 불가 · 원래 색만 입어요">
        <span className={styles.mini} data-worn title="원래 색">
          <ItemIcon itemId={itemId} size={16} />
        </span>
        {[0, 1, 2].map((k) => (
          <span key={k} className={styles.mini} data-state="no" title="염색 불가">
            <PixelIcon name="close" size={8} />
          </span>
        ))}
      </span>
    );
  }
  const worn = wornSlot(itemDyes, itemId);
  const slots = colorSlots(itemDyes, itemId);
  const label = ["원래 색", ...slots.map((s) => `커스텀 ${s.k + 1} ${s.state === "painted" ? colorText(s.color) : s.state === "empty" ? "비었어요" : "잠김"}`)];
  return (
    <span className={cx(styles.minis, className)} role="img" aria-label={`색 보관함: ${label.join(", ")} · ${worn < 0 ? "원래 색" : `커스텀 ${worn + 1}`} 입는 중`}>
      <span className={styles.mini} data-worn={worn < 0 || undefined} title="원래 색">
        <ItemIcon itemId={itemId} size={16} />
      </span>
      {slots.map((s) =>
        s.state === "painted" ? (
          <span key={s.k} className={styles.mini} data-worn={s.worn || undefined} style={swatchStyle(s.color)} title={`커스텀 ${s.k + 1} · ${colorText(s.color)}`} />
        ) : (
          <span key={s.k} className={styles.mini} data-state={s.state} title={s.state === "empty" ? `커스텀 ${s.k + 1} · 비었어요` : `커스텀 ${s.k + 1} · ${s.price.toLocaleString("ko-KR")}P`}>
            {s.state === "locked" && <PixelIcon name="lock" size={8} />}
          </span>
        ),
      )}
    </span>
  );
}
