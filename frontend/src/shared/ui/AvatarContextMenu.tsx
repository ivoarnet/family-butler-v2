interface AvatarContextMenuProps {
  currentUserLabel: string;
  currentUserEmail: string;
  currentUserInitials: string;
  currentUserAvatarUrl: string | null;
  onProfileClick: () => void;
  onHouseholdsClick: () => void;
  onLogoutClick: () => void;
}

export function AvatarContextMenu({
  currentUserLabel,
  currentUserEmail,
  currentUserInitials,
  currentUserAvatarUrl,
  onProfileClick,
  onHouseholdsClick,
  onLogoutClick,
}: AvatarContextMenuProps) {
  return (
    <div className="avatar-context-menu" role="menu" aria-label="Account menu">
      <div className="avatar-menu-header">
        <span className="avatar-menu-profile-avatar" aria-hidden>
          {currentUserAvatarUrl ? <img src={currentUserAvatarUrl} alt="" /> : currentUserInitials}
        </span>
        <div className="avatar-menu-profile-meta">
          <strong>{currentUserLabel}</strong>
          <span>{currentUserEmail || "No email available"}</span>
        </div>
      </div>
      <div className="avatar-menu-section">
        <button type="button" className="avatar-menu-link" onClick={onProfileClick}>
          <span>My profile</span>
          <span aria-hidden>›</span>
        </button>
        <button type="button" className="avatar-menu-link" onClick={onHouseholdsClick}>
          <span>My households</span>
          <span aria-hidden>›</span>
        </button>
      </div>
      <div className="avatar-menu-actions">
        <button type="button" className="primary-pill avatar-menu-logout-button" onClick={onLogoutClick}>
          Logout
        </button>
      </div>
    </div>
  );
}
