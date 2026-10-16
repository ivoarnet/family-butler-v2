import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import FamilyRestroomIcon from "@mui/icons-material/FamilyRestroom";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import type { SvgIconComponent } from "@mui/icons-material";

export interface ModuleDestination {
  id: string;
  label: string;
  icon: SvgIconComponent;
  path?: "/" | "/parenting";
}

export const moduleDestinations: ModuleDestination[] = [
  {
    id: "family-calendar",
    label: "Calendar",
    icon: CalendarMonthIcon,
    path: "/",
  },
  { id: "parenting", label: "Parenting", icon: FamilyRestroomIcon, path: "/parenting" },
  { id: "tasks", label: "Tasks", icon: TaskAltIcon },
];
