import { saveSettings } from "@/lib/db/settings";
import { sanitizeSettings } from "@/lib/compress";
import { ValidationError, handleThrown, ok, readJson } from "@/lib/api";

/** Save one or more Compress windows. Values are clamped to each slider's range. */
export async function PATCH(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const patch = sanitizeSettings(body);
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No recognised settings in the request.");
    }
    return ok(await saveSettings(patch));
  } catch (err) {
    return handleThrown("settings.update", err);
  }
}
