import { Contact, FamilyMember, MemberAvatarColor } from "../types/family";

export interface MemberFormState {
  firstName: string;
  role: string;
  avatarColor: MemberAvatarColor;
  visibleInCalendar: boolean;
}

export interface ContactFormState {
  firstName: string;
  lastName: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  email: string;
  mobilePhone: string;
}

const LEGACY_MEMBER_COLOR_MAP: Record<string, MemberAvatarColor> = {
  blue: "#3b82f6",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#7c3aed",
};

export const MEMBER_COLORS: MemberAvatarColor[] = ["#3b82f6", "#f97316", "#ec4899", "#7c3aed"];

const MEMBER_COLOR_LABELS: Record<string, string> = {
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

export const normalizeFamilyMembers = (members: FamilyMember[]): FamilyMember[] =>
  [...members]
    .sort((a, b) => a.order - b.order)
    .map((member, index) => ({
      ...member,
      order: index,
      role: member.role?.trim() || undefined,
      avatarColor: normalizeMemberColor(member.avatarColor),
    }));

export const buildMemberFormState = (member?: FamilyMember): MemberFormState => ({
  firstName: member?.firstName ?? "",
  role: member?.role ?? "",
  avatarColor: member?.avatarColor ? normalizeMemberColor(member.avatarColor) : DEFAULT_MEMBER_COLOR,
  visibleInCalendar: member?.visibleInCalendar ?? true,
});

export const buildContactFormState = (contact?: Contact): ContactFormState => ({
  firstName: contact?.firstName ?? "",
  lastName: contact?.lastName ?? "",
  birthDay: contact?.birthDay ? String(contact.birthDay) : "",
  birthMonth: contact?.birthMonth ? String(contact.birthMonth) : "",
  birthYear: contact?.birthYear ? String(contact.birthYear) : "",
  email: contact?.email ?? "",
  mobilePhone: contact?.mobilePhone ?? "",
});

export const getBestAvailableColor = (members: FamilyMember[]): MemberAvatarColor => {
  for (const color of MEMBER_COLORS) {
    if (!members.some((member) => member.avatarColor === color)) {
      return color;
    }
  }
  return DEFAULT_MEMBER_COLOR;
};

export const formatContactBirthday = (contact: Contact): string => {
  if (!contact.birthDay || !contact.birthMonth) {
    return "—";
  }
  if (contact.birthYear) {
    return `${contact.birthDay}.${contact.birthMonth}.${contact.birthYear}`;
  }
  return `${contact.birthDay}.${contact.birthMonth}.`;
};
