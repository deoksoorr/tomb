import * as Phaser from "phaser";
import { reportClientError } from "@/lib/hooks/errorReporting";

// 지워진 텍스처를 가리키는 그림이 하나라도 남아 있으면 Phaser가 그리다 예외를 던지고(frame.source가 null),
// 예외가 난 프레임 뒤로는 다음 프레임을 예약하지 않아 화면이 그대로 멈춘다 (운영 오류 기록 'glTexture' 18건).
// 그런 그림은 이번 프레임에 건너뛰고, 어떤 텍스처였는지 한 번만 오류 기록에 남긴다.

type SpriteLike = { frame?: { source?: unknown } | null; texture?: { key?: string } | null; type?: string; scene?: { sys?: { settings?: { key?: string } } } };

let installed = false;

export function installRenderGuard(): void {
  if (installed) return;
  installed = true;
  const proto = Phaser.Renderer.WebGL.Pipelines.MultiPipeline.prototype as unknown as { batchSprite: (go: SpriteLike, ...rest: unknown[]) => unknown };
  const orig = proto.batchSprite;
  proto.batchSprite = function (this: unknown, go: SpriteLike, ...rest: unknown[]) {
    if (!go.frame?.source) {
      reportClientError("error", new Error(`지워진 텍스처를 그리려 함: ${go.texture?.key ?? "?"} (${go.type ?? "?"}, ${go.scene?.sys?.settings?.key ?? "?"})`));
      return;
    }
    return orig.call(this, go, ...rest);
  };
}
