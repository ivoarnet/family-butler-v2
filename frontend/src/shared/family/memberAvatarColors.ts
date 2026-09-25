import { MemberAvatarColor } from "../../types/family";

const LEGACY_MEMBER_COLOR_MAP: Record<string, MemberAvatarColor> = {
  blue: "#3b82f6",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#7c3aed",
};

export const MEMBER_COLORS: MemberAvatarColor[] = ["#3b82f6", "#f97316", "#ec4899", "#7c3aed"];

export const MEMBER_COLOR_LABELS: Record<string, string> = {
  "#3b82f6": "Blue",
  "#f97316": "Orange",
  "#ec4899": "Pink",
  "#7c3aed": "Purple",
};

export const DEFAULT_MEMBER_COLOR: MemberAvatarColor = MEMBER_COLORS[0];

export const normalizeMemberColor = (color: unknown): MemberAvatarColor => {
  if (typeof color !== "string") {
    return DEFAULT_MEMBER_COLOR;
  }
  const trimmed = color.trim();
  if (!trimmed) {
    return DEFAULT_MEMBER_COLOR;
  }
  const legacy = LEGACY_MEMBER_COLOR_MAP[trimmed.toLowerCase()];
  return legacy ?? trimmed;
};

export const getMemberColorLabel = (color: MemberAvatarColor): string => MEMBER_COLOR_LABELS[color] ?? color;
