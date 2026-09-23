import { FormEvent, useEffect, useMemo, useState } from "react";
import { ContactDialog } from "../ContactDialog";
import { MemberDialog } from "../MemberDialog";
import { HouseholdData } from "../../types/app";
import { FamilyMember, MemberAvatarColor } from "../../types/family";
import {
  ContactFormState,
  MemberFormState,
  MEMBER_COLORS,
  buildContactFormState,
  buildMemberFormState,
  formatContactBirthday,
  getBestAvailableColor,
  getMemberColorLabel,
  normalizeFamilyMembers,
} from "../../utils/familyUtils";

export function SettingsScreen({
  householdData,
  setHouseholdData,
  onGoHome,
}: {
  householdData: HouseholdData;
  setHouseholdData: React.Dispatch<React.SetStateAction<HouseholdData>>;
  onGoHome: () => void;
}) {
  const [householdNameDraft, setHouseholdNameDraft] = useState(householdData.householdName);
  const [memberFormState, setMemberFormState] = useState<MemberFormState>(buildMemberFormState);
  const [contactFormState, setContactFormState] = useState<ContactFormState>(buildContactFormState);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberFormSubmitted, setMemberFormSubmitted] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactFormSubmitted, setContactFormSubmitted] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  useEffect(() => {
    setHouseholdNameDraft(householdData.householdName);
  }, [householdData.householdName]);

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

  const saveHouseholdName = () => {
    const trimmed = householdNameDraft.trim();
    if (!trimmed) {
      return;
    }
    setHouseholdData((current) => ({ ...current, householdName: trimmed }));
    setHouseholdNameDraft(trimmed);
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

  const openEditContact = (contact: HouseholdData["contacts"][number]) => {
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

    const preparedContact = {
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
          ←
        </button>
        <div className="header-branding">
          <div>
            <h1>Settings</h1>
            <p>Household, family members, contacts</p>
          </div>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onGoHome}
          title="Go to dashboard"
          aria-label="Go to dashboard"
        >
          ⌂
        </button>
      </header>

      <main className="settings-main">
        <section className="settings-card">
          <h2>Household Setting</h2>
          <div className="settings-form-row">
            <label htmlFor="household-name">Household name</label>
            <div className="inline-controls">
              <input id="household-name" type="text" value={householdNameDraft} onChange={(event) => setHouseholdNameDraft(event.target.value)} />
              <button type="button" className="primary-pill" onClick={saveHouseholdName}>
                Save
              </button>
            </div>
          </div>
          <div className="coming-soon-card">
            <strong>More household settings are coming soon.</strong>
          </div>
        </section>

        <section className="settings-card">
          <div className="section-toolbar">
            <h2>Household Members</h2>
            <button type="button" className="primary-pill" onClick={openAddMember}>
              + Member
            </button>
          </div>

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
                {orderedMembers.map((member, index) => (
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
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          onClick={() => moveMember(member.id, 1)}
                          disabled={index === orderedMembers.length - 1}
                          title="Move down"
                        >
                          ↓
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
                        ✎
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

        <section className="settings-card">
          <div className="section-toolbar responsive-toolbar">
            <h2>Contact List</h2>
            <div className="toolbar-controls">
              <input type="search" placeholder="Search contacts" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} />
              <button type="button" className="primary-pill no-wrap-button" onClick={openAddContact}>
                + Contact
              </button>
            </div>
          </div>

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
                {filteredContacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <div className="member-header">
                        <span className="avatar avatar-birthday">🎂</span>
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
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-button compact-icon-button"
                          title="Delete contact"
                          onClick={() => deleteContact(contact.id)}
                        >
                          🗑
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
      </main>
    </div>
  );
}
