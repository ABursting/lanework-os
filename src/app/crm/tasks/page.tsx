import { listTasks } from "@/lib/db/tasks";
import { TasksTable } from "@/components/crm/TasksTable";
import { DataError } from "@/components/ui/DataError";

type StatusFilter = "open" | "done" | "all";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // ?status=done is how "+N more today" arrives from the Priorities card, so
  // the tab opens on what the link promised rather than on the default.
  const initialStatus: StatusFilter =
    status === "done" || status === "all" ? status : "open";

  try {
    // Open and completed together: the table filters between them, and the
    // completed list is the point of having this view at all.
    return <TasksTable tasks={await listTasks()} initialStatus={initialStatus} />;
  } catch (err) {
    return <DataError scope="tasks" error={err} />;
  }
}
