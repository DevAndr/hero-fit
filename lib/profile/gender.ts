import { z } from "zod";
import type { Gender } from "@/generated/prisma/enums";

/** Пол в настройках: «Не указан» — null. */
export const GENDER_OPTIONS: { value: Gender | "NONE"; label: string }[] = [
  { value: "MALE", label: "Мужской" },
  { value: "FEMALE", label: "Женский" },
  { value: "NONE", label: "Не указан" },
];

export const genderSchema = z.enum(["MALE", "FEMALE", "NONE"]).transform((v) => (v === "NONE" ? null : v));
