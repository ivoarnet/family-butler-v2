export interface ModuleDestination {
  id: string;
  label: string;
  path?: "/";
}

export const moduleDestinations: ModuleDestination[] = [
  {
    id: "family-calendar",
    label: "Calendar",
    path: "/",
  },
  { id: "tasks", label: "Tasks" },
];
