import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLoginAlert, describeDevice, loginDetailsFrom } from "../src/lib/auth/loginAlert.ts";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0",
};

test("reads common browsers the way a person would describe them", () => {
  assert.deepEqual(describeDevice(UA.iphoneSafari), { device: "iPhone", os: "iOS 18.6", browser: "Safari 18.6" });
  assert.deepEqual(describeDevice(UA.iphoneChrome), { device: "iPhone", os: "iOS 18.6", browser: "Chrome 128" });
  assert.deepEqual(describeDevice(UA.androidChrome), { device: "Android phone", os: "Android 15", browser: "Chrome 128" });
  assert.deepEqual(describeDevice(UA.macChrome), { device: "Mac", os: "macOS", browser: "Chrome 128" });
  assert.deepEqual(describeDevice(UA.windowsEdge), { device: "Windows PC", os: "Windows", browser: "Edge 128" });
  assert.deepEqual(describeDevice(UA.macFirefox), { device: "Mac", os: "macOS", browser: "Firefox 130" });
});

test("a missing browser string does not break the email", () => {
  assert.deepEqual(describeDevice(null), {
    device: "Unknown device",
    os: "Unknown system",
    browser: "Unknown browser",
  });
});

test("builds a readable alert from a deployed request's headers", () => {
  const headers = new Headers({
    "user-agent": UA.iphoneSafari,
    "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    "x-vercel-ip-city": "Nashville",
    "x-vercel-ip-country-region": "TN",
    "x-vercel-ip-country": "US",
  });
  const alert = buildLoginAlert(loginDetailsFrom(headers, new Date("2026-09-14T21:12:00Z")));

  assert.equal(alert.subject, "Lanework login: iPhone, Safari near Nashville");
  assert.match(alert.text, /Device: +iPhone · iOS 18\.6 · Safari 18\.6/);
  assert.match(alert.text, /Location: +Nashville, TN, US \(approximate/);
  assert.match(alert.text, /Address: +203\.0\.113\.7$/m);
  // 21:12 UTC is 4:12 PM in Chicago during daylight time.
  assert.match(alert.text, /Mon, Sep 14, 2026, 4:12 PM CDT/);
  assert.match(alert.text, /change APP_PASSWORD/);
});

test("decodes city names Vercel sends escaped", () => {
  const details = loginDetailsFrom(new Headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" }));
  assert.equal(details.city, "São Paulo");
});

test("says Unknown rather than inventing a location off Vercel", () => {
  const alert = buildLoginAlert(loginDetailsFrom(new Headers({ "user-agent": UA.macChrome })));
  assert.match(alert.text, /Location: +Unknown$/m);
  assert.equal(alert.subject, "Lanework login: Mac, Chrome");
});
