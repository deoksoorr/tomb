import * as Phaser from "phaser";
import { DEPTH } from "../config";
import { CHAR_PROP } from "./charTint";

// 마을 시간대·날씨 색조(곱하기)를 화면 전체를 덮는 곱하기 판 대신 그림을 그리는 셰이더 안에서 곱한다 (11/15).
//  - 예전: 월드를 다 그린 뒤 DEPTH.tint에 화면 크기 곱하기 판 하나 → 그 아래 캐릭터 색까지 똑같이 칙칙해졌다.
//  - 지금: 기본 그리기 파이프라인(Multi/Mobile)을 셰이더만 바꾼 것으로 갈아 끼우고, 그림마다 [맵 색조] 또는 [캐릭터 색조]를 곱한다.
//    캐릭터 그림(markCharTint)은 정점의 tintEffect에 CHAR_FX를 더해 알리므로 같은 묶음(batch)으로 그대로 그려진다 (그리기 호출이 늘지 않는다).
//  - 색조를 곱하는 구간은 월드 장면의 맨 아래(START) ~ DEPTH.tint(END) 사이 그림뿐이다. 경계마다 Extern 하나가 묶음을 비우고 켜고 끈다.
//    어둠(Lighting)·빛·날씨·이름표처럼 그 위 층과 다른 장면(집·사냥터)은 늘 흰색(곱하지 않음)이라 예전과 같다.
//  - 앞뒤 정렬(나무·건물 뒤로 가기)은 그대로다: 캐릭터를 다른 층으로 옮기지 않는다.
//  - 화면 크기 곱하기 판이 하나 없어진다 (내장 그래픽에서 전체 화면 섞기 한 번 줄어듦). Canvas 렌더러면 설치하지 않고 예전 판을 쓴다.

const KEY = "TombWorldTint";
/** tintEffect에 더해 "캐릭터 그림"을 알리는 값 (Phaser는 0 곱하기, 1 단색+텍스처 알파, 2 단색을 쓴다) */
const CHAR_FX = 3;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uWorldTint;
uniform vec3 uCharTint;
varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;
`;

const BODY = `
    float isChar = step(2.5, outTintEffect);
    float effect = outTintEffect - ${CHAR_FX}.0 * isChar;
    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
    vec4 color = texture * texel;
    if (effect > 0.5 && effect < 1.5)
    {
        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
    }
    else if (effect > 1.5)
    {
        color = texel;
    }
    color.rgb *= mix(uWorldTint, uCharTint, isChar);
    gl_FragColor = color;
