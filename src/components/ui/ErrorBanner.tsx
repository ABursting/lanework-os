"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { errorMessage } from "@/lib/client";

/**
 * One place every failure surfaces, on top of whatever screen you are on.
 *
 * The dashboard applies your clicks locally and lets the network catch up
 * behind them, which is what makes it feel instant — but it also means a
 * failed write can land after you have scrolled past the card, or navigated
 * away from the page, that raised it. An error rendered inside that card is
 * then an error nobody sees, and the optimistic move quietly rolls back with
 * no explanation. This is the safety net for exactly that.
 *
 * Deliberately not a toast: it does not expire. The whole failure mode being
 * guarded against is not being there at the moment it appears, so it waits
 * until dismissed. And deliberately no retry button — repeating a write whose
 * outcome you cannot see is how a thing gets done twice.
 *
 * ── Why the list lives in sessionStorage ────────────────────────────────────
 * The banner sits in the root layout, which ought to mean it survives moving
 * between screens. Measured, it does not. Two things were tried and both
 * failed: React state was lost because some navigations remount the layout's
 * client children, and plain module state was lost too — each route bundle
 * ends up with its own copy of this module, so an error pushed on one screen
 * was written to a store the next screen could not see.
 *
 * sessionStorage is the one place every copy agrees on. It is per-tab, so
 * nothing leaks between windows, and it clears itself when the tab closes.
 * The in-memory listeners are still what makes the banner react instantly;
 * storage is only where the truth is kept.
 *
 * Form validation does NOT come here. "Name is required" belongs beside the
 * field it is about; a banner at the top of the screen is further from the
 * problem than the form already is.
 */

interface AppError {
  id: number;
  /** What you were doing, phrased to follow "Couldn't ". */
  action: string;
  /** The reason, as the server or the browser gave it. */
  detail: string;
  /** The screen it happened on — worth saying, since you may have left it. */
  where: string;
}

// ── The store ───────────────────────────────────────────────────────────────
const KEY = "lanework:errors";
/** A stable empty array: returning a fresh [] every read would loop the hook. */
const EMPTY: AppError[] = [];

const listeners = new Set<() => void>();

/**
 * The last parse, kept so getSnapshot can hand back the same array object
 * when nothing has changed. useSyncExternalStore compares by identity and
 * will re-render forever if handed a fresh array each time.
 */
let cachedRaw: string | null = null;
let cached: AppError[] = EMPTY;

/** Falls back to memory if storage is unavailable (private mode, blocked). */
let memory: AppError[] = EMPTY;
let usable = true;

function read(): AppError[] {
  if (!usable || typeof window === "undefined") return memory;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) {
      cachedRaw = null;
      cached = EMPTY;
      return EMPTY;
    }
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    cached = JSON.parse(raw) as AppError[];
    return cached;
  } catch {
    usable = false;
    return memory;
  }
}

function write(next: AppError[]) {
  memory = next;
  if (usable && typeof window !== "undefined") {
    try {
      if (next.length === 0) window.sessionStorage.removeItem(KEY);
      else window.sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      usable = false;
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function push(action: string, detail: string, where: string) {
  // Ids only have to be unique among what is on screen, and the clock is the
  // one counter every copy of this module already agrees on.
  const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  // Newest on top, and a hard cap: a loop that fails forty times should not
  // bury the screen it is complaining about.
  write([{ id, action, detail, where }, ...read()].slice(0, 4));
}

function dismiss(id: number) {
  write(read().filter((e) => e.id !== id));
}

/** "/crm/tasks" → "Tasks". Only ever cosmetic. */
function screenName(pathname: string): string {
  const named: Record<string, string> = {
    "/": "Home",
    "/crm": "Applications",
    "/crm/applications": "Applications",
    "/crm/companies": "Companies",
    "/crm/contacts": "Contacts",
    "/crm/tasks": "Tasks",
    "/crm/compress": "Compress",
    "/review": "Weekly review",
    "/review/timeline": "Timeline",
    "/brain": "Brain",
  };
  return named[pathname] ?? "Dashboard";
}

/**
 * Call this instead of holding an error in the component.
 *
 * `action` completes the sentence "Couldn't …" and should name the thing, not
 * the mechanism: `delete "Follow up with Ben"`, not `PATCH /api/tasks`.
 */
export function useReportError(): (action: string, err: unknown) => void {
  const pathname = usePathname();
  // Read the path through a ref so the returned callback stays referentially
  // stable — it is called from effects and async work that must not re-run
  // every time you navigate.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  return useCallback((action, err) => {
    const detail = errorMessage(err);
    console.error(`[ui] could not ${action}: ${detail}`, err);
    push(action, detail, screenName(pathRef.current));
  }, []);
}

/** Rendered once, in the root layout, above everything else. */
export function ErrorBanner() {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  if (list.length === 0) return null;

  return (
    // Below the 54px rail so it never covers the navigation, above everything
    // else including dialogs — a save inside a dialog can fail too, and the
    // reason must not render behind it.
    <div
      className="pointer-events-none fixed inset-x-0 top-[62px] z-[60] flex flex-col items-center gap-2 px-4"
      role="alert"
      aria-live="assertive"
    >
      {list.map((e) => (
        <div
          key={e.id}
          className="pointer-events-auto flex w-full max-w-[560px] items-start gap-3 rounded-xl px-[14px] py-[11px] backdrop-blur-[14px]"
          style={{
            background: "color-mix(in oklab, var(--color-danger) 16%, var(--color-surface))",
            border: "1px solid color-mix(in oklab, var(--color-danger) 55%, transparent)",
            boxShadow: "0 10px 30px oklch(0% 0 0 / 0.45)",
          }}
        >
          <span
            className="mt-[2px] flex-none font-mono text-[12px]"
            style={{ color: "var(--color-danger)" }}
            aria-hidden
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] leading-tight">Couldn&rsquo;t {e.action}</div>
            <div className="mt-[3px] text-[11.5px] leading-[1.45] text-dim">{e.detail}</div>
            <div className="mt-[3px] font-mono text-[10px] text-faint">{e.where}</div>
          </div>
          <button
            type="button"
            onClick={() => dismiss(e.id)}
            className="-mr-1 -mt-1 flex-none rounded-md px-[7px] py-[3px] text-[13px] leading-none text-faint transition-colors hover:text-text"
            aria-label="Dismiss"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
