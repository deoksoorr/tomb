"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useState, useSyncExternalStore } from "react";
import { facadePreview } from "@/game/housing/art";
import { errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import { EXT_SLOTS, FURNITURE, type ExtSlot } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { designScore, exteriorScore } from "@/lib/housing/layout";
import type { HouseExterior, MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { fmt, TitleBadge } from "./parts";

const noop = () => () => undefined;

/** 외관 꾸미기: 지붕·벽·문·울타리·우편함·정원·간판. 마을에서 모두에게 보이고 꾸밈 점수에 더해진다 */
export default function ExteriorDialog({ my, onMy, onSaved, onClose }: { my: MyHouseResponse; onMy: (r: MyHouseResponse) => void; onSaved?: () => void; onClose: () => void }) {
  const house = my.house!;
  const [draft, setDraft] = useState<HouseExterior>(house.exterior);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const client = useSyncExternalStore(noop, () => true, () => false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(house.exterior);
  const score = designScore(house.layout, draft) + house.likes * 3;
  const preview = client ? facadePreview(draft, house.tier, 2) : null;

  async function buy(id: string, name: string) {
    setPending(id);
    setMsg(null);
    try {
      onMy(await housingApi.buyItem(id));
      void meStore.refresh();
      setMsg(`${name}을(를) 샀어요. 입혀 보고 저장하세요.`);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  async function save() {
    setPending("save");
    setMsg(null);
    try {
      onMy(await housingApi.saveExterior(draft));
      setMsg("외관을 저장했어요. 마을에서 모두에게 보여요.");
      onSaved?.();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const set = (slot: ExtSlot, id: string) => setDraft((d) => ({ ...d, [slot]: id }));

  return (
    <Dialog title="외관 꾸미기" onClose={onClose} size="lg">
      <div className={styles.stack}>
        <div className={styles.extTop}>
          <div className={styles.extPreview}>
            {preview && <img src={preview.url} width={preview.w} height={preview.h} alt={`${house.name} 외관 미리보기`} style={{ imageRendering: "pixelated", maxWidth: "100%", height: "auto" }} />}
          </div>
          <div className={styles.stack} style={{ gap: 6 }}>
            <p className={styles.houseName}>
              {house.lot}번지 · {house.name}
            </p>
            <p className={styles.score}>
              꾸밈 점수 <strong>{fmt(score)}</strong> <span className={styles.small}>(외관 +{exteriorScore(draft)})</span>
            </p>
            <TitleBadge score={score} />
            <p className={styles.points}>
              내 포인트 <strong>{fmt(my.points)}P</strong>
            </p>
            <div className={styles.row}>
              <button type="button" className={cx(ui.button, ui.primary)} disabled={!dirty || pending !== null} onClick={save}>
                {pending === "save" ? "저장 중…" : "저장"}
              </button>
              <button type="button" className={ui.button} disabled={!dirty || pending !== null} onClick={() => setDraft(house.exterior)}>
                되돌리기
              </button>
            </div>
          </div>
        </div>
        {EXT_SLOTS.map(({ slot, label, base, baseName }) => {
          const items = FURNITURE.filter((f) => f.ext === slot);
          return (
            <fieldset key={slot} className={styles.extSlot}>
              <legend className={ui.label}>{label}</legend>
              <div className={styles.row}>
                <button type="button" className={styles.extOption} aria-pressed={draft[slot] === base} onClick={() => set(slot, base)}>
                  {baseName}
                  <span className={styles.small}>기본</span>
                </button>
                {items.map((f) => {
                  const owned = (my.inventory[f.id] ?? 0) > 0;
                  return owned ? (
                    <button key={f.id} type="button" className={styles.extOption} aria-pressed={draft[slot] === f.id} onClick={() => set(slot, f.id)} title={f.desc}>
                      {f.name}
                      <span className={styles.small}>꾸밈 +{f.score}</span>
                    </button>
                  ) : (
                    <button
                      key={f.id}
                      type="button"
                      className={cx(styles.extOption, styles.extBuy)}
                      disabled={pending !== null || my.points < f.price}
                      onClick={() => buy(f.id, f.name)}
                      title={f.desc}
                      aria-label={`${f.name}, ${f.price}포인트에 사기`}
                    >
                      {f.name}
                      <span className={styles.small}>
                        {fmt(f.price)}P · 꾸밈 +{f.score}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    </Dialog>
  );
}
