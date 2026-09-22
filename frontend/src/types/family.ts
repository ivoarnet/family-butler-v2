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
