export type MemberAvatarColor = string;

export interface HouseholdMember {
  id: string;
  firstName: string;
  role?: string;
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
  sortOrder: number;
}

export interface HouseholdEvent {
  id: string;
  title: string;
  date: string;
  memberIds: string[];
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  eventTypeId?: string;
  repeatRule?: string;
  location?: string;
  notes?: string;
}
