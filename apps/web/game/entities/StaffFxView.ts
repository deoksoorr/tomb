import * as Phaser from "phaser";
import type { DirId } from "@tomb/protocol";
import { TEX } from "../assets/manifest";
import type { CfxDepth } from "./CosmeticFxView";
import { markCharTint } from "../world/charTint";

// 31번 운영자 계정의 저승사자 차림: 발밑에 은은한 안개. 몸·색·염색은 그 사람이 고른 그대로 (가방·상점에 보이는 모습과 같게).
// 11/16 손에 들던 낫은 거추장스러워서 뺐다 (손 자리 hand는 다시 무언가를 쥐게 될 때를 위해 받아만 둔다).
// 검은 저승사자 모습을 원하면 운영자 전용 몸(저승사자, STAFF_BODIES)을 고른다.
// 이름표는 일반 유저와 같다 (11/15: 장식 판은 칭호와 겹쳐 과해서 뺐다). 머리 위 「운영자」 칭호는 TitleView가 그린다.
// 운영자 표시는 실시간 서버가 입장 토큰(Vercel 서명)에서 받은 것만 오므로 흉내 낼 수 없다.

export type StaffSync = {
  now: number;
  /** 발밑 (표시 기준) */
  x: number;
  y: number;
  dir: DirId;
  /** 손 위치: 발밑에서 옆으로 dx, 위로 up */
  hand: { dx: number; up: number };
  depth: number;
  moving: boolean;
  /** 물속·해먹·눕기처럼 손이 안 보이는 자세 */
  hidden: boolean;
  reduced: boolean;
  /** 11/16 바베큐로 커진 배율 (없으면 1): 발밑 안개를 발밑 기준으로 같이 키운다 */
  scale?: number;
};

export class StaffFxView {
  private readonly fog: Phaser.GameObjects.Image[] = [];
  /** 사냥 화면(scene.data "cfxDepth".staffSoft): 안개를 모두 몸 뒤로 보내고 투명도에 이 값을 곱한다. 마을·집은 1 (그대로) */
  private readonly soft: number | null;
  constructor(scene: Phaser.Scene) {
    this.soft = (scene.data?.get("cfxDepth") as CfxDepth | undefined)?.staffSoft ?? null;
    for (let i = 0; i < 4; i++)
      this.fog.push(
        markCharTint(scene.add.image(0, 0, TEX.glow))
          .setTint(i % 2 ? 0x8a7cb0 : 0x15121c)
          .setBlendMode(i % 2 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setScale(0.5, 0.16),
      );
  }

  sync(s: StaffSync, vis: boolean): void {
    const k = s.scale ?? 1;
    for (let i = 0; i < this.fog.length; i++) {
      const a = s.now / 2100 + i * 1.7;
      const dark = i % 2 === 0;
      const breathe = s.reduced ? 0 : Math.sin(s.now / 900 + i);
      const soft = this.soft;
      const f = this.fog[i];
      if (f.scaleX !== 0.5 * k) f.setScale(0.5 * k, 0.16 * k);
      f.setPosition(s.x + Math.cos(a) * 7 * k, s.y - 1 + Math.sin(a * 1.3) * 1.5 * k)
        .setAlpha((dark ? 0.32 + 0.06 * breathe : 0.1 + 0.04 * breathe) * (soft ?? 1))
        .setDepth(s.depth + (dark ? -0.08 : soft !== null ? -0.07 : 0.08))
        .setVisible(vis && !s.hidden);
    }
  }

  setVisible(v: boolean): void {
    for (const f of this.fog) f.setVisible(v);
  }

  destroy(): void {
    for (const f of this.fog) f.destroy();
  }
}
