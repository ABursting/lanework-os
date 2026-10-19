import { ReviewTabs } from "@/components/review/ReviewTabs";

/**
 * Review is where you look backwards. The weekly document is the written half;
 * the timeline is the shape of the same thing over months. Sub-tabs rather
 * than a fifth top-level page — the scope fixes four, ordered by how often you
 * visit them, and this belongs with reflection.
 */
export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[980px]">
      <ReviewTabs />
      {children}
    </div>
  );
}
