"use client";

import { useCallback, useEffect, useState } from "react";
import { AWAY_PLACE_LABEL, FRIEND_MAX, MAP_NAME, isAwayMap, mapOf, type AwayMapId, type MapId } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import type { FriendCard, FriendEntry, FriendHouse, FriendListResponse, FriendWhere } from "@/lib/friendTypes";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { useLobby } from "@/lib/hooks/useLobby";
import { friendChannelFullMsg, lobbyChannelFull } from "@/game/net/switchPolicy";
import type { LobbyInfo } from "@tomb/protocol";
import { tabHidden } from "@/lib/hooks/visibleAgain";
import { friendJoinToastOn, friendsApi, friendsStore, isOnline, lastSeenText, setFriendJoinToast } from "@/lib/hooks/useFriends";
import { friendRoute } from "@/lib/friendRoute";
import { myBig } from "@/game/camp/foodState";
import { showFriendNotice } from "../overlay/FriendNotice";
import AvatarThumb from "./AvatarThumb";
import StaffPeople from "./StaffPeople";
import StaffBungeoSchedule from "../bungeo/StaffBungeoSchedule";
import { hopChannel } from "../housing/channelHop";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { EmptyHero } from "../ui/InfoBlocks";
import PixelIcon from "../ui/PixelIcon";
import StyledName from "../ui/StyledName";
import ui from "../ui/ui.module.css";
import styles from "./FriendsDialog.module.css";

/** 친구가 있는 곳 한 줄. myMap = 지금 내 맵 (11/15 같은 채널이어도 맵이 다르면 "여기"가 아니다) */
export function whereText(w: FriendWhere, myCh: number | null, myMap: MapId = "village"): string {
  switch (w.at) {
    case "offline":
      return "접속 안 함";
    case "unknown":
      return "위치를 알 수 없어요";
    case "world":
    {
      const place = MAP_NAME[mapOf(w.map)];
      return w.ch === myCh && mapOf(w.map) === myMap ? `${w.ch}채널 ${place} (여기)` : `${w.ch}채널 ${place}`;
    }
    case "away":
      return `${w.ch}채널 · ${w.place ? AWAY_PLACE_LABEL[w.place] : "실내"}`;
  }
}

/** 친구한테 못 갈 때 안내 */
function cannotGo(name: string, w: FriendWhere): string | null {
  if (w.at === "offline") return `${name}님은 지금 접속하지 않았어요.`;
  if (w.at === "unknown") return "지금은 위치를 알 수 없어요. 잠시 뒤 다시 해 주세요.";
  if (w.at === "away" && w.place === "house") return `${name}님이 어느 집에 있는지 몰라서 따라갈 수 없어요.`;
  if (w.at === "away") return `${name}님은 지금 ${w.place ? AWAY_PLACE_LABEL[w.place] : "실내"}에 있어 따라갈 수 없어요.`;
  return null;
}

/** 친구가 다른 채널에 있고 그 채널이 꽉 찼으면 그 안내 (로비를 이미 아는 동안 [친구한테 가기]를 막는다) */
export function friendFullReason(name: string, w: FriendWhere, myCh: number | null, lobby: LobbyInfo | null): string | null {
  if (w.at !== "world" && w.at !== "away") return null;
  if (w.ch === myCh || !lobbyChannelFull(lobby, w.ch)) return null;
  return friendChannelFullMsg(name);
}

/** 11/26 친구 집 (마을·바닷가·캠핑장 순서, 없는 집은 빠진다). name = 집이 여러 채일 때 자랑거리 이름 */
export function cardHouses(c: FriendCard): { zone: "village" | "sea" | "camp"; name: string; house: FriendHouse }[] {
  const all = [
    { zone: "village" as const, name: "마을 집", house: c.house },
    { zone: "sea" as const, name: "바닷가 집", house: c.seaHouse ?? null },
    { zone: "camp" as const, name: "캠핑장 집", house: c.campHouse ?? null },
  ];
  return all.flatMap((h) => (h.house ? [{ ...h, house: h.house }] : []));
}

/** 집 버튼 글자: 짧은 이름 (예전 응답이면 구역 이름) */
const HOUSE_FALLBACK = { village: "마을 집", sea: "바닷가 집", camp: "캠핑장 집" } as const;

/** 자랑거리 칸들 (꾸미기·집·사냥·도감·최대어). 좁은 화면에서는 줄바꿈된다 */
export function cardStats(c: FriendCard): string[] {
  const houses = cardHouses(c);
  return [
    ...(c.fashion !== undefined ? [`꾸미기 ${c.fashion}점`] : []),
    // 11/25 집이 여러 채(마을·바닷가·11/26 캠핑장)면 모두, 한 채면 「집 N점」
    ...(houses.length === 0
      ? ["집 없음"]
      : houses.length === 1
        ? [`${houses[0].zone === "village" ? "집" : houses[0].name} ${houses[0].house.score.toLocaleString("ko-KR")}점`]
        : houses.map((h) => `${h.name} ${h.house.score.toLocaleString("ko-KR")}점`)),
    `사냥 Lv ${c.hunt}`,
    `도감 ${c.dex}%`,
    c.bigFish ? `최대어 ${c.bigFish.name} ${(c.bigFish.size / 10).toFixed(1)}cm` : "최대어 없음",
  ];
}

