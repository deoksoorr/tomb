"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LobbyInfo } from "@tomb/protocol";
import type { AdminGrave } from "@/lib/admin";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import { isReported } from "./AdminRow";
import { NAV, navGroupOf, navItem, panelFromHash, type PanelId } from "./adminNav";
import { adminApi } from "./adminApi";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import AnalyticsPanel from "./AnalyticsPanel";
import type { BanTarget } from "./BanPanel";
import BansPanel from "./BansPanel";
import CodeLogPanel from "./CodeLogPanel";
import DashboardPanel from "./DashboardPanel";
import DyePanel from "./DyePanel";
import EconomyPanel from "./EconomyPanel";
import ErrorsPanel from "./ErrorsPanel";
import GiftsPanel from "./GiftsPanel";
import GravesPanel from "./GravesPanel";
import HousingPanel from "./HousingPanel";
import MegaphonePanel from "./MegaphonePanel";
import MembersPanel from "./MembersPanel";
import { moderationApi } from "./moderationApi";
import NoticesPanel from "./NoticesPanel";
import { Failed, Loading } from "./PanelState";
import PassedPanel from "./PassedPanel";
import ReportsPanel from "./ReportsPanel";
import ResidentsPanel from "./ResidentsPanel";
import StaffPanel from "./StaffPanel";
import SystemPanel from "./SystemPanel";

type Toast = { id: number; message: string };
/** 메뉴 옆 숫자 배지: alert = 바로 처리할 일(빨강), warn = 살펴볼 것, plain = 참고 숫자 */
type Badge = { n: number; tone: "alert" | "warn" | "plain" };

function useToastList(): [Toast[], (message: string) => void] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }].slice(-3));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3_500);
  }, []);
  return [toasts, push];
}

