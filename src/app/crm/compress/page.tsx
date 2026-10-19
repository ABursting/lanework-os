import { listOpenApplications } from "@/lib/db/applications";
import { listActiveContacts } from "@/lib/db/contacts";
import { listTasks } from "@/lib/db/tasks";
import { countJobApplicationsSent, listGoals } from "@/lib/db/goals";
import { getSettings } from "@/lib/db/settings";
import { CompressList } from "@/components/crm/CompressList";
import { DataError } from "@/components/ui/DataError";
import { endOfWeek, startOfWeek } from "@/lib/time";

/**
 * Every candidate for every section, unfiltered by age — the page filters in
 * the browser so the window sliders act instantly.
 */
export default async function CompressPage() {
  try {
    const weekStart = startOfWeek();
    const [applications, contacts, tasks, settings, sent, weekGoals] = await Promise.all([
      listOpenApplications(),
      listActiveContacts(),
      listTasks("open"),
      getSettings(),
      countJobApplicationsSent(weekStart, endOfWeek()),
      listGoals("week", weekStart),
    ]);

    // The weekly "applications" goal across every lane, if one is set. A goal
    // for one lane only would be compared against a count of all of them, so
    // those are not used here.
    const goal = weekGoals.find((g) => g.metric === "applications" && !g.lane);

    return (
      <CompressList
        applications={applications}
        contacts={contacts}
        tasks={tasks}
        settings={settings}
        week={{ sent, target: goal ? goal.target_count : null }}
      />
    );
  } catch (err) {
    return <DataError scope="compress" error={err} />;
  }
}
