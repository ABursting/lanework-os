"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote, Field, FieldRow, Select } from "@/components/ui/Field";
import { api } from "@/lib/client";
import { useReportError } from "@/components/ui/ErrorBanner";
import { LANE_LABEL, TASK_TYPE_LABEL } from "@/lib/display";
import { LANES, TASK_TYPES, type Lane, type TaskRow, type TaskType } from "@/lib/types";

/**
 * One editor for tasks, shared by the Priorities card and the CRM Tasks tab,
 * so a task means the same thing and offers the same fields wherever you
 * happen to be looking at it.
 */
export function TaskDialog({
  task,
  onClose,
}: {
  task?: TaskRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? "");
  const [taskType, setTaskType] = useState<TaskType>(task?.task_type ?? "other");
  const [lane, setLane] = useState<Lane | null>(task?.lane ?? "primary");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [saving, setSaving] = useState(false);
  // Local state holds validation only; a failed write goes to the banner.
  const [error, setError] = useState<string | null>(null);
  const report = useReportError();

  async function save() {
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        task_type: taskType,
        lane,
        due_date: dueDate || null,
        description: description || null,
      };
      if (editing) await api.patch(`/api/tasks/${task!.id}`, payload);
      else await api.post("/api/tasks", payload);
      router.refresh();
      onClose();
    } catch (err) {
      report(editing ? `save \u201c${title}\u201d` : "add the task", err);
      setSaving(false);
    }
  }

  async function remove() {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await api.del(`/api/tasks/${task.id}`);
      router.refresh();
      onClose();
    } catch (err) {
      report(`delete \u201c${task!.title}\u201d`, err);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit task" : "New task"}
      footer={
        <>
          {editing ? (
            <button
              type="button"
              className="btn btn-danger mr-auto"
              onClick={remove}
              disabled={saving}
              title="Deletes the task outright. Completing it instead keeps it in your history."
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Add task"}
          </button>
        </>
      }
    >
      <ErrorNote message={error} />
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <FieldRow>
        <Field label="Type">
          <Select
            value={taskType}
            onChange={(v) => setTaskType(v ?? "other")}
            options={TASK_TYPES}
            labels={TASK_TYPE_LABEL}
          />
        </Field>
        <Field label="Lane" hint="drives ranking">
          <Select
            value={lane}
            onChange={setLane}
            options={LANES}
            labels={LANE_LABEL}
            allowEmpty
            emptyLabel="— none —"
          />
        </Field>
      </FieldRow>
      <Field label="Due date">
        <input
          type="date"
          className="input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>
      <Field label="Notes" hint="optional">
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {editing ? (
        <p className="m-0 text-[11.5px] text-faint">
          Deleting removes the task entirely. Completing it instead keeps it, stamped
          with when you finished, and searchable in Brain.
        </p>
      ) : null}
    </Dialog>
  );
}
