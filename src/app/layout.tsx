import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Frame } from "@/components/shell/Frame";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { DEMO_MODE } from "@/lib/demo";
import { isDemoDatabase } from "@/lib/demoGuard";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lanework",
  description: "Recruiting operating system",
};

export const viewport: Viewport = {
  themeColor: "#161826",
};

/**
 * The demo's refusal screen.
 *
 * Demo mode opens the site with no password. If it is ever pointed at the real
 * database, that would publish Asher's actual contacts and applications — and
 * the nightly reset would then delete them. So the demo asks the database to
 * identify itself before it renders anything at all, and shows this instead if
 * the answer is wrong. See src/lib/demoGuard.ts.
 *
 * The check costs one query per cold start, not one per page: the answer is
 * cached for the life of the server instance, because it cannot change under a
 * running deployment.
 */
function WrongDatabase() {
  return (
    <main className="app-ground grid min-h-dvh place-items-center p-6">
      <div className="max-w-[460px] text-center">
        <p className="m-0 text-[13px] font-medium text-danger">
          This demo is not connected to the demo database.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          It has stopped rather than show data that might not be fictional.
          Check the Supabase settings on the demo project.
        </p>
      </div>
    </main>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Only in demo mode. The real deployment never pays for this.
  const refuse = DEMO_MODE && !(await isDemoDatabase());

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        {refuse ? <WrongDatabase /> : <Frame>{children}</Frame>}
        {/*
          Outside the frame and last in the body: it is fixed-position and owes
          nothing to the layout. Its contents live in module state, so a
          navigation that remounts this component does not lose them.
        */}
        <ErrorBanner />
      </body>
    </html>
  );
}
