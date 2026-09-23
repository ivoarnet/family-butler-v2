import { FormEvent } from "react";

export function SignInScreen({
  email,
  credential,
  onEmailChange,
  onCredentialChange,
  onSubmit,
  isSigningIn,
  error,
}: {
  email: string;
  credential: string;
  onEmailChange: (value: string) => void;
  onCredentialChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  isSigningIn: boolean;
  error: string | null;
}) {
  return (
    <div className="dashboard-page">
      <main className="dashboard-main">
        <section className="calendar-card">
          <h1>Sign in</h1>
          <p>Use your Family Butler email/password account.</p>
          <form onSubmit={onSubmit}>
            <p>
              <label htmlFor="login-email">Email</label>
              <br />
              <input id="login-email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} autoComplete="email" required />
            </p>
            <p>
              <label htmlFor="login-password">Password</label>
              <br />
              <input
                id="login-password"
                type="password"
                value={credential}
                onChange={(event) => onCredentialChange(event.target.value)}
                autoComplete="current-password"
                required
              />
            </p>
            <button type="submit" className="primary-pill" disabled={isSigningIn}>
              {isSigningIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {error ? <p role="alert">{error}</p> : null}
        </section>
      </main>
    </div>
  );
}
