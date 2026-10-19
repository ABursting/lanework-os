import { WeeklyReviewDoc } from "@/components/review/WeeklyReviewDoc";
import { DataError } from "@/components/ui/DataError";
import { getOrCreateReview } from "@/lib/db/weeklyReviews";
import { startOfWeek } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: requested } = await searchParams;
  // Any date in a week resolves to that week's Monday, so a hand-typed ?week=
  // cannot create a row on a Thursday.
  const week = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? startOfWeek(requested)
    : startOfWeek();

  try {
    return <WeeklyReviewDoc review={await getOrCreateReview(week)} week={week} />;
  } catch (err) {
    return <DataError scope="review" error={err} />;
  }
}
