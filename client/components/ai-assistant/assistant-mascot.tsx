import { cn } from "@/lib/utils";

/** The one mascot asset used everywhere in the assistant (all four portals). */
export const MASCOT_SRC = "/assistant/ace-mascot.svg";

export type MascotMood = "idle" | "thinking" | "happy";

/**
 * "Ace", the portal's robot mascot. Blinking, waving and the antenna glow live inside the SVG asset;
 * floating, thinking and greeting motion are applied here. All of it stops under prefers-reduced-motion.
 *
 * `bust` crops to head and shoulders so the face stays readable at small sizes.
 */
export function AssistantMascot({
  size = 64,
  variant = "bust",
  mood = "idle",
  greeting = false,
  animated = true,
  className,
}: {
  size?: number;
  variant?: "bust" | "full";
  mood?: MascotMood;
  /** A small hop to draw attention while the greeting bubble is shown. */
  greeting?: boolean;
  animated?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-mood={mood}
      className={cn(
        "ace-mascot relative inline-block shrink-0 select-none",
        variant === "bust" && "overflow-hidden rounded-full",
        animated && "ace-animated",
        animated && mood === "thinking" && "ace-thinking",
        animated && greeting && "ace-greeting",
        className,
      )}
      style={{ width: size, height: variant === "bust" ? size : Math.round(size * 1.1) }}
    >
      {/* Plain <img> on purpose: next/image would rasterise the SVG and drop its built-in animations. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={MASCOT_SRC}
        alt=""
        draggable={false}
        width={200}
        height={220}
        className={cn(
          "ace-mascot-img pointer-events-none absolute max-w-none",
          variant === "bust" ? "left-[-25%] top-[4%] h-auto w-[150%]" : "inset-0 h-full w-full",
        )}
      />
    </span>
  );
}
