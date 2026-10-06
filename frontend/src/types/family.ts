export type MemberAvatarColor = string;

export interface HouseholdMember {
  id: string;
  firstName: string;
  role?: string;
  isChild?: boolean;
  hatchParentingAway?: boolean;
  schoolBuilding?: string;
  schoolClass?: string;
  avatarColor: MemberAvatarColor;
  visibleInCalendar: boolean;
  order: number;
  avatarPhotoUrl?: string;
}

export type FamilyMember = HouseholdMember;

export interface Contact {
  id: string;
  firstName: string;
  lastName?: string;
  birthDay?: number;
  birthMonth?: number;
  birthYear?: number;
  email?: string;
  mobilePhone?: string;
}

export interface EventType {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sortOrder: number;
}

export interface HouseholdEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  memberIds: string[];
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  eventTypeId?: string;
  repeatRule?: string;
  location?: string;
  notes?: string;
}

export interface ResolvedChildcareOccurrence {
  id: string;
  originalDate: string;
  date: string;
  providerId: string;
  providerName: string | null;
  childIds: string[];
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  overrideAction: "add" | "replace" | "move" | null;
}

export interface ParentingParty {
  id: string;
  name: string;
  memberId?: string | null;
  active: boolean;
}

export interface ResolvedParentingInterval {
  startAt: string;
  endAt: string;
  partyId: string;
  partyName: string | null;
  source: { type: "plan"; planId: string } | { type: "change"; changeId: string; label?: string };
}

export interface ParentingResponsibilityResult {
  status: "determined" | "cannot_determine";
  responsible: boolean | null;
  reason?: string;
  overlaps: ResolvedParentingInterval[];
}

export type DayConfigurationCategory = "school_off" | "bank_holiday" | "bridge_day";

export interface DayConfiguration {
  id: string;
  category: DayConfigurationCategory;
  startDate: string;
  endDate: string;
  label?: string;
}
