"use client";

import { useSyncExternalStore } from "react";
import HousingOffice from "@/components/housing/HousingOffice";
import MyHouseDialog from "@/components/housing/MyHouseDialog";

const noop = () => () => undefined;
const params = () => new URLSearchParams(window.location.search).toString();

export default function CampSalePreview() {
  const q = useSyncExternalStore(noop, params, () => null);
  if (q === null) return null;
  const p = new URLSearchParams(q);
  const lot = p.get("lot");
  if (p.get("view") === "myhouse") return <MyHouseDialog channel={3} onGo={() => undefined} onOffice={() => undefined} onClose={() => undefined} />;
  const kind = p.get("kind");
  const camp = kind === "caravan" || kind === "pension" || kind === "rural" ? kind : undefined;
  return <HousingOffice intent={{ zone: "camp", ...(camp ? { camp } : {}), ...(lot ? { lot: Number(lot) } : {}) }} channel={3} onClose={() => undefined} />;
}