/** 주소 해시(#members 등)와 지금 화면을 맞춘다. 새로고침·뒤로 가기에도 같은 화면이 열린다 */
function useHashPanel(): [PanelId, (id: PanelId) => void] {
  const [panel, setPanel] = useState<PanelId>("dashboard");
  useEffect(() => {
    const sync = () => setPanel(panelFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const go = useCallback((id: PanelId) => {
    if (window.location.hash !== `#${id}`) window.location.hash = id;
    setPanel(id);
  }, []);
  return [panel, go];
}

export default function AdminApp() {
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [panel, go] = useHashPanel();
  const [menuOpen, setMenuOpen] = useState(false);
  const authLost = useCallback(() => setPhase("login"), []);
  const [graves, setGraves] = useState<AdminGrave[]>([]);
  const [lobby, setLobby] = useState<LobbyInfo | "error" | null>(null);
  const [toasts, toast] = useToastList();
  /** 47번 신고 배지(처리 대기 수, 묘비·방명록·유저·확성기 합계)와 "정지로 이동" 대상 */
  const [reportsOpen, setReportsOpen] = useState<number | null>(null);
  const [activeBans, setActiveBans] = useState<number | null>(null);
  const [errorsToday, setErrorsToday] = useState<number | null>(null);
  const [banPreset, setBanPreset] = useState<BanTarget | null>(null);
  const clearBanPreset = useCallback(() => setBanPreset(null), []);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiRequestError && e.status === 401) setPhase("login");
      else toast(errorMessage(e));
    },
    [toast],
  );

  // 묘비 목록(대시보드 숫자·묘역 묘비 메뉴)은 version이 바뀔 때마다 다시 받는다 (로그인·작업 뒤·새로고침)
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    adminApi.graves().then(
      ({ graves }) => {
        if (!alive) return;
        setGraves(graves);
        setPhase("ready");
        adminApi.channels().then(
          (l) => alive && setLobby(l),
          () => alive && setLobby("error"),
        );
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiRequestError && e.status === 401) return setPhase("login");
        toast(errorMessage(e));
        setPhase((p) => (p === "loading" ? "error" : p));
      },
    );
    return () => {
      alive = false;
    };
  }, [version, toast]);

  // 메뉴 배지 숫자 (실패해도 조용히 넘어간다 — 각 화면에서 다시 보인다)
  useEffect(() => {
    if (phase !== "ready") return;
    let alive = true;
    moderationApi.reports("open").then(
      (r) => alive && setReportsOpen(r.openCount),
      () => {},
    );
    moderationApi.bans().then(
      (r) => alive && setActiveBans(r.bans.filter((b) => b.status === "active").length),
      () => {},
    );
    adminApi.errors(1).then(
      (r) => alive && setErrorsToday(r.errors.length),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [phase, version]);

  // 휴대폰 서랍 메뉴: Esc로 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const logout = async () => {
    await adminApi.logout().catch(() => {});
    setGraves([]);
    setPhase("login");
  };

  const reportedCount = graves.filter(isReported).length;
  const badges: Partial<Record<PanelId, Badge>> = {
    reports: { n: reportsOpen ?? 0, tone: "alert" },
    graves: { n: reportedCount, tone: "warn" },
    bans: { n: activeBans ?? 0, tone: "plain" },
    errors: { n: errorsToday ?? 0, tone: "warn" },
  };
  const choose = (id: PanelId) => {
    go(id);
    setMenuOpen(false);
  };

  if (phase !== "ready") {
    return (
      <div className={cx(styles.page, styles.pageBare)}>
        <main className={styles.main}>
          {phase === "loading" && (
            <div className={styles.login}>
              <Loading>관리 화면을 여는 중…</Loading>
            </div>
          )}
          {phase === "error" && (
            <div className={styles.login}>
              <Failed onRetry={reload}>목록을 불러오지 못했어요.</Failed>
            </div>
          )}
          {phase === "login" && <LoginForm onDone={reload} />}
        </main>
        <Toasts toasts={toasts} />
      </div>
    );
  }

  const item = navItem(panel);
  const p = { toast, onAuthLost: authLost };

  return (
    <div className={styles.page}>
      <aside className={cx(styles.sidebar, menuOpen && styles.sidebarOpen)} aria-label="관리 메뉴">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            묘
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>한때는...</span>
            <span className={styles.brandSub}>관리 도구</span>
          </span>
        </div>
        <nav className={styles.nav}>
          {NAV.map((g) => (
            <div key={g.title} className={styles.navGroup} role="group" aria-labelledby={`nav-${g.title}`}>
              <h2 id={`nav-${g.title}`} className={styles.navGroupTitle}>
                {g.title}
              </h2>
              {g.items.map((i) => {
                const b = badges[i.id];
                return (
                  <a
                    key={i.id}
                    href={`#${i.id}`}
                    className={styles.navItem}
                    aria-current={panel === i.id ? "page" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      choose(i.id);
                    }}
                  >
                    <span className={styles.navLabel}>{i.label}</span>
                    {b && b.n > 0 && (
                      <span
                        className={cx(styles.navBadge, b.tone === "alert" && styles.navBadgeAlert, b.tone === "warn" && styles.navBadgeWarn)}
                        aria-label={`${b.n}건`}
                      >
                        {b.n > 99 ? "99+" : b.n}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFoot}>
          <a className={cx(ui.button, ui.quiet, ui.small)} href="/" target="_blank" rel="noopener noreferrer">
            게임 열기
          </a>
          <button type="button" className={cx(ui.button, ui.small)} onClick={() => void logout()}>
            로그아웃
          </button>
        </div>
      </aside>
      {menuOpen && <button type="button" className={styles.scrim} aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />}

      <main className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={cx(ui.button, ui.icon, styles.menuButton)}
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {(reportsOpen ?? 0) > 0 && <span className={cx(styles.navBadge, styles.navBadgeAlert)}>{reportsOpen}</span>}
          </button>
          <div className={styles.crumb}>
            <span className={styles.crumbGroup}>{navGroupOf(panel).title}</span>
            <h1 className={styles.title}>{item.label}</h1>
          </div>
          <div className={styles.topActions}>
            <button type="button" className={ui.button} onClick={reload} title="숫자·목록을 다시 받아요">
              새로고침
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <p className={styles.lead}>{item.desc}</p>

          {panel === "dashboard" && (
            <DashboardPanel
              {...p}
              lobby={lobby}
              graveCount={graves.length}
              reportedCount={reportedCount}
              reportsOpen={reportsOpen}
              version={version}
            />
          )}
          {panel === "economy" && <EconomyPanel key={version} {...p} />}
          {panel === "analytics" && <AnalyticsPanel {...p} version={version} />}

          {panel === "members" && <MembersPanel key={version} {...p} banPreset={banPreset} onBanPresetUsed={clearBanPreset} />}
          {panel === "codes" && <CodeLogPanel {...p} version={version} />}
          {panel === "staff" && <StaffPanel key={version} {...p} />}

          {panel === "reports" && (
            <ReportsPanel
              key={version}
              {...p}
              onOpenCount={setReportsOpen}
              onBan={(t) => {
                setBanPreset(t);
                go("members");
              }}
            />
          )}
          {panel === "bans" && <BansPanel {...p} version={version} onChanged={reload} />}
          {panel === "megaphone" && <MegaphonePanel key={version} {...p} />}

          {panel === "notices" && <NoticesPanel key={version} {...p} />}
          {panel === "gifts" && <GiftsPanel {...p} />}
          {panel === "dye" && <DyePanel {...p} />}

          {panel === "graves" && <GravesPanel graves={graves} toast={toast} onError={handleError} onChanged={reload} />}
          {panel === "passed" && <PassedPanel key={version} {...p} part="list" onChanged={reload} />}
          {panel === "housing" && <HousingPanel key={version} {...p} />}

          {panel === "residents" && <ResidentsPanel key={version} {...p} />}
          {panel === "graveRules" && <PassedPanel key={version} {...p} part="settings" onChanged={reload} />}

          {panel === "errors" && <ErrorsPanel key={version} {...p} />}
          {panel === "system" && <SystemPanel {...p} />}
        </div>
      </main>

      <Toasts toasts={toasts} />
    </div>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className={styles.toast}>
          {t.message}
        </p>
      ))}
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await adminApi.login(key);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={styles.login} onSubmit={(e) => void submit(e)}>
      <div className={styles.loginBrand}>
        <span className={styles.brandMark} aria-hidden="true">
          묘
        </span>
        <span className={styles.brandText}>
          <span className={styles.brandName}>한때는...</span>
          <span className={styles.brandSub}>관리 도구</span>
        </span>
      </div>
      <label className={ui.field}>
        <span className={ui.label}>관리자 키</span>
        <input
          className={ui.input}
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-invalid={!!error}
          autoFocus
          required
        />
      </label>
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || !key}>
        들어가기
      </button>
      <p className={ui.hint}>이 브라우저에서 12시간 동안 로그인이 유지돼요.</p>
    </form>
  );
}
