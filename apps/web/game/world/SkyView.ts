import * as Phaser from "phaser";
import { MAP_HEIGHT, MAP_WIDTH } from "@tomb/protocol";
import { poseBasis, SKY_FOV_Y, type SkyPose } from "./skyMath";

// 놀이기구 2: 3D처럼 보이는 하늘 시점 (관람차 칸·열기구 바구니).
// 월드 카메라가 이번 프레임에 그린 화면(= 보이는 땅을 다 담도록 CameraRig.aerial로 맞춘 맵 사각형)을 그대로 텍스처로 복사해
// 땅바닥 판에 붙이고, 원근 카메라로 내려다본 모습을 같은 캔버스 위에 덮어 그린다 (Phaser가 다 그린 뒤 POST_RENDER, 같은 GL 컨텍스트).
//  - 텍스처는 매 프레임 새로 복사한다 → 모닥불·폭죽·다른 사람·밤 불빛이 실시간으로 보인다
//  - 화면 한 장을 그리는 셰이더 한 번: 시선이 땅에 닿는 곳을 찾아 그 맵 좌표의 색. 멀수록 흐리게(번짐)·안개, 땅에 안 닿으면 하늘
//  - 구름 층(낮은 층·높은 층), 비·눈 줄기, 관람차 창틀·열기구 바구니 테두리를 셰이더가 도트로 그린다
//  - WebGL이 아니거나 셰이더를 못 만들면 supported = false (부르는 쪽이 부드러운 확대 연출로 대신한다)
// GL 상태는 Phaser 파이프라인 관리자로 비우고(clear) 되돌린다(rebind).

export type SkyLook = {
  pose: SkyPose;
  /** 안개가 다 덮는 거리 (맵 px) */
  far: number;
  /** 0 = 테두리 없음, 1 = 관람차 창틀, 2 = 열기구 바구니 */
  frame: 0 | 1 | 2;
  /** 0..1 (검은 화면 → 하늘 시점) */
  fade: number;
  night: number;
  fog: number;
  rain: number;
  snow: number;
  cloud: number;
  /** 시간대 색 (Atmosphere tint, 0xRRGGBB) */
  tint: number;
  /** 열기구 버너 불빛 0..1 */
  burn: number;
  /** 머리 위 풍선 자락이 보이는 정도 0..1 */
  envelope: number;
  /** 풍선 색 (자락 줄무늬) */
  envColors: readonly [number, number];
  /** 구름 흐름·비 (초) */
  time: number;
};

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uPix;
uniform vec3 uCam;
uniform vec3 uR;
uniform vec3 uU;
uniform vec3 uF;
uniform vec2 uTan;
uniform vec4 uView;
uniform vec2 uTexel;
uniform vec2 uMap;
uniform float uFar;
uniform float uNight;
uniform float uFog;
uniform float uRain;
uniform float uSnow;
uniform float uCloud;
uniform float uTime;
uniform float uFade;
uniform float uFrame;
uniform float uBurn;
uniform float uEnv;
uniform vec3 uEnvA;
uniform vec3 uEnvB;
uniform vec3 uTint;
uniform float uMode;
uniform float uCover;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

vec3 horizon() {
  return mix(vec3(0.80, 0.83, 0.86), vec3(0.11, 0.13, 0.21), uNight) * mix(vec3(1.0), uTint, 0.55);
}

vec3 sky(vec3 d) {
  float k = clamp(d.y * 2.4 + 0.04, 0.0, 1.0);
  vec3 day = mix(vec3(0.82, 0.85, 0.88), vec3(0.47, 0.63, 0.82), k);
  vec3 nite = mix(vec3(0.11, 0.13, 0.21), vec3(0.02, 0.03, 0.08), k);
  vec3 c = mix(day, nite, uNight) * mix(vec3(1.0), uTint, 0.55);
  if (uNight > 0.3 && d.y > 0.01) {
    vec2 sp = floor(d.xz / (d.y + 0.35) * 260.0);
    float s = step(0.9965, hash(sp));
    c += s * (uNight - 0.3) * 1.3 * smoothstep(0.01, 0.25, d.y);
  }
  return c;
}

vec2 toUv(vec2 m) {
  return vec2((m.x - uView.x) / uView.z, 1.0 - (m.y - uView.y) / uView.w);
}

