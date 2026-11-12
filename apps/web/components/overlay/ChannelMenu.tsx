"use client";

import { useEffect, useState, type FormEvent } from "react";
import { channelStatus, type ChannelInfo, type ChannelStatus } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { lastChannel } from "@/lib/channelHistory";
import { housingApi } from "@/lib/housing/client";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { isChannelSelectable, useLobby } from "@/lib/hooks/useLobby";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { InfoCard, TipList } from "../ui/InfoBlocks";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./ChannelMenu.module.css";

const STATUS_TEXT: Record<ChannelStatus, string> = { ok: "여유", busy: "혼잡", full: "만석" };
/** 같이 있는 사람 닉네임을 몇 명까지 보여 줄지 */
const NAME_PREVIEW = 6;
/** 같이 있는 사람 목록을 다시 묻는 간격 */
const PEERS_POLL_MS = 5_000;

type Props = {
  onClose: () => void;
  /** 내 묘비가 있는 채널들 (묘비마다 하나, 겹칠 수 있다) */
  graveChannels?: readonly number[];
};

/** 내 집이 있는 채널 (없으면 null, 모르면 undefined) */
function useMyHouseChannel(): number | null | undefined {
  const [ch, setCh] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    housingApi
      .mine()
      .then((r) => alive && setCh(r.house?.ch ?? null))
      .catch(() => alive && setCh(null));
    return () => {
      alive = false;
    };
  }, []);
  return ch;
}

/** 지금 같은 채널에 보이는 사람들 닉네임 (게임에 물어본다) */
function usePeerNames(): string[] | null {
  const [names, setNames] = useState<string[] | null>(null);
  useBridgeEvent("peers:list", ({ names: n }) => setNames(n));
  useEffect(() => {
    bridge.emit("peers:ask");
    const t = setInterval(() => bridge.emit("peers:ask"), PEERS_POLL_MS);
    return () => clearInterval(t);
  }, []);
  return names;
}

/**
 * 게임 안 채널 이동. 캐릭터 위치는 게임이 유지한다.
 * 채널마다 큰 카드(인원 막대·혼잡도·지금 여기/마지막에 있던 채널/내 집/내 묘비, 지금 채널은 같이 있는 사람 미리보기)와 채널 안내
 */
export default function ChannelMenu({ onClose, graveChannels = [] }: Props) {
  const lobby = useLobby();
  const status = useBridgeValue("net:status");
  const current = status?.channel ?? null;
  const [choice, setChoice] = useState<number | null>(null);
  const [previous] = useState(() => lastChannel(current));
  const houseCh = useMyHouseChannel();
  const peers = usePeerNames();

  // 골라 둔 채널이 그사이 가득 차면 선택을 푼다
  if (choice !== null && lobby.lobby && !isChannelSelectable(lobby.lobby, choice)) setChoice(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (choice === null) return;
    bridge.emit("channel:switch", { channel: choice });
    onClose();
  }

  const channels = lobby.lobby?.channels.filter((c) => c.open) ?? [];
  const threshold = lobby.lobby?.threshold;
  const graveCount = (id: number) => graveChannels.filter((c) => c === id).length;

  function card(ch: ChannelInfo) {
    const st = channelStatus(ch, threshold);
    const here = ch.id === current;
    const disabled = st === "full" || here;
    const fill = ch.cap > 0 ? Math.min(100, Math.round((ch.count / ch.cap) * 100)) : 0;
    const graves = graveCount(ch.id);
    const left = Math.max(0, ch.cap - ch.count);
    return (
      <label key={ch.id} className={styles.card} data-status={st} data-here={here || undefined} data-disabled={disabled || undefined}>
        <input
          type="radio"
          name="channel"
          className="visually-hidden"
          checked={choice === ch.id}
          disabled={disabled}
          onChange={() => setChoice(ch.id)}
        />
        <span className={styles.top}>
          <span className={styles.chName}>{ch.id}채널</span>
          <span className={styles.status} data-status={here ? "here" : st}>
            {here ? "지금 여기" : STATUS_TEXT[st]}
          </span>
        </span>
        <span className={styles.meter} aria-hidden="true">
          <span className={styles.meterFill} data-status={st} style={{ width: `${fill}%` }} />
        </span>
        <span className={styles.count}>
          {ch.count}/{ch.cap}명 · {st === "full" ? "자리가 없어요" : `${left}자리 남음`}
        </span>
        {(previous === ch.id || houseCh === ch.id || graves > 0) && (
          <span className={styles.badges}>
            {previous === ch.id && <span className={styles.badge}>마지막에 있던 채널</span>}
            {houseCh === ch.id && (
              <span className={styles.badge} data-kind="house">
                <PixelIcon name="house" size={10} /> 내 집
              </span>
            )}
            {graves > 0 && (
              <span className={styles.badge} data-kind="grave">
                <PixelIcon name="grave" size={10} /> 내 묘비{graves > 1 ? ` ${graves}` : ""}
              </span>
            )}
          </span>
        )}
        {here && <PeerPreview names={peers} />}
      </label>
    );
  }

  return (
    <Dialog title="채널 이동" onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.scroll}>
          <div className={styles.legend}>
            <span>채널 고르기</span>
            {lobby.lobby && (
              <span className={styles.total}>
                지금 마을 전체 {lobby.lobby.total}명 · 채널 {channels.length}개
              </span>
            )}
          </div>
          {lobby.status === "loading" && !lobby.lobby && <p className={styles.note}>채널 목록을 불러오는 중…</p>}
          {lobby.status === "unreachable" && <p className={styles.note}>지금은 채널 정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
          <fieldset className={styles.cards}>
            <legend className="visually-hidden">채널</legend>
            {channels.map(card)}
          </fieldset>

          <InfoCard title="채널 안내" icon="info">
            <TipList
              tips={[
                "채널마다 묘역·주거 구역·모닥불이 따로예요. 같은 채널에 있는 사람끼리만 서로 보여요.",
                "채널을 옮겨도 캐릭터는 지금 서 있던 자리 그대로예요. 가방·포인트도 그대로 따라가요.",
                <>
                  <b>혼잡</b>은 곧 찰 수 있다는 뜻이고, <b>만석</b>인 채널은 자리가 날 때까지 고를 수 없어요.
                </>,
                "내 집과 내 묘비는 세운 채널에만 있어요. 카드의 표시를 보고 찾아가세요.",
                "확성기는 그 채널에만, 전체 확성기는 모든 채널에 들려요.",
              ]}
            />
          </InfoCard>
        </div>
        <div className={styles.footer}>
          <button type="submit" className={cx(ui.button, ui.primary, styles.go)} disabled={choice === null}>
            {choice !== null ? `${choice}채널로 이동` : "옮길 채널을 골라 주세요"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** 지금 채널 카드 안: 같이 있는 사람 닉네임 몇 명 */
function PeerPreview({ names }: { names: string[] | null }) {
  if (names === null) return <span className={styles.peers}>같이 있는 사람을 살펴보는 중…</span>;
  if (names.length === 0) return <span className={styles.peers}>지금은 나 혼자 있어요. 확성기로 사람을 불러 보세요.</span>;
  const shown = names.slice(0, NAME_PREVIEW);
  return (
    <span className={styles.peers}>
      <span className={styles.peersLabel}>같이 있는 사람</span>
      <span className={styles.names}>
        {shown.map((n, i) => (
          <span key={`${n}-${i}`} className={styles.peerName}>
            {n}
          </span>
        ))}
        {names.length > shown.length && <span className={styles.more}>외 {names.length - shown.length}명</span>}
      </span>
    </span>
  );
}
