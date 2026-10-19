import { BrainSearch } from "@/components/brain/BrainSearch";
import { DataError } from "@/components/ui/DataError";
import { countMemory, searchMemory, withLinks } from "@/lib/db/memory";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  try {
    const [entries, total] = await Promise.all([searchMemory(""), countMemory()]);
    return <BrainSearch initial={{ entries: await withLinks(entries), total }} />;
  } catch (err) {
    return <DataError scope="brain" error={err} />;
  }
}
