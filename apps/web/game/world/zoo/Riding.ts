import { ridePetOfLook, rideSpeed, type PeerInfo, type Sid } from "@tomb/protocol";
import { bridge } from "../../bridge";
import type { Player } from "../../entities/Player";
import type { RemoteAvatar } from "../../entities/RemoteAvatar";
import type { RealtimeClient } from "../../net/RealtimeClient";
import { BIG_RIDE_TOAST, myBig } from "../../camp/foodState";

// 동물원 타는 펫 (월드 쪽): R 키·타기 버튼(input:ride)으로 올라타고 내린다. 다른 사람에게는 실시간 서버 ride 이벤트로 보인다.
//
// 규칙 (서버 apps/realtime channel.ts onRide와 같다):
//  - 데리고 다니는 펫이 타는 펫이고, 서 있거나 걷는 중(앉기·매달리기·배·물속이 아님)일 때만 올라탄다
//  - 탄 채로 걷기·달리기·점프는 그대로 (속도는 펫마다 rideSpeed배 — 서버 속도 검증 안)
//  - 앉기·낚시·놀이기구·나무·그네·해먹·배처럼 자리를 차지하거나 물에 들어가면 저절로 내린다 (서버도 같은 때 내린다)
//  - 펫을 집에 두거나 타지 못하는 펫으로 바꾸면 내린다
//  - 11/17 저절로 내린 뒤(배·카약·놀이기구·앉기·물) 다시 서 있거나 걸을 수 있게 되면 같은 펫에 저절로 다시 올라탄다 (사용자 피드백: 탔다 내리면 펫에서 내린 채였다).
//    R 키로 직접 내렸거나 펫을 바꿨으면 다시 타지 않는다
// 상태는 bridge "ride:state"(sticky)로 UI 타기 버튼에 알린다.
// 서버 확인: 막 분양 받은 직후에는 착용 증서가 서버 간격(LOOK_INTERVAL_MS, lookPacer) 때문에 늦게 닿아 서버가 올라타기를 거절할 수 있다
// → 내 화면은 바로 타고, 서버가 확인(ride on, 내 sid)해 줄 때까지 RETRY_MS마다 다시 보낸다 (서버는 이미 탔으면 확인만 다시 보낸다).
//   11/17 RETRY_FAST번(착용 증서 간격 10초를 넘는 15초)이 지나도 확인이 없으면 서버가 계속 거절하는 중이라 RETRY_SLOW_MS로 늦춘다 (DO 요청 수 — 끝없이 1.5초마다 보내지 않게)

/** 서버 확인이 없으면 올라타기 요청을 다시 보내는 간격 */
const RETRY_MS = 1_500;
/** 이만큼 다시 보내도 확인이 없으면 간격을 늘린다 */
export const RIDE_RETRY_FAST = 10;
/** 늘린 간격 */
export const RIDE_RETRY_SLOW_MS = 15_000;

export type RidingDeps = {
  player: () => Player;
  net: () => RealtimeClient;
  remotes: () => ReadonlyMap<Sid, RemoteAvatar>;
  toast: (message: string) => void;
};

/** 올라탈 수 있는 자세 (서 있기·걷기·달리기·점프) */
function freeToRide(pl: Player): boolean {
  if (pl.sitting || pl.anchored || pl.inBoat || pl.inCar || pl.inWater) return false;
  const st = pl.state;
  return st === "idle" || st === "walk" || st === "run" || st === "jump";
}

export class Riding {
  private riding = false;
  private lastState = "";
  /** 서버가 내 올라타기를 확인했다 */
  private confirmed = false;
  private sentAt = 0;
  /** 11/17 올라탄 뒤 확인 없이 다시 보낸 횟수 (RIDE_RETRY_FAST를 넘으면 늦춘다) */
  private retries = 0;
  /** 11/17 저절로 내린 펫 — 다시 탈 수 있는 자세가 되면 이 펫에 다시 올라탄다 */
  private resume: string | null = null;

  constructor(private readonly d: RidingDeps) {
    this.publish();
  }

  get on(): boolean {
    return this.riding;
  }

  /** R 키·타기 버튼 */
  toggle(): void {
    this.resume = null;
    if (this.riding) {
      this.dismount(true);
      return;
    }
    const pl = this.d.player();
    const pet = ridePetOfLook(pl.view.wearing);
    if (!pet) {
      this.d.toast("탈 수 있는 펫이 없어요. 타는 펫은 동물원 사육사에게 데려올 수 있어요.");
      return;
    }
    if (pl.inWater) {
      this.d.toast("물속에서는 펫에 올라탈 수 없어요.");
      return;
    }
    if (!freeToRide(pl)) {
      this.d.toast("서 있을 때만 펫에 올라탈 수 있어요.");
      return;
    }
    // 11/15 바베큐로 커진 동안에는 못 탄다 (서버 onRide도 거절)
    if (myBig() > 1) {
      this.d.toast(BIG_RIDE_TOAST);
      return;
    }
    this.mount(pet);
  }

