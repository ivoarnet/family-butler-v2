import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";
import type { SvgIconComponent } from "@mui/icons-material";

export interface ModuleDestination {
  id: string;
  label: string;
  icon: SvgIconComponent;
  path?: "/" | "/groceries";
}

export const moduleDestinations: ModuleDestination[] = [
  {
    id: "family-calendar",
    label: "Calendar",
    icon: CalendarMonthIcon,
    path: "/",
  },
  { id: "tasks", label: "Tasks", icon: TaskAltIcon },
  { id: "shop-cook", label: "Shop & Cook", icon: ShoppingBasketOutlinedIcon, path: "/groceries" },
];
