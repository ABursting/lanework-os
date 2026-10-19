import { CrmTabs } from "@/components/crm/CrmTabs";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { ACTIVE_STAGES } from "@/lib/types";

/**
 * Every CRM view reads live rows, so none of them may be prerendered. Without
 * this, `next build` runs the queries once with no credentials, bakes the
 * failure into static HTML, and ships a CRM that is permanently empty.
 * Applies to the whole /crm subtree.
 */
export const dynamic = "force-dynamic";

/** Live records across the CRM: open applications plus active contacts. */
async function countActiveRecords(): Promise<number> {
  const db = supabaseAdmin();
  const [apps, contacts] = await Promise.all([
    db.from("applications").select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID).in("stage", ACTIVE_STAGES),
    db.from("contacts").select("id", { count: "exact", head: true })
      .eq("user_id", USER_ID).eq("status", "active"),
  ]);
  if (apps.error) console.error(`[crm] application count failed: ${apps.error.message}`);
  if (contacts.error) console.error(`[crm] contact count failed: ${contacts.error.message}`);
  return (apps.count ?? 0) + (contacts.count ?? 0);
}

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  let recordCount = 0;
  try {
    recordCount = await countActiveRecords();
  } catch (err) {
    console.error("[crm] record count unavailable", err);
  }

  return (
    <div className="max-w-[1800px]">
      <CrmTabs recordCount={recordCount} />
      {children}
    </div>
  );
}
