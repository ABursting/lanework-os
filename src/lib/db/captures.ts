import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import type {
  CaptureClassification, CaptureSource, CaptureStatus, RawCapture,
  ScreenshotClassification,
} from "@/lib/types";

type AnyClassification = CaptureClassification | ScreenshotClassification;

/**
 * raw_captures is the audit trail for the AI pipeline: what was typed or
 * pasted, what the model made of it, and whether a human accepted that reading
 * unchanged (`confirmed`) or edited it first (`corrected`). Nothing reaches the
 * CRM tables without passing through here and then through a person.
 */
export async function createCapture(input: {
  source: CaptureSource;
  raw_text?: string | null;
  image_url?: string | null;
  classification?: AnyClassification | null;
}): Promise<RawCapture> {
  const { data, error } = await supabaseAdmin()
    .from("raw_captures")
    .insert({
      user_id: USER_ID,
      source: input.source,
      raw_text: input.raw_text ?? null,
      image_url: input.image_url ?? null,
      classification: input.classification ?? null,
      status: "pending_review",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as RawCapture;
}

export async function getCapture(id: string): Promise<RawCapture | null> {
  const { data, error } = await supabaseAdmin()
    .from("raw_captures")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as RawCapture) ?? null;
}

export async function settleCapture(
  id: string,
  status: Extract<CaptureStatus, "confirmed" | "corrected">,
  classification?: AnyClassification,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (classification) patch.classification = classification;

  const { error } = await supabaseAdmin()
    .from("raw_captures")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw error;
}

/** Captures that were classified but never confirmed — abandoned mid-review. */
export async function listPendingCaptures(): Promise<RawCapture[]> {
  const { data, error } = await supabaseAdmin()
    .from("raw_captures")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as RawCapture[];
}
