"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ConfirmCapture } from "./ConfirmCapture";
import { ConfirmScreenshot } from "./ConfirmScreenshot";
import { api, errorMessage } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { DEMO_AI_CAP_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { sampleNotes } from "@/lib/demo/sampleNotes";
import type {
  CaptureClassification, RawCapture, ScreenshotClassification,
} from "@/lib/types";

type Staged =
  | { kind: "text"; capture: RawCapture; classification: CaptureClassification }
  | { kind: "screenshot"; capture: RawCapture; classification: ScreenshotClassification };

/** Per original file, before shrinking. Anything bigger is not a screenshot. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Matches MAX_IMAGES in /api/capture/screenshot. */
const MAX_IMAGES = 5;
/**
 * The model scales anything with a longer side past ~1568px down to that
 * anyway, so shrinking here loses nothing it would have read. It keeps five
 * screenshots under Vercel's 4.5MB request limit — one full-resolution Retina
 * screenshot alone could exceed it.
 */
const MAX_EDGE = 1568;
const MAX_TOTAL_CHARS = 4_000_000;

interface Attached {
  id: number;
  dataUrl: string;
  name: string;
}

/** Shrink to MAX_EDGE on the longer side and re-encode as JPEG. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // JPEG has no transparency; a transparent PNG would otherwise turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

let nextId = 1;
/** ~8 lines. Past that the box scrolls rather than swallowing the page. */
const MAX_INPUT_HEIGHT = 168;

/**
 * The floating capture bar — one surface, two input modes.
 *
 * Typed text goes to the classifier; an attached or pasted screenshot goes to
 * the job extractor. Either way the response is a proposal, and a confirm
 * dialog stands between it and the database. This component never writes.
 */
export function CaptureBar() {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Grow the box to fit what is in it, up to a ceiling.
   *
   * The bar was a single-line input, so a long note scrolled sideways out of
   * sight and editing the middle of it meant hunting blind. Height is reset to
   * "auto" first because scrollHeight only ever grows otherwise — without that
   * the box would never shrink back after deleting a paragraph.
   */
  const autoGrow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";

    // Never measure an empty box. The textarea is `flex: 1 1 0%`, so the
    // intrinsic-size pass behind scrollHeight lays it out at its flex-basis of
    // zero — and the placeholder then wraps to one word per line, reporting
    // about a thousand pixels. The bar opened at its full 168px cap on every
    // page load as a result. With no value there is nothing to fit anyway:
    // height:auto plus the CSS min-height is the collapsed state.
    if (!el.value) return;

    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [images, setImages] = useState<Attached[]>([]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<Staged | null>(null);
  // Holds what the bar itself has to say — a file it cannot read, a
  // screenshot with no jobs in it. Failed writes go to the banner.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();

  /*
    How much room the page has to leave at the bottom.

    The bar floats over the page, so every page reserves space for it. That
    space used to be a fixed 96px in the frame while the bar is 110px tall in
    the demo (the sample-note chips add a row) and sits 20px up - so the last
    34px of every page lay underneath it, visible but not clickable. It went
    unnoticed until a page ended in a button: the outreach picker's "check for
    connections" could be seen, and could not be pressed.

    A number copied from one component into another is the bug waiting to come
    back, so the bar measures itself instead and the frame reads the result.
  */
  const shellRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const publish = () => {
      // The gap below the bar is part of what the page must clear.
      const bottomGap = window.innerHeight - shell.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty(
        "--capture-bar-space",
        `${Math.ceil(shell.getBoundingClientRect().height + Math.max(bottomGap, 0))}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(shell);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
    // Once. The observer is what notices the bar growing a row of chips or an
    // error; re-running this on every render would only churn the observer.
  }, []);

  const attach = useCallback(async (files: File[]) => {
    setError(null);
    const room = MAX_IMAGES - imagesRef.current.length;
    if (room <= 0) {
      setError(`That's the limit — ${MAX_IMAGES} screenshots per capture.`);
      return;
    }
    const problems: string[] = [];
    const accepted = files.filter((f) => {
      if (!f.type.startsWith("image/")) {
        problems.push(`${f.name} is not an image.`);
        return false;
      }
      if (f.size > MAX_FILE_BYTES) {
        problems.push(`${f.name} is over 25MB.`);
        return false;
      }
      return true;
    });
    if (accepted.length > room) {
      problems.push(`Only ${room} more fit — ${MAX_IMAGES} screenshots per capture.`);
    }

    const added: Attached[] = [];
    for (const file of accepted.slice(0, room)) {
      try {
        added.push({ id: nextId++, dataUrl: await shrink(file), name: file.name });
      } catch {
        problems.push(`Could not read ${file.name}.`);
      }
    }
    if (added.length > 0) setImages((prev) => [...prev, ...added].slice(0, MAX_IMAGES));
    if (problems.length > 0) setError(problems.join(" "));
  }, []);

  useLayoutEffect(() => {
    autoGrow();
  }, [text, images, autoGrow]);

  // ⌘K focuses the bar from anywhere; a pasted image attaches itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        e.preventDefault();
        void attach(files);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste);
    };
  }, [attach]);

  async function submit() {
    if (busy) return;
    setError(null);

    if (images.length > 0) {
      const total = images.reduce((n, i) => n + i.dataUrl.length, 0);
      if (total > MAX_TOTAL_CHARS) {
        setError("Those screenshots are too large to send together — remove one and try again.");
        return;
      }
      setBusy(true);
      try {
        const res = await api.post<{
          capture: RawCapture;
          classification: ScreenshotClassification | null;
          error?: string;
        }>("/api/capture/screenshot", {
          images: images.map((i) => i.dataUrl),
          note: text.trim() || null,
        });
        if (!res.classification) {
          setError(res.error ?? "Nothing could be read out of that screenshot.");
        } else if (res.classification.jobs.length === 0) {
          setError(
            `No job listings were found in ${images.length === 1 ? "that screenshot" : "those screenshots"}. ` +
              "For a rejection or interview email, paste its text instead.",
          );
        } else {
          setStaged({ kind: "screenshot", capture: res.capture, classification: res.classification });
          setText("");
          setImages([]);
        }
      } catch (err) {
        report("read that screenshot", err);
      } finally {
        setBusy(false);
      }
      return;
    }

    const note = text.trim();
    if (!note) return;
    await submitNote(note);
  }

  /**
   * Send one note. Split out of `submit` so a demo sample chip can send its
   * text directly: setting state and then submitting would read the old value,
   * because state does not land until the next render.
   */
  async function submitNote(note: string) {
    setBusy(true);
    try {
      const res = await api.post<{
        capture: RawCapture;
        classification: CaptureClassification | null;
        error?: string;
      }>("/api/capture", { text: note });
      if (!res.classification) {
        setError(res.error ?? "The note was saved but could not be classified.");
        setText("");
      } else {
        setStaged({ kind: "text", capture: res.capture, classification: res.classification });
        setText("");
      }
    } catch (err) {
      /*
        The demo's daily allowance running out is not a failure — it is the
        demo behaving as designed — so it belongs in the bar's own message
        area beside the thing it is about, like "no jobs in that screenshot",
        rather than in the error banner that rule 8 reserves for failed writes.
      */
      if (DEMO_MODE && errorMessage(err) === DEMO_AI_CAP_MESSAGE) {
        setError(DEMO_AI_CAP_MESSAGE);
      } else {
        report("save that capture", err);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        ref={shellRef}
        className="pointer-events-none fixed bottom-5 left-1/2 z-40 w-[min(900px,calc(100vw-48px))] -translate-x-1/2"
      >
        {error ? (
          // Always dismissable. It used to clear only on the next capture, so
          // a "no jobs found" sat over the page with no way to close it.
          <div
            className="pointer-events-auto mb-2 flex items-start gap-3 rounded-[10px] px-3 py-2 text-[12.5px] backdrop-blur-[18px]"
            style={{
              color: "var(--color-danger)",
              background: "color-mix(in oklab, var(--color-danger) 14%, transparent)",
              border: "1px solid color-mix(in oklab, var(--color-danger) 34%, transparent)",
            }}
            role="alert"
          >
            <p className="m-0 flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="flex-none leading-none opacity-70 transition-opacity hover:opacity-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ) : null}

        {DEMO_MODE && !text && images.length === 0 && !busy ? (
          /*
            The demo's free samples. Each one is answered from a recording, so
            clicking it opens the real confirm screen instantly and costs
            nothing — which is what keeps a public capture bar affordable.
            Hidden as soon as there is anything in the box, so they never sit
            between the operator and what they are writing.
          */
          <div className="pointer-events-auto mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-faint">Try a sample:</span>
            {sampleNotes().map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => void submitNote(sample.text)}
                title={sample.text}
                className="rounded-full px-2.5 py-1 text-[11.5px] text-dim backdrop-blur-[18px] transition-colors hover:text-text"
                style={{
                  background: "color-mix(in oklab, var(--color-surface) 78%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--color-accent) 26%, transparent)",
                }}
              >
                {sample.label}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className="pointer-events-auto flex items-end gap-[10px] rounded-[14px] py-[9px] pl-[14px] pr-[10px] backdrop-blur-[22px]"
          style={{
            background: "color-mix(in oklab, var(--color-surface) 78%, transparent)",
            border: "1px solid color-mix(in oklab, var(--color-accent) 28%, transparent)",
            boxShadow:
              "0 18px 46px oklch(0% 0 0 / 0.6), inset 0 1px 0 color-mix(in oklab, var(--color-text) 6%, transparent)",
          }}
        >
          <span
            className="mb-[7px] size-[7px] flex-none rounded-full"
            style={{
              background: busy ? "var(--color-warn)" : "var(--color-accent)",
              boxShadow: `0 0 10px ${busy ? "var(--color-warn)" : "var(--color-accent)"}`,
              animation: busy ? "pulse 1.2s ease-in-out infinite" : undefined,
            }}
            aria-hidden
          />

          {images.length > 0 ? (
            <span className="flex max-w-[45%] flex-none flex-wrap gap-[6px]">
              {images.map((img) => (
                <span
                  key={img.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-[11.5px]"
                  style={{ background: "color-mix(in oklab, var(--color-accent) 14%, transparent)" }}
                >
                  <span className="max-w-[120px] truncate">{img.name}</span>
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                    className="text-faint hover:text-text"
                    aria-label={`Remove ${img.name}`}
                    disabled={busy}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </span>
          ) : null}

          <textarea
            ref={inputRef}
            rows={1}
            className="input min-h-[26px] flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-[1.5]"
            style={{ maxHeight: MAX_INPUT_HEIGHT }}
            placeholder={
              images.length > 0
                ? `Add a note about ${images.length === 1 ? "this screenshot" : "these screenshots"} (optional)…`
                : "Capture anything — a note, a status change, a screenshot…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter makes a new line; the note is usually several. Sending
              // is deliberate — a half-written capture costs a model call and
              // a dialog to dismiss.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={busy}
          />

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void attach(files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="grid size-[30px] flex-none place-items-center rounded-lg text-[13px] text-dim transition-colors hover:text-text"
            style={{ border: "1px solid var(--color-edge-strong)" }}
            aria-label="Attach screenshots"
            title={`Attach up to ${MAX_IMAGES} screenshots`}
            disabled={busy || images.length >= MAX_IMAGES}
          >
            🖼
          </button>
          <button
            type="button"
            className="btn btn-primary flex-none text-[12.5px]"
            onClick={() => void submit()}
            disabled={busy || (!text.trim() && images.length === 0)}
          >
            {busy ? "Reading…" : "Capture"}
          </button>
        </div>

        <div className="mt-2 flex justify-center gap-[14px] font-mono text-[9.5px] text-ghost">
          <span>⌘K CAPTURE</span>
          <span>⌘↵ SEND</span>
          <span>PASTE UP TO {MAX_IMAGES} SCREENSHOTS</span>
          <span>ROUTES TO BRAIN</span>
        </div>
      </div>

      {staged?.kind === "text" ? (
        <ConfirmCapture
          capture={staged.capture}
          classification={staged.classification}
          onDone={() => setStaged(null)}
          onCancel={() => setStaged(null)}
        />
      ) : null}

      {staged?.kind === "screenshot" ? (
        <ConfirmScreenshot
          capture={staged.capture}
          classification={staged.classification}
          onDone={() => setStaged(null)}
          onCancel={() => setStaged(null)}
        />
      ) : null}
    </>
  );
}
