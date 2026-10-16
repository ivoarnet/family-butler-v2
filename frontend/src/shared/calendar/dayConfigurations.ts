import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import LooksIcon from "@mui/icons-material/Looks";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import type { ElementType } from "react";
import type { DayConfigurationCategory } from "../../types/family";

export interface DayConfigurationMeta {
  label: string;
  defaultMarker: string;
  icon: ElementType<SvgIconProps>;
  className: string;
}

export const DAY_CONFIGURATION_META: Record<DayConfigurationCategory, DayConfigurationMeta> = {
  school_off: { label: "School off", defaultMarker: "SH", icon: WbSunnyIcon, className: "school-off" },
  bank_holiday: { label: "Bank holiday", defaultMarker: "BH", icon: AccountBalanceIcon, className: "bank-holiday" },
  bridge_day: { label: "Bridge day", defaultMarker: "BD", icon: LooksIcon, className: "bridge-day" },
};

export const DAY_CONFIGURATION_OPTIONS = (Object.entries(DAY_CONFIGURATION_META) as [DayConfigurationCategory, DayConfigurationMeta][])
  .map(([value, meta]) => ({
    value,
    label: meta.label,
    defaultMarker: meta.defaultMarker,
    defaultIcon: meta.icon,
  }));
