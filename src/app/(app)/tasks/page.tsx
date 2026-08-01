import { redirect } from "next/navigation";

// Retired: the old task tracker is superseded by the Monitoring module.
export default function TasksRedirect() {
  redirect("/monitoring/milestones");
}