vec3 ground(vec2 m, float dist) {
  vec2 inner = clamp(m, vec2(1.0), uMap - 1.0);
  float outd = length(m - inner);
  if (outd > 0.0) {
    // 맵 밖: 가장자리 색을 흐리게 이어 들판·숲이 멀리 이어지는 것처럼, 멀어질수록 안개 속으로
    vec2 e = clamp(toUv(inner), vec2(0.0), vec2(1.0));
    vec3 edge = (texture2D(uTex, e + vec2(6.0, 0.0) * uTexel).rgb + texture2D(uTex, e - vec2(6.0, 0.0) * uTexel).rgb
      + texture2D(uTex, e + vec2(0.0, 6.0) * uTexel).rgb + texture2D(uTex, e - vec2(0.0, 6.0) * uTexel).rgb) * 0.25;
    vec3 field = mix(vec3(0.30, 0.35, 0.26), vec3(0.05, 0.07, 0.09), uNight) * mix(vec3(1.0), uTint, 0.5);
    vec3 c = mix(edge, field, smoothstep(0.0, 140.0, outd)) * (0.82 + 0.3 * fbm(m * 0.02));
    return mix(c, horizon(), smoothstep(60.0, 520.0, outd) * 0.7);
  }
  vec2 uv = toUv(m);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return horizon();
  vec3 c = texture2D(uTex, uv).rgb;
  float blur = clamp((dist - 220.0) / max(1.0, uFar - 220.0), 0.0, 1.0);
  if (blur > 0.01) {
    float r = 0.7 + blur * 2.8;
    vec3 b = texture2D(uTex, uv + vec2(r, r) * uTexel).rgb
      + texture2D(uTex, uv + vec2(-r, r) * uTexel).rgb
      + texture2D(uTex, uv + vec2(r, -r) * uTexel).rgb
      + texture2D(uTex, uv + vec2(-r, -r) * uTexel).rgb;
    c = mix(c, (c + b) / 5.0, blur);
  }
  return c;
}

float cloudAt(vec2 m, float seed) {
  vec2 p = m * 0.0042 + vec2(uTime * 0.012, uTime * 0.005) + seed;
  float n = fbm(p);
  return smoothstep(0.60 - uCloud * 0.22, 0.86, n);
}

vec3 layer(vec3 col, vec3 d, float L, float seed, float tLimit) {
  if ((L - uCam.y) * d.y <= 0.0) return col;
  float tc = (L - uCam.y) / d.y;
  if (tc <= 0.0 || tc >= tLimit) return col;
  vec2 m = uCam.xz + d.xz * tc;
  float hd = tc * length(d.xz);
  float a = cloudAt(m, seed) * (1.0 - smoothstep(uFar * 0.7, uFar * 1.8, hd));
  vec3 cc = mix(vec3(0.96, 0.96, 0.98), vec3(0.17, 0.18, 0.26), uNight) * mix(vec3(1.0), uTint, 0.5);
  return mix(col, cc, a * 0.88);
}

vec4 ferrisFrame(vec2 p, vec2 S) {
  float l = S.x * 0.055;
  float r = S.x * 0.945;
  float b = S.y * 0.2;
  float t = S.y * 0.925;
  float rad = S.y * 0.08;
  vec2 c = clamp(p, vec2(l + rad, b + rad), vec2(r - rad, t - rad));
  float d = length(p - c) - rad;
  float lamp = mix(1.0, 0.42, uNight);
  if (d > 0.0) {
    vec3 wall = vec3(0.40, 0.24, 0.16);
    wall *= 1.0 - 0.22 * step(0.86, fract(p.x / 10.0));
    if (p.y < b) wall *= 0.86 + 0.14 * step(0.5, fract(p.y / 6.0));
    if (d < 2.0) wall = vec3(0.17, 0.10, 0.07);
    else if (d < 3.0) wall = vec3(0.62, 0.40, 0.24);
    return vec4(wall * lamp, 1.0);
  }
  // 손잡이 막대
  if (p.y > b + 2.0 && p.y < b + 4.0 && p.x > l + rad && p.x < r - rad) return vec4(vec3(0.55, 0.56, 0.6) * lamp, 1.0);
  // 유리 반사: 왼쪽 위 구석에 비스듬한 빛 두 줄만 옅게
  float q = p.x + p.y * 0.8 - (l + t * 0.8);
  float corner = 1.0 - smoothstep(S.y * 0.35, S.y * 0.75, length(p - vec2(l, t)));
  float refl = (step(abs(q + S.y * 0.18), 3.0) * 0.06 + step(abs(q + S.y * 0.25), 1.0) * 0.045) * corner;
  return vec4(vec3(1.0), refl);
}

