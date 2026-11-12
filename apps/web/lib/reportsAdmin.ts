import { CLOSE, ROOM_ID_RE } from "@tomb/protocol";
import { z } from "zod";
import { kickNow, peerOf } from "./ban";
import { listAdminGraves } from "./admin";
import { getHouseStore } from "./housing/service";
import { HttpError } from "./http";
import { REPORT_REASON_LABELS } from "./reports";
import { deleteGrave, displayName, getMegaphone, getStore, NO_NAME } from "./store";
import { kstDay } from "./store/accounts";
import { MEGA_KEEP } from "./store/megaphone";
import {
  caseKey,
  getReportBox,
  REPORT_MEMO_MAX,
  USER_REPORT_REASON_LABELS,
  USER_REPORT_REASONS,
  type CaseMeta,
  type CaseType,
  type ReportCase,
  type ReportNote,
  type Resolution,
} from "./store/reportBox";

// 47번 신고: 게임 안 유저 신고·확성기 신고 받기(POST /api/reports)와 관리자 신고 탭(묘비·방명록·유저·확성기를 한곳에).

const memo = z
  .string()
  .trim()
  .max(REPORT_MEMO_MAX, `메모는 ${REPORT_MEMO_MAX}자까지 적을 수 있어요.`)
  .optional()
  .transform((v) => v ?? "");
const reason = z.enum(USER_REPORT_REASONS, "신고 사유를 골라 주세요.");

export const UserReportSchema = z.discriminatedUnion("type", [
  /** 게임 안 다른 사람 캐릭터: 지금 있는 채널(ch) 또는 방(room)과 그 사람의 sid */
  z.object({
    type: z.literal("user"),
    ch: z.number().int().min(1).max(100).optional(),
    room: z.string().max(60).regex(ROOM_ID_RE).optional(),
    sid: z.number().int().min(0).max(1_000_000),
    reason,
    memo,
  }),
  /** 확성기 한마디 (기록 id) */
  z.object({ type: z.literal("megaphone"), id: z.string().min(1).max(40), reason, memo }),
]);
export type UserReportInput = z.output<typeof UserReportSchema>;

const notFound = (msg: string) => new HttpError(404, "NOT_FOUND", msg);

/** 신고 하나 받기. 같은 대상은 하루 한 번(409), 자기 자신은 안 된다(400) */
export async function submitReport(reporterId: string, input: UserReportInput, now = Date.now()): Promise<void> {
  let meta: CaseMeta;
  if (input.type === "user") {
    if ((input.ch === undefined) === (input.room === undefined)) throw new HttpError(400, "INVALID_INPUT", "어디에 있는 사람인지 알 수 없어요.");
    const where = input.ch !== undefined ? { ch: input.ch } : { room: input.room! };
    const peer = await peerOf(where, input.sid);
    if (!peer) throw notFound("그 사람을 찾지 못했어요. 이미 나갔을 수 있어요.");
    if (peer.visitorId === reporterId) throw new HttpError(400, "INVALID_INPUT", "자기 자신은 신고할 수 없어요.");
    const name = await displayName(peer.visitorId, now).catch(() => peer.name);
    meta = { type: "user", targetId: peer.visitorId, accountId: peer.visitorId, name: name === NO_NAME ? peer.name : name, preview: peer.name };
  } else {
    const rec = (await getMegaphone().recent(MEGA_KEEP)).find((r) => r.id === input.id);
    if (!rec) throw notFound("그 확성기 기록을 찾지 못했어요.");
    if (rec.accountId === reporterId) throw new HttpError(400, "INVALID_INPUT", "자기 확성기는 신고할 수 없어요.");
    meta = { type: "megaphone", targetId: rec.id, accountId: rec.accountId, name: rec.name, preview: rec.text };
  }
  const note: ReportNote = { at: now, reason: input.reason, memo: input.memo, by: reporterId };
  if ((await getReportBox().add(meta, note, kstDay(now))) === "duplicate")
    throw new HttpError(409, "ALREADY_REPORTED", "오늘은 이미 이 대상을 신고했어요. 내일 다시 신고할 수 있어요.");
}

// ── 관리자 신고 탭 ──

