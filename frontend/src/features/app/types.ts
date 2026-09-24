import { Contact, EventType, FamilyMember, HouseholdEvent, MemberAvatarColor } from "../../types/family";

export type ThemeMode = "light" | "dark";

export interface HouseholdData {
  householdId: string;
  householdName: string;
  familyMembers: FamilyMember[];
  contacts: Contact[];
  eventTypes: EventType[];
  events: HouseholdEvent[];
}

export interface HouseholdSummary {
  id: string;
  name: string;
}

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

export type SettingsSection = "profile" | "households";
export type NavigationTarget = "settings" | "profile" | "households";
