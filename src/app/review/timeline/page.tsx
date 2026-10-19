import { TimelineView } from "@/components/review/TimelineView";
import { DataError } from "@/components/ui/DataError";
import { getTimeline } from "@/lib/db/timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const days = range === "90" || range === "180" ? Number(range) : 30;

  try {
    return <TimelineView data={await getTimeline(days)} range={days} />;
  } catch (err) {
    return <DataError scope="timeline" error={err} />;
  }
}