/** 신고 탭 한 줄. 묘비·방명록은 원래 저장소의 신고 수를 쓰고, 유저·확성기는 신고함 사건을 그대로 쓴다 */
export type AdminReport = ReportCase & {
  /** 대상이 지금 숨김 상태인지 (묘비·방명록·확성기) */
  hidden: boolean;
  /** 묘비·방명록은 신고 사유(묘비만)만 남아 있다 → notes 대신 사유 요약 */
  reasonSummary: string;
  /** 고를 수 있는 처리 */
  actions: ReportAction[];
};
export const REPORT_ACTIONS = ["hide", "delete", "kick", "dismiss", "resolve"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];
export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  hide: "숨김",
  delete: "삭제",
  kick: "강퇴",
  dismiss: "기각",
  resolve: "처리 완료",
};
const ACTIONS: Record<CaseType, ReportAction[]> = {
  grave: ["hide", "delete", "kick", "dismiss"],
  guestbook: ["hide", "delete", "kick", "dismiss"],
  megaphone: ["hide", "kick", "dismiss"],
  user: ["kick", "dismiss"],
};

export const ReportActionSchema = z.object({
  key: z.string().min(3).max(200),
  action: z.enum(REPORT_ACTIONS),
  note: z.string().trim().max(200).optional(),
});

