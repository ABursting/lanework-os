import { DEMO_BANNER_TEXT, DEMO_MODE } from "@/lib/demo";

/**
 * The strip across the top of the public demo.
 *
 * It sits above the rail rather than floating over the page, because a visitor
 * needs to read it once on arrival and then forget it — a dismissible toast
 * would be gone by the time they wonder whose data they are looking at, and a
 * fixed overlay would cover the app it is advertising.
 *
 * Styled off the warn hue at low strength: present enough to be read before
 * the first click, quiet enough not to compete with the dashboard underneath.
 * Renders nothing at all on Asher's real deployment.
 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;

  return (
    <div
      role="note"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-edge bg-[color-mix(in_oklab,var(--color-warn)_14%,var(--color-bg))] px-[18px] py-1.5 text-center text-[11px] font-medium tracking-wide text-warn"
    >
      <span aria-hidden="true" className="text-[10px]">
        ●
      </span>
      {DEMO_BANNER_TEXT}
    </div>
  );
}
