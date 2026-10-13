import type { StaticImageData } from "next/image";
import archer from "@/assets/avatars/archer.png";
import knight from "@/assets/avatars/knight.png";
import mage from "@/assets/avatars/mage.png";
import monk from "@/assets/avatars/monk.png";
import ninja from "@/assets/avatars/ninja.png";
import paladin from "@/assets/avatars/paladin.png";
import phoenix from "@/assets/avatars/phoenix.png";
import pirate from "@/assets/avatars/pirate.png";
import samurai from "@/assets/avatars/samurai.png";
import titan from "@/assets/avatars/titan.png";
import valkyrie from "@/assets/avatars/valkyrie.png";
import viking from "@/assets/avatars/viking.png";

const IMAGES: Record<string, StaticImageData> = {
  "avatar:knight": knight,
  "avatar:viking": viking,
  "avatar:ninja": ninja,
  "avatar:archer": archer,
  "avatar:monk": monk,
  "avatar:mage": mage,
  "avatar:pirate": pirate,
  "avatar:samurai": samurai,
  "avatar:paladin": paladin,
  "avatar:valkyrie": valkyrie,
  "avatar:titan": titan,
  "avatar:phoenix": phoenix,
};

/** Картинка аватара по коду предмета; неизвестный код — null. */
export function avatarImage(code: string | null | undefined): StaticImageData | null {
  return code ? (IMAGES[code] ?? null) : null;
}
