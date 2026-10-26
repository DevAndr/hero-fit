import { Gift, Palette, Swords } from "lucide-react";
import { BestiaryStrip } from "@/components/marketing/game-infographics";
import { Reveal } from "@/components/marketing/motion";
import { PhoneFrame } from "@/components/marketing/v2/phone-frame";
import { BossScreen } from "@/components/marketing/v2/screens/boss-screen";
import { Section, glass } from "@/components/marketing/v2/section";

const PERKS = [
  { icon: Swords, title: "Босс недели", text: "Каждую неделю новый: подходы бьют его по здоровью, рекорд — критический удар. Победа — сундук с опытом." },
  { icon: Gift, title: "Ежедневный сундук", text: "Заглянул в приложение — забери бонус. Мелочь, а возвращаться приятно." },
  { icon: Palette, title: "Скины и титулы", text: "Монеты за тренировки тратятся на темы, рамки и цвет ника, а победы над боссами открывают титулы." },
];

/** «Игра, которая держит»: живой телефон с боссом недели, бонусы и бестиарий. */
export function Game() {
  return (
    <Section
      id="game"
      eyebrow={<><Swords className="size-3.5" /> Игра</>}
      title="Игра, которая держит"
      lead="Мотивация не заканчивается на второй неделе: у тренировок появляются цели, награды и противник."
      className="overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_30%,color-mix(in_oklch,var(--streak)_16%,transparent),transparent_55%)]"
      />
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
        <ul className="grid gap-4">
          {PERKS.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 0.08} className={`${glass} flex gap-4 p-5`}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-streak/15 text-streak">
                <Icon aria-hidden className="size-5" />
              </span>
              <span>
                <span className="block text-lg font-bold">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
              </span>
            </Reveal>
          ))}
        </ul>
        <PhoneFrame label="Босс недели: Железный Голем" tilt="left">
          <BossScreen />
        </PhoneFrame>
      </div>
      <Reveal className="mt-16">
        <p className="mb-5 text-center font-semibold">12 боссов в бестиарии — собери всех</p>
        <BestiaryStrip />
      </Reveal>
    </Section>
  );
}
