"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TopRail } from "./TopRail";
import { DemoBanner } from "./DemoBanner";
import { DemoGuide } from "./DemoGuide";
import { CaptureBar } from "@/components/capture/CaptureBar";

/**
 * The app's frame: a 54px rail on top, one scroll region beneath it, and the
 * capture bar floating over everything. Only the middle scrolls, so the rail
 * and the capture bar are always reachable from any page.
 *
 * The login screen gets none of it. Navigation and a capture bar on a page you
 * cannot use yet would be furniture at best, and at worst a capture bar that
 * answers every attempt with "not signed in".
 */
export function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <main className="app-ground grid min-h-dvh place-items-center p-4">{children}</main>;
  }

  return (
    <div className="app-ground flex h-dvh flex-col">
      {/* Above the rail, and outside the scroll region, so it stays put. */}
      <DemoBanner />
      <TopRail />
      {/* Below the rail: a visitor reads the banner first and asks "what is
          this" second, which is the order they meet them in. Collapsed unless
          opened, so it costs the dashboard no height by default. */}
      <DemoGuide />
      {/*
        The bottom padding clears the floating capture bar, which publishes its
        own height as --capture-bar-space (see CaptureBar). The fallback is the
        bar at its tallest, so the first paint never puts content under it.
      */}
      <main
        className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-[18px]"
        style={{ paddingBottom: "calc(var(--capture-bar-space, 136px) + 18px)" }}
      >
        {children}
      </main>
      <CaptureBar />
    </div>
  );
}
