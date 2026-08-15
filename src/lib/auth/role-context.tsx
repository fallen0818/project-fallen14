"use client";

import { createContext, useContext } from "react";

export type UserRole = "viewer" | "editor";

// Defaults to "viewer" so a component rendered without a provider (a bug,
// not an expected case) fails closed -- hides write controls -- rather than
// silently granting edit UI to someone who isn't actually an editor. The
// real enforcement is server-side RLS (see migration 0033); this context
// only drives what the UI shows/hides.
const RoleContext = createContext<UserRole>("viewer");

export function RoleProvider({ role, children }: { role: UserRole; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/** The signed-in user's access tier. "editor" can create/update/delete;
 *  "viewer" is read-only. */
export function useRole(): UserRole {
  return useContext(RoleContext);
}
