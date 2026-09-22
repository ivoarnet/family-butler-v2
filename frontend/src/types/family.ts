export type MemberAvatarColor = string;

export interface FamilyMember {
  id: string;
  firstName: string;
  role?: string;
  avatarColor: MemberAvatarColor;
  visibleInCalendar: boolean;
  order: number;
  avatarPhotoUrl?: string;
}

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