const summarize = (counts: Map<string, number>, labels: Record<string, string>) =>
  [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${labels[k] ?? k} ${n}`)
    .join(" · ");

type Live = { meta: CaseMeta; count: number; firstAt: number; lastAt: number; hidden: boolean; reasonSummary: string; notes: ReportNote[] };

/** 묘비·방명록: 지금 신고가 남아 있는 것 (사건 키 → 상태) */
async function liveContent(): Promise<Map<string, Live>> {
  const out = new Map<string, Live>();
  const [graves, records] = await Promise.all([listAdminGraves(), getStore().listAll()]);
  const owner = new Map(records.map((r) => [r.id, r.ownerAccountId ?? null]));
  for (const g of graves) {
    if (g.reports <= 0) continue;
    const counts = new Map<string, number>();
    for (const l of g.reportLog) counts.set(l.reason, (counts.get(l.reason) ?? 0) + 1);
    const ats = g.reportLog.map((l) => l.at);
    out.set(caseKey("grave", g.id), {
      meta: {
        type: "grave",
        targetId: g.id,
        accountId: owner.get(g.id) ?? null,
        name: g.name,
        preview: [g.epitaph, g.comment ? `상주의 한마디: ${g.comment}` : "", `상주 ${g.mourner}`].filter(Boolean).join("\n"),
        reporters: g.reports,
      },
      count: Math.max(g.reports, g.reportLog.length),
      firstAt: ats.length ? Math.min(...ats) : g.createdAt,
      lastAt: ats.length ? Math.max(...ats) : g.createdAt,
      hidden: g.hidden,
      reasonSummary: summarize(counts, REPORT_REASON_LABELS),
      notes: [],
    });
  }
  const houses = getHouseStore();
  for (const h of await houses.listAll()) {
    const reports = await houses.guestReports(h.id);
    if (!reports.size) continue;
    for (const e of await houses.guestbook(h.id, true)) {
      const n = reports.get(e.id) ?? 0;
      if (n <= 0) continue;
      out.set(caseKey("guestbook", `${h.id}/${e.id}`), {
        meta: { type: "guestbook", targetId: `${h.id}/${e.id}`, accountId: e.author ?? null, name: e.name, preview: `${h.name}의 방명록: ${e.text}`, reporters: n },
        count: n,
        firstAt: e.at,
        lastAt: e.at,
        hidden: e.hidden,
        reasonSummary: "",
        notes: [],
      });
    }
  }
  return out;
}

/** 신고 탭 목록. open = 처리 대기, done = 처리한 것 (최근 순) */
export async function listReports(status: "open" | "done"): Promise<{ reports: AdminReport[]; openCount: number }> {
  const box = getReportBox();
  const [boxOpen, boxDone, live, mega] = await Promise.all([
    box.list("open", 200),
    box.list("done", 300),
    liveContent(),
    getMegaphone().recent(MEGA_KEEP),
  ]);
  const megaHidden = new Map(mega.map((m) => [m.id, m.hidden]));
  const doneByKey = new Map(boxDone.map((c) => [c.key, c]));

  const fromBox = (c: ReportCase): AdminReport => {
    const counts = new Map<string, number>();
    for (const n of c.notes) counts.set(n.reason, (counts.get(n.reason) ?? 0) + 1);
    return {
      ...c,
      hidden: c.type === "megaphone" ? (megaHidden.get(c.targetId) ?? false) : false,
      reasonSummary: summarize(counts, USER_REPORT_REASON_LABELS),
      actions: ACTIONS[c.type],
    };
  };
  // 묘비·방명록은 처리한 뒤 신고가 더 들어와 수가 늘었을 때만 다시 대기로 본다
  const liveOpen: AdminReport[] = [];
  for (const [key, l] of live) {
    const done = doneByKey.get(key);
    if (done && l.count <= done.count) continue;
    liveOpen.push({
      ...l.meta,
      key,
      count: l.count,
      reporters: l.meta.reporters ?? l.count,
      firstAt: l.firstAt,
      lastAt: l.lastAt,
      status: "open",
      resolution: null,
      notes: l.notes,
      hidden: l.hidden,
      reasonSummary: l.reasonSummary,
      actions: ACTIONS[l.meta.type],
    });
  }
  const openAll = [...boxOpen.map(fromBox), ...liveOpen].sort((a, b) => b.lastAt - a.lastAt);
  if (status === "open") return { reports: openAll, openCount: openAll.length };
  return {
    reports: boxDone.map((c) => {
      const r = fromBox(c);
      return { ...r, hidden: c.type === "megaphone" ? r.hidden : (live.get(c.key)?.hidden ?? false), actions: [] };
    }),
    openCount: openAll.length,
  };
}

function splitKey(key: string): { type: CaseType; targetId: string } {
  const i = key.indexOf(":");
  const type = key.slice(0, i) as CaseType;
  if (i < 1 || !(type in ACTIONS)) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 신고예요.");
  return { type, targetId: key.slice(i + 1) };
}

/** 신고 탭에서 바로 처리. 처리하면 "처리됨"으로 옮기고 처리 기록(누가·무엇을)을 남긴다 */
export async function actOnReport(
  key: string,
  action: ReportAction,
  actor: string,
  note: string | undefined,
  now = Date.now(),
): Promise<{ resolution: Resolution; expelled?: number | null }> {
  const { type, targetId } = splitKey(key);
  if (action !== "resolve" && !ACTIONS[type].includes(action)) throw new HttpError(400, "INVALID_INPUT", "이 신고에는 할 수 없는 처리예요.");
  const box = getReportBox();
  const gone = () => new HttpError(404, "NOT_FOUND", "신고 대상을 찾을 수 없어요. 이미 지워졌을 수 있어요.");

  // 묘비·방명록은 신고함에 사건이 없어서, 처리 기록용 스냅샷을 지금 상태로 만든다
  let snapshot: (CaseMeta & { count: number; firstAt: number; lastAt: number }) | undefined;
  let accountId: string | null = null;
  if (type === "grave" || type === "guestbook") {
    const l = (await liveContent()).get(key);
    if (l) {
      snapshot = { ...l.meta, count: l.count, firstAt: l.firstAt, lastAt: l.lastAt };
      accountId = l.meta.accountId;
    } else {
      accountId = (await box.get(key))?.accountId ?? null;
    }
  } else {
    const c = await box.get(key);
    if (!c) throw gone();
    accountId = c.accountId;
  }

  let expelled: number | null | undefined;
  if (action === "kick") {
    if (!accountId) throw new HttpError(409, "NO_ACCOUNT", "글쓴이 계정을 알 수 없는 예전 글이라 강퇴할 수 없어요.");
    expelled = await kickNow([accountId], CLOSE.KICKED);
  } else if (type === "grave") {
    const store = getStore();
    if (action === "hide" && !(await store.setHidden(targetId, true))) throw gone();
    if (action === "delete" && !(await deleteGrave(store, targetId))) throw gone();
    if (action === "dismiss") await store.resetReports(targetId);
  } else if (type === "guestbook") {
    const [houseId, entryId] = targetId.split("/");
    const houses = getHouseStore();
    if (action === "hide" && !(await houses.setGuestHidden(houseId, entryId, true))) throw gone();
    if (action === "delete" && !(await houses.removeGuest(houseId, entryId))) throw gone();
    // 기각 = 다시 보이게 하고 신고 수를 비운다 (하우징 저장소 규칙)
    if (action === "dismiss") await houses.setGuestHidden(houseId, entryId, false);
  } else if (type === "megaphone") {
    if (action === "hide" && !(await getMegaphone().setHidden(targetId, true))) throw gone();
  }

  const resolution: Resolution = { at: now, by: actor, action: REPORT_ACTION_LABELS[action], ...(note ? { note } : {}) };
  if (!(await box.resolve(key, resolution, snapshot))) throw gone();
  return { resolution, expelled };
}

/** 정지·차단 화면에서 이 신고를 처리했다고 남긴다 (정지로 이동 → 정지 완료) */
export async function markReportBanned(key: string, actor: string, banId: string, now = Date.now()): Promise<void> {
  await actOnReport(key, "resolve", actor, `정지 ${banId}`, now).catch(() => {});
}
