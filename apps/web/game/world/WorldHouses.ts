import { housingApi } from "@/lib/housing/client";
import type { VillageResponse } from "@/lib/housing/types";
import { bridge } from "../bridge";
import { graveChannelFor } from "./graveChannel";
import type { WorldMap } from "./WorldMap";

// 주거 구역 (분양 마을을 메인 맵에 합친 것): 마을 정보를 받아 WorldMap.setHouses로 집을 세운다.
//  - 처음 한 번 + REFRESH_MS마다(탭이 보일 때만) /api/housing/village (CDN 15초 캐시)
//  - 분양 사무소가 분양·외관 저장 뒤 village:data를 보내면 바로 다시 세운다 (내 집 id도 거기서 온다)
//  - 내 집 표시("(내 집)")를 위해 처음 한 번 /api/housing/me를 물어본다 (로그인 전이면 조용히 건너뛴다)
//  - 채널마다 주거 구역이 따로다: 묘지와 같은 규칙(graveChannelFor)으로 지금 채널을 정하고 그 채널 마을만 받는다.
//    채널이 바뀌면 곧바로 빈 필지로 비우고 새 채널 마을을 받는다. 다른 채널 마을 정보(늦게 온 응답 등)는 버린다

const REFRESH_MS = 60_000;

export class WorldHouses {
  private village: VillageResponse | null = null;
  private myHouseId: string | null = null;
  /** 지금 보여 주는 주거 구역의 채널 */
  private ch: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly offs: (() => void)[] = [];
  private alive = true;

  constructor(
    private readonly map: WorldMap,
    /** 집이 바뀌었을 때 (조명 다시 등) */
    private readonly onChange: () => void,
    /** 입장 화면에서 고른 채널 (접속 상태를 아직 모를 때) */
    private readonly startChannel: number | "auto" = "auto",
  ) {
    this.ch = graveChannelFor(bridge.last("net:status"), startChannel);
    const last = bridge.last("village:data");
    if (last) this.use(last.village, last.myHouseId);
    this.offs.push(bridge.on("village:data", ({ village, myHouseId }) => this.use(village, myHouseId)));
    this.offs.push(
      bridge.on("net:status", (st) => {
        const ch = graveChannelFor(st, this.startChannel);
        if (ch === this.ch) return;
        this.ch = ch;
        // 다른 채널의 집이 잠깐이라도 남지 않게 먼저 비우고 새 채널 마을을 받는다
        this.village = null;
        if (this.map.setHouses(null, this.myHouseId)) this.onChange();
        void this.load();
      }),
    );
    void this.load();
    void housingApi
      .mine()
      .then((r) => {
        if (!this.alive) return;
        this.myHouseId = r.house?.id ?? null;
        if (this.village) this.use(this.village, this.myHouseId);
      })
      .catch(() => undefined);
    this.timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void this.load();
    }, REFRESH_MS);
  }

  private async load(): Promise<void> {
    try {
      const v = await housingApi.village(this.ch);
      if (this.alive) this.use(v, this.myHouseId);
    } catch {
      // 마을 정보를 못 받아도 빈 필지로 둔다 (다음 주기에 다시)
      if (this.alive && !this.village) this.use(null, this.myHouseId);
    }
  }

  private use(v: VillageResponse | null, myHouseId: string | null): void {
    // 다른 채널 마을(채널을 옮기는 사이에 늦게 온 응답·분양 사무소가 보낸 다른 채널 정보)은 버린다
    if (v && (v.ch ?? 1) !== this.ch) return;
    if (v) this.village = v;
    this.myHouseId = myHouseId ?? this.myHouseId;
    if (this.map.setHouses(this.village, this.myHouseId)) this.onChange();
  }

  destroy(): void {
    this.alive = false;
    if (this.timer) clearInterval(this.timer);
    for (const off of this.offs) off();
  }
}
