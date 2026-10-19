import { APP_TIMEZONE } from "../constants";

/**
 * What goes into the "someone logged in" email.
 *
 * Pure — no network, no environment beyond the timezone — so it can be tested
 * against real browser strings without sending anything.
 *
 * Everything here comes from what the browser and Vercel volunteer about a
 * request. It is a good description of an honest login and a weak one of a
 * deliberate intruder: a browser can claim to be anything, and location is
 * approximate, from the network address. Treat it as "does this look like me?",
 * not as evidence.
 */

export interface LoginDetails {
  at: Date;
  userAgent: string | null;
  /** Chromium's own platform hint, e.g. "macOS" — more reliable than the UA. */
  platformHint: string | null;
  mobileHint: boolean | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export interface DeviceDescription {
  device: string;
  os: string;
  browser: string;
}

/** Read a request's headers into LoginDetails. */
export function loginDetailsFrom(headers: Headers, at = new Date()): LoginDetails {
  const unquote = (v: string | null) => (v ? v.replace(/^"|"$/g, "") : null);
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const mobile = headers.get("sec-ch-ua-mobile");

  return {
    at,
    userAgent: headers.get("user-agent"),
    platformHint: unquote(headers.get("sec-ch-ua-platform")),
    mobileHint: mobile === "?1" ? true : mobile === "?0" ? false : null,
    // The first address in x-forwarded-for is the visitor; the rest are proxies.
    ip:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      null,
    // Vercel adds these on deployed requests. Locally they are simply absent.
    city: decode(headers.get("x-vercel-ip-city")),
    region: decode(headers.get("x-vercel-ip-country-region")),
    country: decode(headers.get("x-vercel-ip-country")),
  };
}

/**
 * A plain-words reading of the browser string. Order matters: Chrome's string
 * also says "Safari", and Edge's also says "Chrome", so the more specific
 * names are checked first.
 */
export function describeDevice(
  userAgent: string | null,
  platformHint: string | null = null,
  mobileHint: boolean | null = null,
): DeviceDescription {
  const ua = userAgent ?? "";

  let os = platformHint ?? "Unknown system";
  let device = "Unknown device";

  const ios = ua.match(/(iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/);
  if (ios) {
    device = ios[1];
    os = `iOS ${ios[2]}.${ios[3]}`;
  } else if (/Android/.test(ua)) {
    const version = ua.match(/Android (\d+(?:\.\d+)?)/)?.[1];
    os = version ? `Android ${version}` : "Android";
    device = /Mobile/.test(ua) || mobileHint ? "Android phone" : "Android tablet";
  } else if (/Macintosh|Mac OS X/.test(ua) || platformHint === "macOS") {
    // Modern iPads ask for the desktop site and report as a Mac. There is no
    // honest way to tell them apart from the string alone.
    device = "Mac";
    os = "macOS";
  } else if (/Windows/.test(ua) || platformHint === "Windows") {
    device = "Windows PC";
    os = "Windows";
  } else if (/CrOS/.test(ua) || platformHint === "Chrome OS") {
    device = "Chromebook";
    os = "ChromeOS";
  } else if (/Linux/.test(ua) || platformHint === "Linux") {
    device = "Linux computer";
    os = "Linux";
  }

  const major = (re: RegExp) => ua.match(re)?.[1];
  let browser = "Unknown browser";
  let v: string | undefined;
  if ((v = major(/EdgA?\/(\d+)/) ?? major(/EdgiOS\/(\d+)/))) browser = `Edge ${v}`;
  else if ((v = major(/OPR\/(\d+)/))) browser = `Opera ${v}`;
  else if ((v = major(/Firefox\/(\d+)/) ?? major(/FxiOS\/(\d+)/))) browser = `Firefox ${v}`;
  else if ((v = major(/CriOS\/(\d+)/) ?? major(/Chrome\/(\d+)/))) browser = `Chrome ${v}`;
  else if ((v = major(/Version\/(\d+(?:\.\d+)?).*Safari/))) browser = `Safari ${v}`;
  else if (/Safari/.test(ua)) browser = "Safari";

  return { device, os, browser };
}

/** The email itself: a short subject you can read from a lock screen. */
export function buildLoginAlert(details: LoginDetails): { subject: string; text: string } {
  const { device, os, browser } = describeDevice(
    details.userAgent,
    details.platformHint,
    details.mobileHint,
  );

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(details.at);

  const place = [details.city, details.region, details.country].filter(Boolean).join(", ");

  const lines = [
    "Someone just entered the password for your Lanework dashboard.",
    "",
    `When:      ${when}`,
    `Device:    ${device} · ${os} · ${browser}`,
    `Location:  ${place ? `${place} (approximate, from the network address)` : "Unknown"}`,
    `Address:   ${details.ip ?? "Unknown"}`,
    "",
    "If this was you, there is nothing to do. This browser stays logged in for 30 days.",
    "",
    "If it was not you: change APP_PASSWORD in Vercel (Project → Settings →",
    "Environment Variables) and redeploy. That signs out every device at once,",
    "including whoever this was.",
    "",
    `Full browser string: ${details.userAgent ?? "none sent"}`,
  ];

  return {
    subject: `Lanework login: ${device}, ${browser.replace(/ \d.*$/, "")}${place ? ` near ${details.city ?? place}` : ""}`,
    text: lines.join("\n"),
  };
}