`;

/** Phaser Multi.frag와 같고 맨 끝에 색조 곱하기만 더했다 (%count%·%forloop%는 Phaser가 텍스처 수만큼 채운다) */
const FRAG_MULTI = `#define SHADER_NAME TOMB_WORLD_TINT_MULTI_FS
${HEAD}
uniform sampler2D uMainSampler[%count%];
varying float outTexId;
void main ()
{
    vec4 texture;
    %forloop%
${BODY}
}
`;

/** Phaser Mobile.frag (모바일 기본 파이프라인, 텍스처 하나)와 같고 색조 곱하기만 더했다 */
const FRAG_MOBILE = `#define SHADER_NAME TOMB_WORLD_TINT_MOBILE_FS
${HEAD}
uniform sampler2D uMainSampler;
void main ()
{
    vec4 texture = texture2D(uMainSampler, outTexCoord);
${BODY}
}
`;

/** 지금 그리는 구간에서 곱할 색. active가 아니면 둘 다 흰색으로 그린다 */
export class WorldTintControl {
  active = false;
  world = 0xffffff;
  char = 0xffffff;

  set(world: number, char: number): void {
    this.world = world;
    this.char = char;
  }
}

type Pipe = Phaser.Renderer.WebGL.Pipelines.MultiPipeline;
type Tex = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | undefined;
type Go = Phaser.GameObjects.GameObject | null;
type Marked = { [CHAR_PROP]?: boolean };

const charFx = (go: Go, fx: number | boolean): number => (go && (go as unknown as Marked)[CHAR_PROP] ? +fx + CHAR_FX : +fx);
const r = (v: number) => ((v >> 16) & 255) / 255;
const g = (v: number) => ((v >> 8) & 255) / 255;
const b = (v: number) => (v & 255) / 255;

const controls = new WeakMap<Phaser.Game, WorldTintControl>();

/**
 * 게임 부팅 직후(postBoot) 한 번: 기본 파이프라인을 색조 셰이더로 갈아 끼운다. WebGL이 아니면 null (예전 곱하기 판을 쓴다).
 * 기본값이 흰색이라 마을 밖 장면은 예전과 똑같이 그려진다.
 */
export function installWorldTint(game: Phaser.Game): WorldTintControl | null {
  const known = controls.get(game);
  if (known) return known;
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
  const pm = renderer.pipelines;
  const P = Phaser.Renderer.WebGL.Pipelines;
  const mobile = pm.default instanceof P.MobilePipeline;
  const ctl = new WorldTintControl();
  let pipe: Pipe;
  try {
    pipe = mobile ? new P.MobilePipeline({ game, name: KEY, fragShader: FRAG_MOBILE }) : new P.MultiPipeline({ game, name: KEY, fragShader: FRAG_MULTI });
  } catch (e) {
    console.error(e);
    return null;
  }
  const quad = pipe.batchQuad;
  const tri = pipe.batchTri;
  pipe.batchQuad = function (go: Go, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, u0: number, v0: number, u1: number, v1: number, tl: number, tr: number, bl: number, br: number, fx: number | boolean, tex?: Tex, unit?: number) {
    return quad.call(this, go, x0, y0, x1, y1, x2, y2, x3, y3, u0, v0, u1, v1, tl, tr, bl, br, charFx(go, fx), tex, unit);
  };
  pipe.batchTri = function (go: Go, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, u0: number, v0: number, u1: number, v1: number, tl: number, tr: number, bl: number, fx: number | boolean, tex?: Tex, unit?: number) {
    return tri.call(this, go, x1, y1, x2, y2, x3, y3, u0, v0, u1, v1, tl, tr, bl, charFx(go, fx), tex, unit);
  };
  // 묶음을 그리기 직전에 지금 구간의 색을 넣는다 (같은 값이면 Phaser가 GL 호출을 건너뛴다)
  pipe.onBeforeFlush = function (this: Pipe) {
    const w = ctl.active ? ctl.world : 0xffffff;
    const c = ctl.active ? ctl.char : 0xffffff;
    this.set3f("uWorldTint", r(w), g(w), b(w));
    this.set3f("uCharTint", r(c), g(c), b(c));
  };
  pm.add(KEY, pipe);
  pm.setDefaultPipeline(KEY);
  controls.set(game, ctl);
  return ctl;
}

/** 이 게임이 셰이더 색조를 쓰면 그 제어 값 (설치 안 됐으면 null) */
export function worldTintOf(game: Phaser.Game): WorldTintControl | null {
  return controls.get(game) ?? null;
}

/**
 * 월드 장면에 색조 구간 경계 둘을 깐다: 맨 아래(모든 그림보다 먼저) 켜고, DEPTH.tint에서 끈다.
 * Extern은 그리기 전에 쌓인 묶음을 비우므로(PipelineManager.clear) 경계 앞 그림은 앞 구간 색으로 그려진다.
 */
export function addWorldTintBounds(scene: Phaser.Scene, ctl: WorldTintControl): void {
  const bound = (depth: number, on: boolean) => {
    const e = scene.add.extern();
    (e as unknown as { render: () => void }).render = () => {
      ctl.active = on;
    };
    e.setDepth(depth);
  };
  bound(-Number.MAX_SAFE_INTEGER, true);
  bound(DEPTH.tint, false);
  // 장면이 끝나면 꺼 둔다 (다음 장면을 흰색으로)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (ctl.active = false));
}

