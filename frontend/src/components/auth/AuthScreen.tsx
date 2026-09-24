import { FormEvent, useMemo, useState } from "react";
import { Button, Typography } from "@mui/material";
import { FormField, GradientButton } from "../GlassFormDialog";

type AuthMode = "login" | "register";

interface AuthScreenProps {
  isSubmitting: boolean;
  errorMessage: string | null;
  infoMessage: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, fullName: string) => Promise<void>;
}

const teaserSlides = [
  "Keep birthdays and family plans together.",
  "Track household contacts in one place.",
  "Get ready for upcoming Family Butler features.",
];

export function AuthScreen({ isSubmitting, errorMessage, infoMessage, onLogin, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const emailError = submitted && !email.trim();
  const passwordError = submitted && !password.trim();
  const confirmPasswordError = mode === "register" && submitted && confirmPassword !== password;

  const activeTeaser = useMemo(() => {
    if (mode === "register") {
      return teaserSlides[0];
    }
    return teaserSlides[1];
  }, [mode]);

  const resetForm = () => {
    setSubmitted(false);
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);

    if (!email.trim() || !password.trim()) {
      return;
    }

    if (mode === "register") {
      if (confirmPassword !== password) {
        return;
      }
      await onRegister(email.trim(), password, fullName.trim());
      return;
    }

    await onLogin(email.trim(), password);
  };

  return (
    <div className="auth-page">
      <div className="auth-card" role="region" aria-label="Authentication">
        <aside className="auth-teaser" aria-hidden>
          <div className="auth-teaser-overlay" />
          <div className="auth-teaser-content">
            <strong>Family Butler</strong>
            <p>{activeTeaser}</p>
            <div className="auth-teaser-dots">
              <span className={mode === "register" ? "active" : ""} />
              <span className={mode === "login" ? "active" : ""} />
              <span />
            </div>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                resetForm();
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                resetForm();
              }}
            >
              Register
            </button>
          </div>

          <Typography variant="h4" component="h1" sx={{ margin: 0, fontWeight: 700 }}>
            {mode === "register" ? "Create an account" : "Welcome back"}
          </Typography>

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === "register" ? (
              <FormField
                label="Full name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="Optional"
              />
            ) : null}

            <FormField
              required
              type="email"
              label="Email"
              value={email}
              error={emailError}
              helperText={emailError ? "Email is required." : " "}
              onChange={(event) => setEmail(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <FormField
              required
              type="password"
              label="Password"
              value={password}
              error={passwordError}
              helperText={passwordError ? "Password is required." : " "}
              onChange={(event) => setPassword(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            {mode === "register" ? (
              <FormField
                required
                type="password"
                label="Confirm password"
                value={confirmPassword}
                error={confirmPasswordError}
                helperText={confirmPasswordError ? "Passwords do not match." : " "}
                onChange={(event) => setConfirmPassword(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            ) : null}

            {errorMessage ? (
              <Typography color="error" variant="body2" role="alert">
                {errorMessage}
              </Typography>
            ) : null}

            {infoMessage ? (
              <Typography sx={{ color: "var(--dialog-soft-text)" }} variant="body2" role="status">
                {infoMessage}
              </Typography>
            ) : null}

            <GradientButton type="submit" variant="contained" disableElevation disabled={isSubmitting}>
              {mode === "register" ? "Create account" : "Sign in"}
            </GradientButton>

            <div className="auth-social-divider" aria-hidden>
              <span />
              <small>Social login can be added next</small>
              <span />
            </div>

            <div className="auth-social-actions">
              <Button type="button" variant="outlined" disabled>
                Google
              </Button>
              <Button type="button" variant="outlined" disabled>
                Apple
              </Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
