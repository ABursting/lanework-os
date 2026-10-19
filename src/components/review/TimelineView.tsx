"use client";

import { useRouter } from "next/navigation";
import { ActivityTimeline } from "./ActivityTimeline";
import { CumulativeApplications } from "./CumulativeApplications";
import type { TimelineData } from "@/lib/db/timeline";

/**
 * The range lives in the URL rather than in component state, so the window is
 * re-queried on the server instead of over-fetching six months up front and
 * filtering in the browser — and a view you want to come back to is a link.
 */
export function TimelineView({ data, range }: { data: TimelineData; range: number }) {
  const router = useRouter();
  return (
    <ActivityTimeline
      data={data}
      range={range}
      onRangeChange={(days) => router.push(`/review/timeline?range=${days}`)}
      /* Under the activity chart, sharing its range: the same window, asked a
         different question - not "what did I do" but "is it adding up". */
      below={<CumulativeApplications points={data.cumulative} />}
    />
  );
}
