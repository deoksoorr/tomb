"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DIFFICULTIES,
  DIFFS,
  GEAR,
  HOTBAR_SIZE,
  POTION_COOLDOWN_MS,
  POTIONS,
  SKILL_FX,
  SKILLS,
  skillById,
  type IconArt,
  type SkillId,
} from "@/lib/rpg/catalog";
import { DEFAULT_BOSS_PHASES, MIN_WINDUP_MS, PATTERNS, type TelegraphShape } from "@/lib/rpg/patterns";
import { HUNT_DROP_ROLLS, KILLS_PER_DROP_ROLL, MIN_RUN_MS } from "@/lib/rpg/rewards";
import { CHAIN_GRACE_MS, FINISHER_EVERY, WEAPON_STYLES, weaponStyleOf } from "@/lib/rpg/weapons";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { DEMO_H, DEMO_SCALE, DEMO_W, drawDemo } from "./huntDemo";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";

// 사냥 안내서: 사냥 로비·멈춤 창에서 연다. 짧은 페이지를 넘겨 본다 (←/→ 키도 된다).
// 숫자·이름은 catalog·patterns·weapons·rewards에서 읽는다 → 스킬·무기·패턴이 늘어도 안내가 따라간다.
// 쪽마다 위에 게임 그림으로 움직이는 짧은 반복 시연이 돈다 (huntDemo). 지금 보는 쪽 것만 돌고, 움직임 줄이기면 정지 그림.

