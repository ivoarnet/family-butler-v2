import { Contact, FamilyMember } from "./family";

export type ThemeMode = "light" | "dark";

export interface HouseholdData {
  householdId: string;
  householdName: string;
  familyMembers: FamilyMember[];
  contacts: Contact[];
}