function Stats({ card }: { card: FriendCard }) {
  return (
    <ul className={styles.stats}>
      {cardStats(card).map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

type Pending = string | null;

/** 친구한테 가려고 채널을 옮기는 중이면 그 기다림 (창이 닫혀도 이어 간다. 다른 친구한테 가기를 누르면 앞의 것은 그만둔다) */
let hopOff: (() => void) | null = null;
function hopTo(...args: Parameters<typeof hopChannel>): void {
  hopOff?.();
  hopOff = hopChannel(...args);
}

/**
 * 친구 창: 친구 목록(지금 위치·가기·집 놀러 가기·끊기), 받은 신청(수락·거절), 보낸 신청(취소), 접속 알림 켜기·끄기.
 * 친구 신청은 마을에서 다른 사람 캐릭터를 눌러 [친구 신청]. 포인트·아이템 보상은 없다
 */
export default function FriendsDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<FriendListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [joinToast, setJoinToast] = useState(friendJoinToastOn);
  const [loadedAt, setLoadedAt] = useState(0);
  const status = useBridgeValue("net:status");
  const myCh = status?.mode === "online" ? status.channel : null;
  const myMap = mapOf(status?.map);
  const lobby = useLobby().lobby;

  const load = useCallback(
    () =>
      friendsApi.list().then(
        (r) => {
          setData(r);
          setLoadedAt(Date.now());
          setError(null);
          friendsStore.fromList(r);
        },
        (e: unknown) => setError(errorMessage(e)),
      ),
    [],
  );

  useEffect(() => {
    void load();
    // 창이 열려 있는 동안 위치를 30초마다 새로 (숨긴 탭은 받지 않는다)
    const t = setInterval(() => !tabHidden() && void load(), 30_000);
    const off = bridge.on("me:stale", () => void load());
    return () => {
      clearInterval(t);
      off();
    };
  }, [load]);

  /** 버튼 하나 누르기: 누르는 동안 다른 버튼을 막고, 끝나면 목록을 다시 */
  async function act(id: string, run: () => Promise<string | null>) {
    setPending(id);
    setNotice(null);
    try {
      const msg = await run();
      if (msg) setNotice(msg);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(null);
      void load();
    }
  }

  /** 친구한테 가기: 지금 위치를 다시 물어 같은 채널이면 옆으로 순간이동, 다른 채널이면 그 채널로 옮긴 뒤 */
  async function go(f: FriendEntry) {
    setPending(`go:${f.key}`);
    setNotice(null);
    try {
      const now = await friendsApi.where(f.key);
      const w = now.where;
      // 집 안이면 그 집으로 따라 들어간다 (집 방문 흐름 그대로, 들어가면 집 장면이 친구 옆으로 옮긴다)
      if (w.at === "away" && w.place === "house" && w.houseId) {
        if (w.houseBlocked) {
          setNotice(w.houseBlocked);
          showFriendNotice(w.houseBlocked);
          return;
        }
        const houseId = w.houseId;
        const enter = () => {
          bridge.emit("house:follow", { houseId, name: now.name, at: Date.now() });
          bridge.emit("portal:open", { kind: "housing", houseId });
        };
        onClose();
        // 가는 중… 안내는 띄우지 않는다: 도착하면 집 장면이 "도착했어요!"를 한 번만 띄운다
        if (myCh === null || w.ch === myCh) enter();
        // 꽉 찬 채널이면 게임이 옮기지 않고(지금 자리 그대로) 이미 안내했다
        else hopTo(w.ch, myCh, enter, (full) => !full && showFriendNotice(`${w.ch}채널로 옮기지 못했어요. 잠시 뒤 다시 해 주세요.`), { fullMsg: friendChannelFullMsg(now.name) });
        return;
      }
      // 11/19 다른 맵이면 버스를 타야 하는데 바베큐로 몸이 커져 있으면 못 탄다 (채널을 옮기기 전에 막는다 — lib/friendRoute)
      const route = w.at === "world" ? friendRoute(myMap, mapOf(w.map), myBig()) : null;
      const no = cannotGo(f.name, w) ?? (route?.do === "block" ? route.message : null);
      if (no || w.at !== "world") {
        setNotice(no);
        if (no) showFriendNotice(no);
        return;
      }
      // 11/15 맵(마을·캠핑장·바닷가)이 다르면 게임이 버스를 거쳐 간다
      const goto = (x: { sid: number; x: number; y: number; map?: AwayMapId }) => bridge.emit("friend:goto", { sid: x.sid, name: now.name, x: x.x, y: x.y, ...(isAwayMap(x.map) ? { map: x.map } : {}) });
      // 가는 중… 안내 없이 옮기고, 도착하면 게임이 "도착했어요!"를 한 번만 띄운다
      if (w.ch === myCh) {
        onClose();
        goto(w);
        return;
      }
      onClose();
      hopTo(
        w.ch,
        myCh ?? 0,
        // 옮긴 뒤 다시 물어 본다 (그 사이 친구가 움직였을 수 있다)
        () =>
          void friendsApi
            .where(f.key)
            .then((again) => {
              const a = again.where;
              if (a.at === "world" && a.ch === w.ch) bridge.emit("friend:goto", { sid: a.sid, name: again.name, x: a.x, y: a.y, ...(isAwayMap(a.map) ? { map: a.map } : {}) });
              else showFriendNotice(cannotGo(again.name, a) ?? `${again.name}님이 다른 곳으로 옮겼어요.`);
            })
            .catch((e) => showFriendNotice(errorMessage(e))),
        // 꽉 찬 채널이면 게임이 옮기지 않고(지금 자리 그대로) 이미 안내했다
        (full) => !full && showFriendNotice(`${w.ch}채널로 옮기지 못했어요. 잠시 뒤 다시 해 주세요.`),
        { fullMsg: friendChannelFullMsg(now.name) },
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  /** 친구 집 놀러 가기 (분양 사무소의 집 방문 흐름을 그대로 쓴다) */
  function visit(houseId: string) {
    onClose();
    bridge.emit("portal:open", { kind: "housing", houseId });
  }

  const busy = pending !== null;
  // 마지막 접속 상대 시간의 기준 (목록을 받을 때마다 새로 — 렌더 중에 시계를 읽지 않는다)
  const nowMs = data ? loadedAt : 0;
  const friends = data?.friends ?? [];

  // 11/20 운영자 계정은 친구 기능 대신 「접속 중인 사람」과 [순간이동]만
  if (data?.staff)
    return (
      <Dialog title="유저" onClose={onClose}>
        <div className={styles.wrap}>
          <p className={ui.hint} role="status">
            운영자 계정은 친구 기능을 쓸 수 없어요. 대신 접속 중인 사람에게 순간이동할 수 있어요.
          </p>
          <StaffBungeoSchedule />
          <StaffPeople myCh={myCh} myMap={myMap} onClose={onClose} />
        </div>
      </Dialog>
    );

  return (
    <Dialog title="친구" onClose={onClose}>
      <div className={styles.wrap}>
        {data?.me && (
          <section className={styles.mine} aria-label="내 요약">
            <span className={styles.mineTitle}>나</span>
            <Stats card={data.me} />
          </section>
        )}
        <p className={ui.hint}>마을에서 다른 사람 캐릭터를 누르고 [친구 신청]을 보내 보세요. 서로 받아 주면 친구가 돼요.</p>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        {!data && !error && <p className={ui.hint}>불러오는 중…</p>}


        {data && data.incoming.length > 0 && (
          <section className={styles.section} aria-labelledby="friend-in">
            <h3 id="friend-in" className={styles.heading}>
              <span className={styles.redDot} aria-hidden="true" />
              받은 신청 {data.incoming.length}
            </h3>
            <ul className={styles.list}>
              {data.incoming.map((r) => (
                <li key={r.key} className={styles.row}>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.actions}>
                    <button
                      type="button"
                      className={cx(ui.button, ui.primary)}
                      disabled={busy}
                      onClick={() =>
                        void act(`in:${r.key}`, async () => {
                          await friendsApi.answer(r.key, true);
                          return `${r.name}님과 친구가 됐어요!`;
                        })
                      }
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      className={cx(ui.button, ui.quiet)}
                      disabled={busy}
                      onClick={() =>
                        void act(`in:${r.key}`, async () => {
                          await friendsApi.answer(r.key, false);
                          return "신청을 거절했어요.";
                        })
                      }
                    >
                      거절
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && (
          <section className={styles.section} aria-labelledby="friend-list">
            <h3 id="friend-list" className={styles.heading}>
              친구 {friends.length}/{data.max ?? FRIEND_MAX}
            </h3>
            {friends.length === 0 ? (
              <EmptyHero icon="friends" title="아직 친구가 없어요">
                마을에서 다른 사람 캐릭터(이름표)를 누르면 [친구 신청]이 있어요.
              </EmptyHero>
            ) : (
              <ul className={styles.list}>
                {friends.map((f) => {
                  const online = isOnline(f.where);
                  const here = f.where.at === "world" && f.where.ch === myCh && mapOf(f.where.map) === myMap;
                  const full = friendFullReason(f.name, f.where, myCh, lobby);
                  return (
                    <li key={f.key} className={cx(styles.card, !online && styles.offline)}>
                      <div className={styles.top}>
                        {f.card && <AvatarThumb {...f.card.look} label={`${f.name}의 지금 모습`} />}
                        <div className={styles.info}>
                          <div className={styles.head}>
                            <span className={styles.name}>
                              <span className={cx(styles.lamp, online && styles.on)} aria-hidden="true" />
                              <StyledName name={f.name} look={f.card?.look.look} />
                              <span className={styles.heart} aria-hidden="true">
                                ♥
                              </span>
                            </span>
                            <span className={styles.where}>
                              {f.where.at === "offline" ? `마지막 접속 ${lastSeenText(f.lastSeen, nowMs)}` : whereText(f.where, myCh, myMap)}
                            </span>
                          </div>
                          {f.card && <Stats card={f.card} />}
                        </div>
                      </div>
                      {/* 11/25 집마다 버튼 하나: 어느 구역 몇 번인지. 11/26 같은 폭 칸(폰 한 줄 2칸 · PC 3칸) — 짧은 이름 + 작은 둘째 줄(채널), 긴 이름은 title */}
                      {(f.houseId || f.seaHouseId || f.campHouseId) && (
                        <div className={styles.houses}>
                          {(
                            [
                              ["village", f.houseId, f.card?.house],
                              ["sea", f.seaHouseId, f.card?.seaHouse],
                              ["camp", f.campHouseId, f.card?.campHouse],
                            ] as const
                          ).map(([zone, id, h]) =>
                            id ? (
                              <button
                                key={zone}
                                type="button"
                                className={cx(ui.button, styles.houseBtn)}
                                disabled={busy}
                                title={`${h?.label ?? HOUSE_FALLBACK[zone]} 놀러 가기`}
                                aria-label={`${h?.label ?? HOUSE_FALLBACK[zone]} 놀러 가기`}
                                onClick={() => visit(id)}
                              >
                                <span className={styles.houseMain}>
                                  <PixelIcon name="house" />
                                  <span className={styles.houseName}>{h?.short ?? HOUSE_FALLBACK[zone]}</span>
                                </span>
                                {h?.ch ? <span className={styles.houseSub}>{h.ch}채널</span> : null}
                              </button>
                            ) : null,
                          )}
                        </div>
                      )}
                      <div className={styles.actions}>
                        {/* 늘 보인다: 갈 수 없는 곳(사냥터·잡화점·접속 안 함 …)이면 누를 때 이유를 알려 준다 */}
                        <button type="button" className={cx(ui.button, online && !full && ui.primary)} disabled={busy || !!full} title={full ?? undefined} onClick={() => void go(f)}>
                          {f.where.at === "world" && !here ? `친구한테 가기 (${f.where.ch}채널 ${MAP_NAME[mapOf(f.where.map)]})` : "친구한테 가기"}
                        </button>
                        <button
                          type="button"
                          className={cx(ui.button, confirmDrop === f.key ? ui.danger : ui.quiet, styles.drop)}
                          disabled={busy}
                          onClick={() => {
                            if (confirmDrop !== f.key) return setConfirmDrop(f.key);
                            setConfirmDrop(null);
                            void act(`drop:${f.key}`, async () => {
                              await friendsApi.remove(f.key);
                              return `${f.name}님과 친구를 끊었어요.`;
                            });
                          }}
                        >
                          {confirmDrop === f.key ? "정말 끊을까요?" : "삭제"}
                        </button>
                      </div>
                      {full && <p className={ui.hint}>{full}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {data && data.outgoing.length > 0 && (
          <section className={styles.section} aria-labelledby="friend-out">
            <h3 id="friend-out" className={styles.heading}>
              보낸 신청 {data.outgoing.length}
            </h3>
            <ul className={styles.list}>
              {data.outgoing.map((r) => (
                <li key={r.key} className={styles.row}>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.actions}>
                    <span className={styles.meta}>답을 기다리는 중</span>
                    <button
                      type="button"
                      className={cx(ui.button, ui.quiet)}
                      disabled={busy}
                      onClick={() =>
                        void act(`out:${r.key}`, async () => {
                          await friendsApi.cancel(r.key);
                          return "신청을 취소했어요.";
                        })
                      }
                    >
                      취소
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={styles.notice} role="status">
          {notice}
        </p>

        <label className={styles.setting}>
          <input
            type="checkbox"
            checked={joinToast}
            onChange={(e) => {
              setJoinToast(e.target.checked);
              setFriendJoinToast(e.target.checked);
            }}
          />
          친구가 마을에 오면 알려 주기
        </label>

      </div>
    </Dialog>
  );
}