vec4 basketFrame(vec2 p, vec2 S) {
  float xn = p.x / S.x * 2.0 - 1.0;
  float edge = S.y * 0.14 + S.y * 0.03 * (1.0 - xn * xn);
  float lamp = mix(1.0, 0.45, uNight);
  if (p.y < edge) {
    vec2 q = floor(p / vec2(3.0, 2.0));
    float w = mod(q.x + q.y, 2.0);
    vec3 c = mix(vec3(0.64, 0.48, 0.28), vec3(0.47, 0.34, 0.19), w);
    if (p.y > edge - 3.0) c = vec3(0.24, 0.15, 0.08);
    if (p.y > edge - 1.0) c = vec3(0.42, 0.27, 0.15);
    c = c * lamp + uBurn * vec3(0.30, 0.14, 0.03) * (p.y / edge);
    return vec4(c, 1.0);
  }
  float ax = abs(p.x - S.x * 0.5);
  float k = (p.y - edge) / max(1.0, S.y - edge);
  float rx = S.x * 0.41 + k * S.x * 0.15;
  if (abs(ax - rx) < 1.1) {
    vec3 c = vec3(0.33, 0.26, 0.19) * (0.8 + 0.2 * step(0.5, fract(p.y / 3.0)));
    return vec4(c * lamp + uBurn * vec3(0.2, 0.1, 0.02), 1.0);
  }
  if (uEnv > 0.01) {
    float envEdge = S.y * (1.0 - 0.1 * uEnv) + S.y * 0.05 * xn * xn;
    if (p.y > envEdge) {
      vec3 c = mod(floor((xn + 1.0) * 4.0), 2.0) < 0.5 ? uEnvA : uEnvB;
      c *= 0.55 + 0.25 * (1.0 - abs(xn));
      return vec4(c * lamp + uBurn * vec3(0.35, 0.16, 0.04), 1.0);
    }
  }
  return vec4(0.0);
}

