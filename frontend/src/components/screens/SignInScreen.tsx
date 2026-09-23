import { FormEvent, useMemo, useState } from "react";

export function SignInScreen({
  onSignIn,
  onRegister,
  onForgotPassword,
  isSubmitting,
  error,
  info,
  theme,
  onToggleTheme,
}: {
  onSignIn: (payload: { email: string; password: string }) => Promise<void>;
  onRegister: (payload: { fullName: string; email: string; password: string }) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  info: string | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const trimmedEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const passwordLooksValid = password.length >= 8;
  const fullNameLooksValid = fullName.trim().length >= 2;
  const passwordsMatch = password === confirmPassword;
  const isRegister = mode === "register";

  const validationMessage = useMemo(() => {
    if (!submitted) {
      return null;
    }

    if (isRegister && !fullNameLooksValid) {
      return "Please enter your full name.";
    }
    if (!emailLooksValid) {
      return "Please enter a valid email address.";
    }
    if (!passwordLooksValid) {
      return "Password must be at least 8 characters.";
    }
    if (isRegister && !passwordsMatch) {
      return "Passwords do not match.";
    }
    return null;
  }, [submitted, isRegister, fullNameLooksValid, emailLooksValid, passwordLooksValid, passwordsMatch]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);

    if (validationMessage) {
      return;
    }

    if (isRegister) {
      await onRegister({
        fullName: fullName.trim(),
        email: trimmedEmail,
        password,
      });
      return;
    }

    await onSignIn({
      email: trimmedEmail,
      password,
    });
  };

  const handleForgotPassword = async () => {
    setSubmitted(true);
    if (!emailLooksValid) {
      return;
    }
    await onForgotPassword(trimmedEmail);
  };

  return (
    <div className="auth-page">
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <aside className="auth-visual" aria-hidden>
            <div className="auth-visual-overlay">
              <p className="auth-visual-eyebrow">Family Butler</p>
              <h2>Organize your household with calm, shared routines.</h2>
              <p>Stay aligned on schedules, members, and contacts in one elegant family workspace.</p>
            </div>
          </aside>

          <div className="auth-form-column">
            <div className="auth-topbar">
              <button type="button" className="auth-theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">
                {theme === "dark" ? "☀ Light" : "☾ Dark"}
              </button>
            </div>

            <div className="auth-heading">
              <h1 id="auth-title">{isRegister ? "Create your account" : "Welcome back"}</h1>
              <p>{isRegister ? "Already have an account?" : "New to Family Butler?"}</p>
              <button
                type="button"
                className="auth-inline-link"
                onClick={() => {
                  setMode((current) => (current === "signin" ? "register" : "signin"));
                  setSubmitted(false);
                }}
              >
                {isRegister ? "Sign in" : "Create an account"}
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              {isRegister ? (
                <label className="auth-field">
                  <span className="auth-field-label">Full name</span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    aria-invalid={submitted && !fullNameLooksValid}
                  />
                </label>
              ) : null}

              <label className="auth-field">
                <span className="auth-field-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  aria-invalid={submitted && !emailLooksValid}
                />
              </label>

              <label className="auth-field auth-field-with-action">
                <span className="auth-field-label">Password</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  aria-invalid={submitted && !passwordLooksValid}
                />
                <button
                  type="button"
                  className="auth-field-action"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </label>

              {isRegister ? (
                <label className="auth-field auth-field-with-action">
                  <span className="auth-field-label">Confirm password</span>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    aria-invalid={submitted && !passwordsMatch}
                  />
                  <button
                    type="button"
                    className="auth-field-action"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </label>
              ) : (
                <button type="button" className="auth-inline-link auth-forgot-link" onClick={handleForgotPassword}>
                  Forgot password?
                </button>
              )}

              {validationMessage ? (
                <p className="auth-message auth-message-error" role="alert">
                  {validationMessage}
                </p>
              ) : null}
              {error ? (
                <p className="auth-message auth-message-error" role="alert">
                  {error}
                </p>
              ) : null}
              {info ? <p className="auth-message auth-message-info">{info}</p> : null}

              <button type="submit" className="auth-submit" disabled={isSubmitting}>
                {isSubmitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
              </button>
            </form>

            <div className="auth-divider" aria-hidden>
              <span>Or continue with</span>
            </div>
            <div className="auth-social-grid">
              <button type="button" className="auth-social" disabled aria-disabled="true">
                Google (coming soon)
              </button>
              <button type="button" className="auth-social" disabled aria-disabled="true">
                Apple (coming soon)
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
