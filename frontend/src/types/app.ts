import { Contact, FamilyMember } from "./family";

export type ThemeMode = "light" | "dark";

export interface HouseholdData {
  householdId: string;
  householdName: string;
  familyMembers: FamilyMember[];
  contacts: Contact[];
}

export interface UserHouseholdOption {
  id: string;
  name: string;
  canManage: boolean;
  source: "owned" | "member-link" | "demo";
}

export interface UserHouseholdMemberLink {
  memberId: string;
  householdId: string;
}

export interface UserSettingsPayload {
  defaultHouseholdId: string;
  households: UserHouseholdOption[];
  linkedMembers: UserHouseholdMemberLink[];
}
