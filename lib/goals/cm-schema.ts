import { z } from "zod";

/** Замер: 0…200 см с шагом 0,5. */
export const cmSchema = z
  .number({ error: "Замер — от 0 до 200 см, шаг 0,5" })
  .min(0, "Замер — от 0 до 200 см")
  .max(200, "Замер — от 0 до 200 см")
  .refine((v) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9, "Шаг — 0,5 см");
