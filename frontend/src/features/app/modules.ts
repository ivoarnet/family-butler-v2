import type { SettingsWorkspaceTab } from "./types";

export interface ModuleDestination {
  id: string;
  label: string;
  path: "/" | "/reports" | "/settings";
  settingsTab?: SettingsWorkspaceTab;
  children?: ModuleDestination[];
}

export const moduleDestinations: ModuleDestination[] = [
  {
    id: "family-calendar",
    label: "Family Calendar",
    path: "/",
    children: [
      { id: "childcare", label: "Childcare", path: "/settings", settingsTab: "childcare" },
      { id: "shared-parenting", label: "Shared Parenting (Parenting Time)", path: "/settings", settingsTab: "parenting-time" },
    ],
  },
  { id: "reports", label: "Reports & exports", path: "/reports" },
];
