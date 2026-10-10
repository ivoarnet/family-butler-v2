import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import HomeIcon from "@mui/icons-material/Home";
import type { ReactNode } from "react";

export function ReportsPage({ householdName, onGoHome, moduleNavigation }: {
  householdName: string;
  onGoHome: () => void;
  moduleNavigation?: ReactNode;
}) {
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
          {moduleNavigation}
          <div>
            <h1>Reports &amp; exports</h1>
            <p>{householdName}</p>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onGoHome} title="Go to dashboard" aria-label="Go to dashboard">
          <HomeIcon fontSize="small" />
        </button>
      </header>
      <main className="settings-main">
        <section className="settings-card report-future-panel" aria-label="Reports and exports coming soon">
          <div className="report-empty-state">
            <AssessmentOutlinedIcon fontSize="large" aria-hidden="true" />
            <h2>More reports and exports are coming</h2>
            <p>Household reports and download options will be available here in a future release.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