  private mount(pet: string): void {
    const pl = this.d.player();
    this.riding = true;
    pl.rideMul = rideSpeed(pet);
    pl.view.setRiding(true);
    this.retries = 0;
    this.send();
    this.publish();
  }

  private send(): void {
    this.confirmed = false;
    this.sentAt = Date.now();
    this.d.net().ride(true);
  }

  /** 내린다. send = 서버에도 알린다 (서버가 먼저 내렸다고 알려 온 경우엔 보내지 않는다) */
  dismount(send: boolean): void {
    if (!this.riding) return;
    const pl = this.d.player();
    this.riding = false;
    this.confirmed = false;
    pl.rideMul = 1;
    pl.view.setRiding(false);
    if (send) this.d.net().ride(false);
    this.publish();
  }

  /** 11/17 놀거리(제트스키·카약·튜브)에 오르려고 잠깐 내린다 — 다시 설 수 있게 되면 저절로 다시 올라탄다 */
  stepOff(): void {
    if (!this.riding) return;
    const pet = ridePetOfLook(this.d.player().view.wearing);
    this.dismount(true);
    this.resume = pet;
  }

  /** 매 프레임: 자리·물·펫 바꾸기면 내린다, UI 버튼 상태 */
  update(): void {
    const pl = this.d.player();
    if (this.riding) {
      const pet = ridePetOfLook(pl.view.wearing);
      if (!pet) this.dismount(true);
      else if (!freeToRide(pl)) {
        if (pl.inWater) this.d.toast("물에 들어가서 펫에서 내렸어요.");
        this.dismount(true);
        this.resume = pet;
      } else {
        pl.rideMul = rideSpeed(pet);
        // 서버가 아직 확인하지 않았다 (착용 증서가 늦게 닿는 중 등) → 다시 보낸다
        if (!this.confirmed && this.d.net().online && Date.now() - this.sentAt > (this.retries < RIDE_RETRY_FAST ? RETRY_MS : RIDE_RETRY_SLOW_MS)) {
          this.retries++;
          this.send();
        }
      }
    } else if (this.resume) {
      // 내렸던 펫을 그대로 데리고 있고, 다시 탈 수 있는 자세가 되면 다시 올라탄다 (펫을 바꿨으면 그만)
      if (ridePetOfLook(pl.view.wearing) !== this.resume) this.resume = null;
      else if (freeToRide(pl) && myBig() <= 1) {
        const pet = this.resume;
        this.resume = null;
        this.mount(pet);
      }
    }
    this.publish();
  }

  private publish(): void {
    const pl = this.d.player();
    const pet = ridePetOfLook(pl?.view.wearing ?? []);
    const can = !!pet && !!pl && freeToRide(pl);
    const key = `${pet}|${this.riding}|${can}`;
    if (key === this.lastState) return;
    this.lastState = key;
    bridge.emit("ride:state", { pet, riding: this.riding, can });
  }

  /** 접속·재접속 직후: 타고 있었으면 서버에 다시 알린다 */
  onWelcome(): void {
    this.confirmed = false;
    this.retries = 0;
    if (this.riding) this.send();
  }

  /** 서버 알림 (보낸 사람 포함 모두) */
  onRide(sid: Sid, on: boolean): void {
    const net = this.d.net();
    if (sid === net.mySid) {
      if (on) {
        this.confirmed = this.riding;
        this.retries = 0;
      } else if (this.riding) {
        // 방금 다시 올라탔다면 이건 그 전에 보낸 내리기의 확인이다 → 확인을 기다리며 다시 보낸다 (진짜로 못 타는 자세면 update가 내린다)
        if (Date.now() - this.sentAt < 1_000) this.confirmed = false;
        // 서버가 내렸다 (자리·물·펫 바꾸기를 서버가 먼저 봤다) → 화면도 내린다.
        // 자리·배·물 때문이면(지금 못 타는 자세) 일어나면 다시 탄다. 서 있는데 서버가 거절했으면 다시 타지 않는다 (되풀이 막기)
        else {
          const pet = ridePetOfLook(this.d.player().view.wearing);
          this.dismount(false);
          if (pet && !freeToRide(this.d.player())) this.resume = pet;
        }
      }
      return;
    }
    this.d.remotes().get(sid)?.view.setRiding(on);
  }

  /** 늦게 들어왔거나 다시 맞출 때: 입장 정보의 ride */
  applyPeer(r: RemoteAvatar, p: Pick<PeerInfo, "ride">): void {
    r.view.setRiding(p.ride === true);
  }

  /** 씬 정리 (다음 씬에서 버튼이 남지 않게) */
  destroy(): void {
    bridge.emit("ride:state", { pet: null, riding: false, can: false });
  }
}
