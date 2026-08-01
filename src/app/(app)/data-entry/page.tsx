import { redirect } from "next/navigation";

// Retired: project data entry is superseded by the Capex module.
export default function DataEntryRedirect() {
  redirect("/capex/asset-requests");
}
