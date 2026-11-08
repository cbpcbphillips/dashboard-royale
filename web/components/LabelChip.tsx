import type { LabelKey } from "@/lib/q1";

// Colour-blind-safe hues, always paired with the text (never colour alone).
export const LABEL_COLOR: Record<LabelKey, string> = {
  quiet: "var(--tag-location)",
  lowSample: "var(--tag-thin)",
  down: "var(--tag-downtime)",
  paying: "var(--tag-inspect)",
  unpopular: "var(--tag-machine)",
  normal: "var(--tag-ok)",
};

export function LabelChip({ k, text, title }: { k: LabelKey; text: string; title?: string }) {
  return (
    <span className="chip" title={title}>
      <i style={{ background: LABEL_COLOR[k] }} aria-hidden="true" />
      {text}
    </span>
  );
}
