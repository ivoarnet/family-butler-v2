import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HomeIcon from "@mui/icons-material/Home";
import LightModeIcon from "@mui/icons-material/LightMode";
import { ContactDialog } from "../features/settings/components/ContactDialog";
import { HouseholdDialog } from "../features/settings/components/HouseholdDialog";
import { MemberDialog } from "../features/settings/components/MemberDialog";
import { Contact, FamilyMember, MemberAvatarColor } from "../types/family";
import { ContactFormState, HouseholdData, HouseholdSummary, MemberFormState, SettingsSection, ThemeMode } from "../features/app/types";


const LEGACY_MEMBER_COLOR_MAP: Record<string, MemberAvatarColor> = {
  blue: "#3b82f6",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#7c3aed",
};
const MEMBER_COLORS: MemberAvatarColor[] = ["#3b82f6", "#f97316", "#ec4899", "#7c3aed"];
const MEMBER_COLOR_LABELS: Record<string, string> = {
  "#3b82f6": "Blue",
  "#f97316": "Orange",
  "#ec4899": "Pink",
  "#7c3aed": "Purple",
};
const DEFAULT_MEMBER_COLOR: MemberAvatarColor = MEMBER_COLORS[0];

const normalizeMemberColor = (color: unknown): MemberAvatarColor => {
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

const getMemberColorLabel = (color: MemberAvatarColor): string => MEMBER_COLOR_LABELS[color] ?? color;

const formatContactBirthday = (contact: Contact): string => {
  if (!contact.birthDay || !contact.birthMonth) {
    return "—";
  }
  if (contact.birthYear) {
    return `${contact.birthDay}.${contact.birthMonth}.${contact.birthYear}`;
  }
  return `${contact.birthDay}.${contact.birthMonth}.`;
};

const buildMemberFormState = (member?: FamilyMember): MemberFormState => ({
  firstName: member?.firstName ?? "",
  role: member?.role ?? "",
  avatarColor: member?.avatarColor ? normalizeMemberColor(member.avatarColor) : DEFAULT_MEMBER_COLOR,
  visibleInCalendar: member?.visibleInCalendar ?? true,
});

const buildContactFormState = (contact?: Contact): ContactFormState => ({
  firstName: contact?.firstName ?? "",
  lastName: contact?.lastName ?? "",
  birthDay: contact?.birthDay ? String(contact.birthDay) : "",
  birthMonth: contact?.birthMonth ? String(contact.birthMonth) : "",
  birthYear: contact?.birthYear ? String(contact.birthYear) : "",
  email: contact?.email ?? "",
  mobilePhone: contact?.mobilePhone ?? "",
});

const normalizeFamilyMembers = (members: FamilyMember[]): FamilyMember[] =>
  [...members]
    .sort((a, b) => a.order - b.order)
    .map((member, index) => ({
      ...member,
      order: index,
      role: member.role?.trim() || undefined,
      avatarColor: normalizeMemberColor(member.avatarColor),
    }));

const getBestAvailableColor = (members: FamilyMember[]): MemberAvatarColor => {
  for (const color of MEMBER_COLORS) {
    if (!members.some((member) => member.avatarColor === color)) {
      return color;
    }
  }
  return DEFAULT_MEMBER_COLOR;
};

export function SettingsPage({
  mode,
  households,
  activeHouseholdId,
  onSwitchHousehold,
  onCreateHousehold,
  isContextLoading,
  isCreatingHousehold,
  householdData,
  setHouseholdData,
  contextError,
  onRetryContextAction,
  onGoHome,
  initialSection,
  currentUserEmail,
  initialProfileFirstName,
  initialProfileLastName,
  isProfileSaving,
  onSaveProfile,
  theme,
  setTheme,
}: {
  mode: "profile" | "settings";
  households: HouseholdSummary[];
  activeHouseholdId: string | null;
  onSwitchHousehold: (householdId: string) => void;
  onCreateHousehold: (householdName: string) => Promise<{ ok: boolean; error?: string }>;
  isContextLoading: boolean;
  isCreatingHousehold: boolean;
  householdData: HouseholdData;
  setHouseholdData: Dispatch<SetStateAction<HouseholdData>>;
  contextError: string | null;
  onRetryContextAction: () => void;
  onGoHome: () => void;
  initialSection: SettingsSection;
  currentUserEmail: string;
  initialProfileFirstName: string;
  initialProfileLastName: string;
  isProfileSaving: boolean;
  onSaveProfile: (firstName: string, lastName: string) => Promise<{ ok: boolean; error?: string }>;
  theme: ThemeMode;
  setTheme: Dispatch<SetStateAction<ThemeMode>>;
}) {
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialSection);
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [createHouseholdSubmitted, setCreateHouseholdSubmitted] = useState(false);
  const [createHouseholdError, setCreateHouseholdError] = useState<string | null>(null);
  const [householdModalOpen, setHouseholdModalOpen] = useState(false);
  const [memberFormState, setMemberFormState] = useState<MemberFormState>(buildMemberFormState);
  const [contactFormState, setContactFormState] = useState<ContactFormState>(buildContactFormState);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberFormSubmitted, setMemberFormSubmitted] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactFormSubmitted, setContactFormSubmitted] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [profileFirstName, setProfileFirstName] = useState(initialProfileFirstName);
  const [profileLastName, setProfileLastName] = useState(initialProfileLastName);
  const [profileSubmitAttempted, setProfileSubmitAttempted] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveInfo, setProfileSaveInfo] = useState<string | null>(null);

  const orderedMembers = useMemo(
    () => [...householdData.familyMembers].sort((a, b) => a.order - b.order),
    [householdData.familyMembers]
  );

  const filteredContacts = useMemo(() => {
    const search = contactSearch.trim().toLowerCase();
    if (!search) {
      return householdData.contacts;
    }

    return householdData.contacts.filter((contact) => {
      const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim().toLowerCase();
      return fullName.includes(search);
    });
  }, [contactSearch, householdData.contacts]);
  const canEditActiveHousehold = Boolean(activeHouseholdId) && !isContextLoading;
  const showHouseholdWorkspace = mode === "profile" && settingsSection === "households";
  const showProfileWorkspace = mode === "profile" && settingsSection === "profile";
  const showSettingsWorkspace = mode === "settings";

  const createHouseholdNameError = createHouseholdSubmitted && !newHouseholdName.trim();
  const profileFirstNameError = profileSubmitAttempted && !profileFirstName.trim();

  useEffect(() => {
    setSettingsSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    setProfileFirstName(initialProfileFirstName);
    setProfileLastName(initialProfileLastName);
  }, [initialProfileFirstName, initialProfileLastName]);

  const openAddHousehold = () => {
    setCreateHouseholdSubmitted(false);
    setCreateHouseholdError(null);
    setNewHouseholdName("");
    setHouseholdModalOpen(true);
  };

  const closeAddHousehold = () => {
    if (isCreatingHousehold) {
      return;
    }
    setHouseholdModalOpen(false);
    setCreateHouseholdSubmitted(false);
    setCreateHouseholdError(null);
  };

  const submitCreateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateHouseholdSubmitted(true);
    const trimmedName = newHouseholdName.trim();
    if (!trimmedName) {
      return;
    }

    const result = await onCreateHousehold(trimmedName);
    if (!result.ok) {
      setCreateHouseholdError(result.error ?? "Could not create household.");
      return;
    }

    setCreateHouseholdError(null);
    setCreateHouseholdSubmitted(false);
    setNewHouseholdName("");
    setHouseholdModalOpen(false);
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSubmitAttempted(true);
    setProfileSaveInfo(null);
    setProfileSaveError(null);

    const firstName = profileFirstName.trim();
    const lastName = profileLastName.trim();
    if (!firstName) {
      return;
    }

    const result = await onSaveProfile(firstName, lastName);
    if (!result.ok) {
      setProfileSaveError(result.error ?? "Could not save profile.");
      return;
    }

    setProfileSaveInfo("Profile updated.");
  };

  const openAddMember = () => {
    setEditingMemberId(null);
    setMemberFormSubmitted(false);
    setMemberFormState({
      firstName: "",
      role: "",
      avatarColor: getBestAvailableColor(orderedMembers),
      visibleInCalendar: true,
    });
    setMemberModalOpen(true);
  };

  const openEditMember = (member: FamilyMember) => {
    setEditingMemberId(member.id);
    setMemberFormSubmitted(false);
    setMemberFormState(buildMemberFormState(member));
    setMemberModalOpen(true);
  };

  const closeMemberModal = () => {
    setMemberModalOpen(false);
    setEditingMemberId(null);
    setMemberFormSubmitted(false);
  };

  const submitMember = (event: FormEvent) => {
    event.preventDefault();
    setMemberFormSubmitted(true);
    const firstName = memberFormState.firstName.trim();
    if (!firstName) {
      return;
    }

    setHouseholdData((current) => {
      const members = [...current.familyMembers];
      if (editingMemberId) {
        const updated = members.map((member) =>
          member.id === editingMemberId
            ? {
                ...member,
                firstName,
                role: memberFormState.role.trim() || undefined,
                avatarColor: memberFormState.avatarColor,
                visibleInCalendar: memberFormState.visibleInCalendar,
              }
            : member
        );
        return { ...current, familyMembers: normalizeFamilyMembers(updated) };
      }

      const newMember: FamilyMember = {
        id: crypto.randomUUID(),
        firstName,
        role: memberFormState.role.trim() || undefined,
        avatarColor: memberFormState.avatarColor,
        visibleInCalendar: memberFormState.visibleInCalendar,
        order: members.length,
      };

      return { ...current, familyMembers: normalizeFamilyMembers([...members, newMember]) };
    });

    closeMemberModal();
  };

  const memberFirstNameError = memberFormSubmitted && !memberFormState.firstName.trim();
  const birthDay = contactFormState.birthDay.trim();
  const birthMonth = contactFormState.birthMonth.trim();
  const birthYear = contactFormState.birthYear.trim();
  const hasAnyBirthdayData = Boolean(birthDay || birthMonth || birthYear);
  const birthDayNumber = birthDay ? Number.parseInt(birthDay, 10) : undefined;
  const birthMonthNumber = birthMonth ? Number.parseInt(birthMonth, 10) : undefined;
  const contactFirstNameError = contactFormSubmitted && !contactFormState.firstName.trim();
  const contactBirthdayMissingError = contactFormSubmitted && hasAnyBirthdayData && (!birthDay || !birthMonth);
  const contactBirthdayRangeError =
    contactFormSubmitted &&
    ((birthDayNumber !== undefined && (birthDayNumber < 1 || birthDayNumber > 31)) ||
      (birthMonthNumber !== undefined && (birthMonthNumber < 1 || birthMonthNumber > 12)));

  const updateMemberRow = (memberId: string, updater: (member: FamilyMember) => FamilyMember) => {
    setHouseholdData((current) => ({
      ...current,
      familyMembers: normalizeFamilyMembers(current.familyMembers.map((member) => (member.id === memberId ? updater(member) : member))),
    }));
  };

  const moveMember = (memberId: string, direction: -1 | 1) => {
    setHouseholdData((current) => {
      const sorted = [...current.familyMembers].sort((a, b) => a.order - b.order);
      const fromIndex = sorted.findIndex((member) => member.id === memberId);
      const targetIndex = fromIndex + direction;

      if (fromIndex < 0 || targetIndex < 0 || targetIndex >= sorted.length) {
        return current;
      }

      const swapped = [...sorted];
      [swapped[fromIndex], swapped[targetIndex]] = [swapped[targetIndex], swapped[fromIndex]];

      return {
        ...current,
        familyMembers: swapped.map((member, index) => ({ ...member, order: index })),
      };
    });
  };

  const openAddContact = () => {
    setEditingContactId(null);
    setContactFormSubmitted(false);
    setContactFormState(buildContactFormState());
    setContactModalOpen(true);
  };

  const openEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactFormSubmitted(false);
    setContactFormState(buildContactFormState(contact));
    setContactModalOpen(true);
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
    setEditingContactId(null);
    setContactFormSubmitted(false);
  };

  const submitContact = (event: FormEvent) => {
    event.preventDefault();
    setContactFormSubmitted(true);
    const firstName = contactFormState.firstName.trim();
    if (!firstName) {
      return;
    }

    const birthDay = contactFormState.birthDay.trim();
    const birthMonth = contactFormState.birthMonth.trim();
    const birthYear = contactFormState.birthYear.trim();
    const hasAnyBirthdayData = Boolean(birthDay || birthMonth || birthYear);

    if (hasAnyBirthdayData && (!birthDay || !birthMonth)) {
      return;
    }

    const birthDayNumber = birthDay ? Number.parseInt(birthDay, 10) : undefined;
    const birthMonthNumber = birthMonth ? Number.parseInt(birthMonth, 10) : undefined;
    const birthYearNumber = birthYear ? Number.parseInt(birthYear, 10) : undefined;

    if ((birthDayNumber && (birthDayNumber < 1 || birthDayNumber > 31)) || (birthMonthNumber && (birthMonthNumber < 1 || birthMonthNumber > 12))) {
      return;
    }

    const preparedContact: Contact = {
      id: editingContactId ?? crypto.randomUUID(),
      firstName,
      lastName: contactFormState.lastName.trim() || undefined,
      birthDay: birthDayNumber,
      birthMonth: birthMonthNumber,
      birthYear: birthYearNumber,
      email: contactFormState.email.trim() || undefined,
      mobilePhone: contactFormState.mobilePhone.trim() || undefined,
    };

    setHouseholdData((current) => {
      if (!editingContactId) {
        return { ...current, contacts: [...current.contacts, preparedContact] };
      }

      return {
        ...current,
        contacts: current.contacts.map((contact) => (contact.id === editingContactId ? preparedContact : contact)),
      };
    });

    closeContactModal();
  };

  const deleteContact = (contactId: string) => {
    if (!window.confirm("Delete this contact?")) {
      return;
    }
    setHouseholdData((current) => ({
      ...current,
      contacts: current.contacts.filter((contact) => contact.id !== contactId),
    }));
  };

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    onGoHome();
  };

  return (
    <div className="dashboard-page settings-page">
      <header className="dashboard-header settings-header" role="banner">
        <button type="button" className="icon-button" onClick={goBack} title="Go back" aria-label="Go back">
          <ArrowBackIcon fontSize="small" />
        </button>
        <div className="header-branding">
          <div>
            <h1>{mode === "profile" ? "Profile" : "Settings"}</h1>
            <p>
              {mode === "profile"
                ? "Manage your personal details and households"
                : activeHouseholdId
                  ? `Selected household: ${householdData.householdName}`
                  : "Select a household in Profile before editing household settings"}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onGoHome}
          title="Go to dashboard"
          aria-label="Go to dashboard"
        >
          <HomeIcon fontSize="small" />
        </button>
      </header>

      <main className="settings-main">
        {mode === "profile" ? (
          <section className="settings-card">
            <div className="section-toolbar">
              <h2>My account</h2>
              <div className="pill-group view-switcher" role="tablist" aria-label="Profile sections">
                <button type="button" className={settingsSection === "profile" ? "active" : ""} onClick={() => setSettingsSection("profile")}>
                  My profile
                </button>
                <button
                  type="button"
                  className={settingsSection === "households" ? "active" : ""}
                  onClick={() => setSettingsSection("households")}
                >
                  My households
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {showProfileWorkspace ? (
          <section className="settings-card">
            <h2>My profile</h2>
            <form className="auth-form" onSubmit={submitProfile}>
              <div className="edit-grid">
                <label>
                  First name
                  <input
                    type="text"
                    value={profileFirstName}
                    onChange={(event) => setProfileFirstName(event.target.value)}
                    placeholder="First name"
                    autoComplete="given-name"
                  />
                </label>
                <label>
                  Last name
                  <input
                    type="text"
                    value={profileLastName}
                    onChange={(event) => setProfileLastName(event.target.value)}
                    placeholder="Last name"
                    autoComplete="family-name"
                  />
                </label>
              </div>
              <label>
                Email
                <input type="email" value={currentUserEmail} readOnly />
              </label>
              <label>
                Appearance
                <button
                  type="button"
                  className="primary-pill"
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {theme === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}{" "}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
              </label>
              {profileFirstNameError ? <div role="alert">First name is required.</div> : null}
              {profileSaveError ? <div role="alert">{profileSaveError}</div> : null}
              {profileSaveInfo ? <div aria-live="polite">{profileSaveInfo}</div> : null}
              <div className="sheet-actions">
                <button type="submit" disabled={isProfileSaving}>
                  {isProfileSaving ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {showHouseholdWorkspace ? (
        <section className="settings-card">
          <div className="section-toolbar">
            <h2>Households</h2>
            <button type="button" className="primary-pill no-wrap-button" onClick={openAddHousehold} disabled={isCreatingHousehold || isContextLoading}>
              Create household
            </button>
          </div>

          {households.length === 0 ? (
            <div className="coming-soon-card">
              <strong>No households yet.</strong>
              <div>Create your first household to begin adding members and contacts.</div>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="settings-table" aria-label="Households">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {households.map((household) => {
                    const isSelected = household.id === activeHouseholdId;
                    return (
                      <tr key={household.id} className={isSelected ? "selected-household-row" : ""}>
                        <td>{household.name}</td>
                        <td>{isSelected ? <span className="selected-pill">Selected</span> : "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="primary-pill"
                            onClick={() => onSwitchHousehold(household.id)}
                            disabled={isSelected || isContextLoading}
                          >
                            {isSelected ? "Active" : "Select"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {contextError ? (
            <div className="coming-soon-card">
              <strong>{contextError}</strong>
              <div>
                <button type="button" className="primary-pill" onClick={onRetryContextAction}>
                  Try again
                </button>
              </div>
            </div>
          ) : null}

          {isContextLoading ? (
            <div className="coming-soon-card">
              <strong>Loading selected household…</strong>
            </div>
          ) : null}

          <HouseholdDialog
            open={householdModalOpen}
            householdName={newHouseholdName}
            householdNameError={createHouseholdNameError}
            requestError={createHouseholdError}
            isSubmitting={isCreatingHousehold}
            onClose={closeAddHousehold}
            onSubmit={submitCreateHousehold}
            onHouseholdNameChange={(value) => {
              setNewHouseholdName(value);
              setCreateHouseholdError(null);
            }}
          />
        </section>
        ) : null}

        {showSettingsWorkspace ? (
        <section className="settings-card">
          <div className="section-toolbar">
            <h2>Household Members</h2>
            <button type="button" className="primary-pill" onClick={openAddMember} disabled={!canEditActiveHousehold}>
              + Member
            </button>
          </div>

          {!activeHouseholdId ? <div className="coming-soon-card">Select or create a household to manage members.</div> : null}

          <div className="table-scroll">
            <table className="settings-table" aria-label="Household members">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Order</th>
                  <th>Visible</th>
                  <th>Color</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(canEditActiveHousehold ? orderedMembers : []).map((member, index) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-header">
                        <span className="avatar" style={{ backgroundColor: member.avatarColor }}>
                          {member.firstName.charAt(0)}
                        </span>
                        <span>
                          {member.firstName}
                          {member.role ? <small> · {member.role}</small> : null}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="icon-actions">
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          onClick={() => moveMember(member.id, -1)}
                          disabled={index === 0}
                          title="Move up"
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          onClick={() => moveMember(member.id, 1)}
                          disabled={index === orderedMembers.length - 1}
                          title="Move down"
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </button>
                      </div>
                    </td>
                    <td>
                      <label className="switch-label">
                        <input
                          type="checkbox"
                          checked={member.visibleInCalendar}
                          onChange={(event) =>
                            updateMemberRow(member.id, (current) => ({ ...current, visibleInCalendar: event.target.checked }))
                          }
                        />
                        <span>{member.visibleInCalendar ? "On" : "Off"}</span>
                      </label>
                    </td>
                    <td>
                      <select
                        value={member.avatarColor}
                        onChange={(event) =>
                          updateMemberRow(member.id, (current) => ({
                            ...current,
                            avatarColor: event.target.value as MemberAvatarColor,
                          }))
                        }
                      >
                        {MEMBER_COLORS.map((color) => (
                          <option key={color} value={color}>
                            {getMemberColorLabel(color)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="icon-button compact-icon-button" onClick={() => openEditMember(member)}>
                        <EditOutlinedIcon fontSize="small" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <MemberDialog
            open={memberModalOpen}
            editing={Boolean(editingMemberId)}
            colors={MEMBER_COLORS}
            formState={memberFormState}
            firstNameError={memberFirstNameError}
            onClose={closeMemberModal}
            onSubmit={submitMember}
            onFirstNameChange={(value) => setMemberFormState((current) => ({ ...current, firstName: value }))}
            onRoleChange={(value) => setMemberFormState((current) => ({ ...current, role: value }))}
            onAvatarColorChange={(value) => setMemberFormState((current) => ({ ...current, avatarColor: value }))}
            onVisibleInCalendarChange={(value) => setMemberFormState((current) => ({ ...current, visibleInCalendar: value }))}
          />
        </section>
        ) : null}

        {showSettingsWorkspace ? (
        <section className="settings-card">
          <div className="section-toolbar responsive-toolbar">
            <h2>Contact List</h2>
            <div className="toolbar-controls">
              <input
                type="search"
                placeholder="Search contacts"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                disabled={!canEditActiveHousehold}
              />
              <button
                type="button"
                className="primary-pill no-wrap-button"
                onClick={openAddContact}
                disabled={!canEditActiveHousehold}
              >
                + Contact
              </button>
            </div>
          </div>

          {!activeHouseholdId ? <div className="coming-soon-card">Select or create a household to manage contacts.</div> : null}

          <div className="table-scroll">
            <table className="settings-table" aria-label="Contacts">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Birthday</th>
                  <th>Mobile Phone</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(canEditActiveHousehold ? filteredContacts : []).map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="member-header">
                        <span>{`${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`}</span>
                      </div>
                    </td>
                    <td>{formatContactBirthday(contact)}</td>
                    <td>{contact.mobilePhone ?? "—"}</td>
                    <td>
                      <div className="icon-actions">
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          title="Edit contact"
                          onClick={() => openEditContact(contact)}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          title="Delete contact"
                          onClick={() => deleteContact(contact.id)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ContactDialog
            open={contactModalOpen}
            editing={Boolean(editingContactId)}
            formState={contactFormState}
            firstNameError={contactFirstNameError}
            birthdayMissingError={contactBirthdayMissingError}
            birthdayRangeError={contactBirthdayRangeError}
            onClose={closeContactModal}
            onSubmit={submitContact}
            onFormStateChange={(updater) => setContactFormState((current) => updater(current))}
          />
        </section>
        ) : null}
      </main>
    </div>
  );
}
