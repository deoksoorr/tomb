import { petPrice } from "@tomb/protocol";
import { z } from "zod";

/** POST /api/zoo/buy { petId } — 동물원 펫만 (가격은 서버의 ZOO_PETS 값, 요청에 가격이 없다) */
export const ZooBuySchema = z.object({ petId: z.string().max(40).refine((id) => petPrice(id) !== null, "동물원에 없는 펫이에요.") });