void main() {
  if (uMode > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uCover);
    return;
  }
  vec2 dotp = floor(gl_FragCoord.xy / uPix);
  vec2 fc = (dotp + 0.5) * uPix;
  vec2 ndc = fc / uRes * 2.0 - 1.0;
  vec3 d = normalize(uF + uR * ndc.x * uTan.x + uU * ndc.y * uTan.y);
  vec3 col;
  float tHit = 1e9;
  vec3 fogC = horizon();
  if (d.y < -1e-4) tHit = uCam.y / -d.y;
  float hd = tHit * length(d.xz);
  if (tHit < 1e8 && hd < uFar * 1.6) {
    vec2 m = uCam.xz + d.xz * tHit;
    col = ground(m, hd);
    float near = uFar * (0.42 - 0.18 * uFog);
    float f = smoothstep(near, uFar * 1.5, hd);
    f = clamp(f + (0.18 + 0.3 * uFog) * smoothstep(60.0, 320.0, uCam.y) * smoothstep(0.0, uFar, hd), 0.0, 1.0);
    col = mix(col, fogC, f);
  } else {
    col = sky(d);
    tHit = 1e9;
  }
  col = layer(col, d, 360.0, 3.7, tHit);
  col = layer(col, d, 205.0, 11.3, tHit);
  // 구름 층을 지나는 중이면 하얗게
  float inCloud = (1.0 - smoothstep(0.0, 22.0, abs(uCam.y - 205.0))) * 0.55 * (0.4 + uCloud);
  col = mix(col, mix(vec3(0.93), vec3(0.2, 0.21, 0.28), uNight), inCloud);

  vec2 sp = dotp;
  if (uRain > 0.01) {
    // 비: 기울어진 가는 줄기. 줄마다 빠르기·간격이 달라 고르게 찍힌 무늬로 보이지 않게
    float qx = sp.x + sp.y * 0.25;
    float cx = floor(qx / 3.0);
    float rnd = hash(vec2(cx, 7.1));
    float yy = sp.y + uTime * (70.0 + rnd * 40.0) + rnd * 400.0;
    float seg = 26.0 + rnd * 22.0;
    float h = hash(vec2(cx, floor(yy / seg)));
    float fy = fract(yy / seg) * seg;
    float st = step(abs(fract(qx / 3.0) - 0.5), 0.17) * step(1.0 - uRain * 0.5, h) * step(fy, 5.0 + rnd * 4.0);
    col = mix(col, vec3(0.74, 0.8, 0.92), st * 0.4);
  }
  if (uSnow > 0.01) {
    vec2 q = vec2(sp.x + sin(sp.y * 0.06 + uTime * 0.8) * 3.0, sp.y + uTime * 10.0);
    vec2 cell = floor(q / 8.0);
    float h = hash(cell);
    vec2 f = fract(q / 8.0) - 0.5;
    float flake = step(1.0 - uSnow * 0.42, h) * step(length(f), 0.17);
    col = mix(col, vec3(0.95, 0.96, 1.0), flake * 0.9);
  }

  vec2 S = floor(uRes / uPix);
  vec2 pc = dotp + 0.5;
  if (uFrame > 1.5) {
    // 버너 불빛: 화면 위 가운데에서 따뜻하게
    vec2 g = (pc - vec2(S.x * 0.5, S.y * 1.02)) / (S.y * 0.55);
    col += uBurn * vec3(0.55, 0.28, 0.06) * exp(-dot(g, g) * 2.2) * (0.85 + 0.15 * sin(uTime * 23.0));
    vec4 fr = basketFrame(pc, S);
    col = mix(col, fr.rgb, fr.a);
  } else if (uFrame > 0.5) {
    vec4 fr = ferrisFrame(pc, S);
    col = fr.a >= 1.0 ? fr.rgb : col + fr.rgb * fr.a;
  }
  vec2 v = fc / uRes - 0.5;
  col *= 1.0 - dot(v, v) * 0.5;
  gl_FragColor = vec4(col * uFade, 1.0);
}
`;

const UNIFORMS = [
  "uTex", "uRes", "uPix", "uCam", "uR", "uU", "uF", "uTan", "uView", "uTexel", "uMap", "uFar", "uNight", "uFog", "uRain", "uSnow", "uCloud",
  "uTime", "uFade", "uFrame", "uBurn", "uEnv", "uEnvA", "uEnvB", "uTint", "uMode", "uCover",
] as const;
type UniformName = (typeof UNIFORMS)[number];

function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

export class SkyView {
  /** WebGL로 그릴 수 있는지 (아니면 부드러운 확대 연출로 대신) */
  supported = false;
  /** 이번 프레임에 그릴 하늘 시점 (null이면 그리지 않는다) */
  look: SkyLook | null = null;
  /** 하늘 시점에서 나온 직후 화면을 검게 덮는 정도 (1 → 0으로 걷힌다) */
  cover = 0;
  private readonly renderer: Phaser.Renderer.WebGL.WebGLRenderer | null;
  private prog: WebGLProgram | null = null;
  private buf: WebGLBuffer | null = null;
  private tex: WebGLTexture | null = null;
  private texW = 0;
  private texH = 0;
  private aPos = -1;
  private readonly loc = new Map<UniformName, WebGLUniformLocation | null>();
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    const r = scene.game.renderer;
    this.renderer = r instanceof Phaser.Renderer.WebGL.WebGLRenderer ? r : null;
    if (!this.renderer) return;
    this.supported = this.build();
    if (!this.supported) return;
    scene.game.events.on(Phaser.Core.Events.POST_RENDER, this.onPost, this);
    this.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore, this);
  }

  private build(): boolean {
    const r = this.renderer;
    if (!r) return false;
    const gl = r.gl;
    try {
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (!hp || hp.precision <= 0) return false;
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          console.warn("[sky] shader", gl.getShaderInfoLog(s));
          gl.deleteShader(s);
          return null;
        }
        return s;
      };
      const vs = sh(gl.VERTEX_SHADER, VERT);
      const fs = sh(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      const p = gl.createProgram();
      if (!p) return false;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.warn("[sky] link", gl.getProgramInfoLog(p));
        return false;
      }
      this.prog = p;
      this.aPos = gl.getAttribLocation(p, "aPos");
      this.loc.clear();
      for (const n of UNIFORMS) this.loc.set(n, gl.getUniformLocation(p, n));
      this.buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.texW = this.texH = 0;
      // Phaser가 기억하는 프로그램·버퍼와 어긋나지 않게 되돌린다
      r.pipelines.rebind();
      return true;
    } catch (e) {
      console.warn("[sky] init", e);
      return false;
    }
  }

  private onRestore(): void {
    if (this.destroyed) return;
    this.supported = this.build();
  }

  /** 지금 그리는 중인지 (하늘 시점 또는 걷히는 검은 막) */
  get drawing(): boolean {
    return this.supported && (this.look !== null || this.cover > 0.004);
  }

  private onPost(): void {
    const r = this.renderer;
    if (!r || !this.supported || r.contextLost || !this.drawing || !this.prog) return;
    if (r.currentFramebuffer) return;
    const gl = r.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w < 2 || h < 2) return;
    const cam = this.scene.cameras.main;
    const look = this.look;
    r.pipelines.clear();
    const scissor = gl.isEnabled(gl.SCISSOR_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const u = (n: UniformName) => this.loc.get(n) ?? null;
    if (look) {
      // 방금 그린 월드 화면을 텍스처로
      if (w !== this.texW || h !== this.texH) {
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, w, h, 0);
        this.texW = w;
        this.texH = h;
      } else gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
      gl.disable(gl.BLEND);
      const p = look.pose;
      const B = poseBasis(p);
      const ty = Math.tan(SKY_FOV_Y / 2);
      const wv = cam.worldView;
      gl.uniform1i(u("uTex"), 0);
      gl.uniform2f(u("uRes"), w, h);
      gl.uniform1f(u("uPix"), Math.max(2, Math.min(4, Math.round(h / 300))));
      gl.uniform3f(u("uCam"), p.x, p.h, p.z);
      gl.uniform3f(u("uR"), B.r[0], B.r[1], B.r[2]);
      gl.uniform3f(u("uU"), B.u[0], B.u[1], B.u[2]);
      gl.uniform3f(u("uF"), B.f[0], B.f[1], B.f[2]);
      gl.uniform2f(u("uTan"), ty * (w / h), ty);
      gl.uniform4f(u("uView"), wv.x, wv.y, Math.max(1, wv.width), Math.max(1, wv.height));
      gl.uniform2f(u("uTexel"), 1 / w, 1 / h);
      gl.uniform2f(u("uMap"), MAP_WIDTH, MAP_HEIGHT);
      gl.uniform1f(u("uFar"), look.far);
      gl.uniform1f(u("uNight"), look.night);
      gl.uniform1f(u("uFog"), look.fog);
      gl.uniform1f(u("uRain"), look.rain);
      gl.uniform1f(u("uSnow"), look.snow);
      gl.uniform1f(u("uCloud"), look.cloud);
      gl.uniform1f(u("uTime"), look.time);
      gl.uniform1f(u("uFade"), look.fade);
      gl.uniform1f(u("uFrame"), look.frame);
      gl.uniform1f(u("uBurn"), look.burn);
      gl.uniform1f(u("uEnv"), look.envelope);
      gl.uniform3f(u("uEnvA"), ...rgb(look.envColors[0]));
      gl.uniform3f(u("uEnvB"), ...rgb(look.envColors[1]));
      gl.uniform3f(u("uTint"), ...rgb(look.tint));
      gl.uniform1f(u("uMode"), 0);
    } else {
      // 검은 막이 걷히는 중 (월드 화면 위에 반투명 검정)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(u("uRes"), w, h);
      gl.uniform1f(u("uMode"), 1);
      gl.uniform1f(u("uCover"), Math.max(0, Math.min(1, this.cover)));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(this.aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.enable(gl.BLEND);
    if (scissor) gl.enable(gl.SCISSOR_TEST);
    r.pipelines.rebind();
  }

  destroy(): void {
    this.destroyed = true;
    this.look = null;
    this.scene.game.events.off(Phaser.Core.Events.POST_RENDER, this.onPost, this);
    const r = this.renderer;
    if (!r) return;
    r.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore, this);
    if (r.contextLost) return;
    const gl = r.gl;
    if (this.prog) gl.deleteProgram(this.prog);
    if (this.buf) gl.deleteBuffer(this.buf);
    if (this.tex) gl.deleteTexture(this.tex);
    this.prog = this.buf = this.tex = null;
  }
}
