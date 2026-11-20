import { zooShopPrice } from "@tomb/protocol";
import { z } from "zod";

/** POST /api/zoo/buy { petId } — 사육사가 파는 펫만 (가격은 서버의 ZOO_PETS 값, 요청에 가격이 없다. 11/20 보리 전용 강아지·고양이 셋은 빠진다) */
export const ZooBuySchema = z.object({ petId: z.string().max(40).refine((id) => zooShopPrice(id) !== null, "동물원에 없는 펫이에요.") });