/** 이 쪽의 반복 시연 캔버스 */
function HuntDemo({ page, title }: { page: number; title: string }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    if (reduced) {
      const still = () => drawDemo(ctx, page, 0, true);
      still();
      // 픽셀 글꼴이 늦게 오면 한 번 더 그린다
      void document.fonts?.ready.then(still);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      drawDemo(ctx, page, now - t0, false);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [page, reduced]);
  return (
    <canvas
      ref={ref}
      width={DEMO_W * DEMO_SCALE}
      height={DEMO_H * DEMO_SCALE}
      className={s.guideDemo}
      role="img"
      aria-label={`${title} 시연 그림${reduced ? "" : " (반복 재생)"}`}
    />
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const sec = (ms: number) => `${Number((ms / 1000).toFixed(2))}초`;
const skillArt = (id: SkillId): IconArt | undefined => skillById(id)?.art;
const skillName = (id: SkillId) => skillById(id)?.name ?? id;

/** 바닥 빨간 경고 모양 그림 (원·줄·부채꼴·고리). 64×44 상자 안 가운데 기준 */
function Telegraph({ shape }: { shape: TelegraphShape["kind"] }) {
  const red = "#e0503c";
  const fill = "rgba(224, 80, 60, 0.32)";
  return (
    <svg viewBox="0 0 64 44" width={64} height={44} aria-hidden="true" className={s.guideShape}>
      {shape === "circle" && <ellipse cx={32} cy={24} rx={18} ry={12} fill={fill} stroke={red} strokeWidth={1.5} />}
      {shape === "line" && <rect x={6} y={18} width={52} height={10} fill={fill} stroke={red} strokeWidth={1.5} />}
      {shape === "cone" && <path d="M10 34 L56 12 A 30 30 0 0 1 56 40 Z" fill={fill} stroke={red} strokeWidth={1.5} />}
      {shape === "ring" && (
        <>
          <ellipse cx={32} cy={24} rx={26} ry={16} fill={fill} stroke={red} strokeWidth={1.5} />
          <ellipse cx={32} cy={24} rx={10} ry={6} fill="var(--bg-deep)" stroke={red} strokeWidth={1.5} />
        </>
      )}
      {/* 차오르는 안쪽 (경고가 다 차면 맞는다) */}
      {shape !== "ring" && <ellipse cx={shape === "cone" ? 44 : 32} cy={24} rx={6} ry={4} fill={red} opacity={0.75} />}
    </svg>
  );
}

const SHAPES: [TelegraphShape["kind"], string, string][] = [
  ["circle", "원", "그 자리에 떨어진다 — 원 밖으로"],
  ["line", "줄", "그 줄을 따라 돌진·사격 — 옆으로 비켜서기"],
  ["cone", "부채꼴", "몬스터 앞쪽 — 뒤나 옆으로 돌아가기"],
  ["ring", "고리", "몬스터 둘레 도넛 — 오히려 바짝 붙으면 안전"],
];

/** 모양별 패턴 이름 (PATTERNS에서 읽는다) */
const patternsOf = (k: TelegraphShape["kind"]) =>
  Object.values(PATTERNS)
    .filter((p) => p.shape.kind === k)
    .map((p) => p.name)
    .join("·");

const keyedPotions = POTIONS.filter((p) => p.key);
const autoPotions = POTIONS.filter((p) => !p.key);

function Keys({ k }: { k: string[] }) {
  return (
    <span className={s.guideKeys}>
      {k.map((x) => (
        <kbd key={x}>{x}</kbd>
      ))}
    </span>
  );
}

/** 그림 + 제목 + 설명 한 줄 */
function Item({ art, pic, title, children }: { art?: IconArt; pic?: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <li className={s.guideItem}>
      <span className={s.guidePic}>{pic ?? (art ? <RpgIcon art={art} size={32} /> : null)}</span>
      <div>
        <p className={s.rowName}>{title}</p>
        <p className={s.meta}>{children}</p>
      </div>
    </li>
  );
}

type Page = { title: string; lead: string; body: ReactNode };

function pages(): Page[] {
  const rb = SKILL_FX.rollback(1);
  const ot = SKILL_FX.overtime(1);
  const cr = SKILL_FX.code_review(1);
  const cb = SKILL_FX.coffee_break(1);
  const stunStyles = Object.values(WEAPON_STYLES)
    .filter((w) => w.stunMs > 0)
    .map((w) => w.name);
  const pushStyles = Object.values(WEAPON_STYLES)
    .filter((w) => w.kb > 1)
    .map((w) => w.name);
  return [
    {
      title: "움직이기·공격",
      lead: "공격은 바라보는 쪽으로 나가요. 꾹 누르고 있으면 알아서 계속 때려요.",
      body: (
        <ul className={s.guideList}>
          <Item pic={<Keys k={["W", "A", "S", "D"]} />} title="이동">
            WASD 또는 방향키. 폰은 왼쪽 아래 조이스틱.
          </Item>
          <Item pic={<Keys k={["Space", "J"]} />} title="공격">
            한 번 누르면 한 번. 공격 간격 전에 누르면 다음 공격으로 예약돼요 (발밑 게이지가 초록).
          </Item>
          <Item pic={<Keys k={["꾹"]} />} title="꾹 누르기 = 연속 공격">
            Space·J, 마우스, 손가락을 누르고 있으면 계속 공격해요. 마우스·손가락은 누른 쪽을 향해 쳐요.
          </Item>
          <Item art={GEAR.find((g) => g.kind === "weapon")?.art} title={`${FINISHER_EVERY}번째 연속 공격 = 마무리`}>
            공격 간격 + {sec(CHAIN_GRACE_MS)} 안에 이어 치면 연속으로 세요. {FINISHER_EVERY}번째는 더 넓고 세게 나가요.
          </Item>
          <Item pic={<span className={s.guideGauge} />} title="발밑 게이지">
            공격 대기 시간. 차오르다 다 차면 반짝 — 그때 다시 칠 수 있어요.
          </Item>
          <Item pic={<Keys k={["Esc"]} />} title="멈춤">
            게임 시간이 멈춰요. 멈춤 창에서도 이 안내서를 볼 수 있어요.
          </Item>
        </ul>
      ),
    },
    {
      title: "스킬·포션",
      lead: `스킬은 스킬 탭에서 배우고 단축키 1~${HOTBAR_SIZE}에 놓아야 써요.`,
      body: (
        <>
          <div className={s.guideIcons} aria-hidden="true">
            {SKILLS.slice(0, HOTBAR_SIZE).map((sk, i) => (
              <span key={sk.id} className={s.guideHot}>
                <RpgIcon art={sk.art} size={32} />
                <span>{i + 1}</span>
              </span>
            ))}
          </div>
          <ul className={s.guideList}>
            <Item pic={<Keys k={["1", "…", String(HOTBAR_SIZE)]} />} title="스킬 쓰기">
              숫자 키, 또는 화면 아래 스킬 버튼을 눌러요.
            </Item>
            <Item pic={<span className={s.guideSp}>SP</span>} title="SP">
              스킬마다 SP를 써요. 모자라면 &lsquo;SP가 모자라요&rsquo;가 뜨고 안 나가요. 최대 SP는 INT로 늘고, 에너지드링크·
              {skillName("coffee_break")}로 채워요.
            </Item>
            <Item pic={<span className={s.guideCool} />} title="쿨타임">
              한 번 쓰면 아이콘 위 그림자가 시계 방향으로 걷힐 때까지 다시 못 써요. 스킬마다 다르고 스킬 탭에서 확인해요.
            </Item>
            <Item art={keyedPotions[0]?.art} title={`포션 ${keyedPotions.map((p) => p.key).join("/")}`}>
              {keyedPotions.map((p) => `${p.key} ${p.name}(${p.desc})`).join(" · ")}. 한 번 먹으면 {sec(POTION_COOLDOWN_MS)} 뒤에 또 먹을 수 있어요.
            </Item>
            {autoPotions.map((p) => (
              <Item key={p.id} art={p.art} title={`${p.name} (자동)`}>
                {p.desc}
              </Item>
            ))}
          </ul>
        </>
      ),
    },
    {
      title: "무기별 공격 방식",
      lead: "낀 무기에 따라 공격 모양이 달라요. 장비 탭·상점에서 무기마다 방식이 적혀 있어요.",
      body: (
        <ul className={cx(s.guideList, s.guideGrid)}>
          {Object.values(WEAPON_STYLES).map((w) => (
            <Item key={w.id} art={GEAR.find((g) => g.kind === "weapon" && weaponStyleOf(g).id === w.id)?.art} title={w.name}>
              {w.desc}
            </Item>
          ))}
        </ul>
      ),
    },
    {
      title: "몬스터 패턴",
      lead: "몬스터는 치기 전에 바닥에 빨간 경고를 깔아요. 안쪽이 다 차오르면 맞으니 그 전에 밖으로!",
      body: (
        <>
          <ul className={cx(s.guideList, s.guideGrid)}>
            {SHAPES.map(([k, name, how]) => (
              <Item key={k} pic={<Telegraph shape={k} />} title={name}>
                {how}
                {patternsOf(k) && ` (${patternsOf(k)})`}
              </Item>
            ))}
          </ul>
          <p className={s.meta}>
            어려운 사냥터일수록 경고가 짧고 개수가 많아져요. 그래도 경고는 적어도 {sec(MIN_WINDUP_MS)}는 보여요. 맞은 직후에는 아주 잠깐 무적이에요.
          </p>
        </>
      ),
    },
    {
      title: "우두머리",
      lead: "마지막 웨이브에 우두머리가 나와요. HP가 줄수록 단계가 올라가며 패턴이 늘어요.",
      body: (
        <>
          <ol className={s.guidePhases}>
            <li>
              <b>처음</b>
              <span className={s.meta}>물기·부채 사격·내려찍기 같은 기본 패턴</span>
            </li>
            {DEFAULT_BOSS_PHASES.map((ph) => (
              <li key={ph.below}>
                <b>
                  HP {pct(ph.below)} 아래 · {ph.label}
                </b>
                <span className={s.meta}>
                  {ph.add.map((id) => PATTERNS[id].name).join("·")} 추가 · 패턴 간격 {pct(1 - ph.haste)} 빨라짐
                </span>
              </li>
            ))}
          </ol>
          <ul className={s.guideList}>
            <Item art={skillArt("pair_prog")} title="졸개 부르기">
              단계가 오를 때마다 사냥터마다 정해진 졸개 무리를 부르고, 지형 기믹도 더 거칠어져요. 우두머리 둘레엔 붉은 기운이 돌아요.
            </Item>
            <Item art={skillArt("refactor")} title="잘 안 밀려요">
              우두머리는 넉백·경직이 거의 없고 지형에 느려지지도 않아요. 경고를 보고 빠지는 게 핵심.
            </Item>
          </ul>
        </>
      ),
    },
    {
      title: "상태 이상",
      lead: "화면 위에 지금 걸린 효과와 남은 시간이 떠요.",
      body: (
        <ul className={cx(s.guideList, s.guideGrid)}>
          <Item art={skillArt("rollback")} title="무적">
            {skillName("rollback")}({sec(rb.durMs)}~), 부활 쿠키(2초): 몸이 깜빡이며 어떤 피해도 안 받아요.
          </Item>
          <Item art={skillArt("cache_hit")} title="빨라짐·치명타↑">
            {skillName("cache_hit")}는 이동속도, {skillName("debugging")}는 치명타 확률을 잠깐 올려요.
          </Item>
          <Item art={skillArt("pair_prog")} title="도우미">
            {skillName("pair_prog")}: 동기 유령이 곁에서 같이 때려요.
          </Item>
          <Item art={skillArt("overtime")} title="야근 (공격↑·HP↓)">
            공격력이 오르는 대신 매초 최대 HP의 {pct(ot.hpDrainPct)}를 잃어요. 이걸로 쓰러지지는 않아요 (HP 1에서 멈춤).
          </Item>
          <Item art={skillArt("coffee_break")} title="멈춰 섬">
            {skillName("coffee_break")}를 쓰면 {sec(cb.rootMs)} 동안 움직이지도 공격하지도 못해요.
          </Item>
          <Item art={skillArt("code_review")} title="약화 (몬스터)">
            {skillName("code_review")}: 주변 적이 {sec(cr.durMs)} 동안 받는 피해↑, 이동속도 -{pct(cr.slow)}.
          </Item>
          <Item art={skillArt("refactor")} title="경직·넉백 (몬스터)">
            맞은 몬스터는 잠깐 밀려나고 멈춰요. 치명타는 더 오래.
            {stunStyles.length > 0 && ` ${stunStyles.join("·")}는 경직이 더 길고,`}
            {pushStyles.length > 0 && ` ${pushStyles.join("·")}는 멀리 밀쳐요.`}
          </Item>
          <Item pic={<span className={s.guideMud} />} title="지형">
            늪·덩굴은 느려지고, 컨베이어·바람은 밀고, 웅덩이는 미끄러워요. 사냥터 설명의 기믹을 확인해요.
          </Item>
        </ul>
      ),
    },
    {
      title: "드롭·보상",
      lead: "끝나면 처치한 만큼 EXP, 진행한 만큼 포인트를 받아요. 모든 웨이브를 깨면 포인트 최대.",
      body: (
        <>
          <ul className={s.guideList}>
            <Item art={GEAR.find((g) => g.kind === "acc")?.art} title="드롭">
              {KILLS_PER_DROP_ROLL}마리 잡을 때마다 한 번(한 판 최대 {HUNT_DROP_ROLLS}번) 장비·물약이 나올 기회. 우두머리를 잡고 모든 웨이브를 깨면 장비가
              나올 기회가 한 번 더 있어요.
              <br />
              <small>쓰러지지 않고 다 깨면 아주 가끔 기간제 코디(꾸미기 하루권)가 꾸미기 가방에 들어와요.</small>
            </Item>
            <Item art={POTIONS[0]?.art} title="잘 나오는 것">
              사냥터마다 잘 나오는 장비가 있어요(사냥터 설명). 싼 장비일수록 자주 나와요. 가방이 가득 차면 못 챙겨요.
            </Item>
            <Item art={skillArt("hotfix")} title="쓰러지면">
              포인트는 절반, EXP는 조금 깎여요. 권장 레벨보다 낮으면 조심!
            </Item>
            <Item art={skillArt("debugging")} title="하루 한도">
              사냥 포인트는 하루 한도가 있어요. 넘으면 EXP와 드롭만 받아요. {sec(MIN_RUN_MS)}도 안 된 판은 보상이 없어요.
            </Item>
          </ul>
          <table className={s.guideTable}>
            <thead>
              <tr>
                <th>난이도</th>
                {DIFFICULTIES.map((d) => (
                  <th key={d}>{DIFFS[d].name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>드롭 기회당 확률</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>{pct(DIFFS[d].dropChance)}</td>
                ))}
              </tr>
              <tr>
                <th>우두머리 장비</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>{pct(DIFFS[d].bossDropChance)}</td>
                ))}
              </tr>
              <tr>
                <th>장비 레벨</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>~{DIFFS[d].dropMaxLevel}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </>
      ),
    },
  ];
}

export default function HuntGuide({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const list = pages();
  const n = list.length;
  const go = (d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const p = list[i];
  return (
    <Dialog title="사냥 안내서" onClose={onClose}>
      <div className={s.guide}>
        <div className={s.guideToc} role="tablist" aria-label="안내서 차례">
          {list.map((x, k) => (
            <button key={x.title} type="button" role="tab" aria-selected={k === i} className={s.guideTocBtn} onClick={() => setI(k)}>
              <span>{k + 1}</span>
              {x.title}
            </button>
          ))}
        </div>
        <section className={s.guidePage} role="tabpanel" aria-label={p.title} key={i}>
          <h3 className={s.sectionTitle}>
            {i + 1}. {p.title}
          </h3>
          <HuntDemo page={i} title={p.title} />
          <p className={s.guideLead}>{p.lead}</p>
          {p.body}
        </section>
        <div className={s.guideNav}>
          <button type="button" className={ui.button} onClick={() => go(-1)} disabled={i === 0}>
            ← 이전
          </button>
          <span className={s.meta}>
            {i + 1} / {n}
          </span>
          {i < n - 1 ? (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => go(1)}>
              다음 →
            </button>
          ) : (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={onClose}>
              다 읽었어요
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
