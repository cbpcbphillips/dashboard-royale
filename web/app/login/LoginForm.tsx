"use client";

import { useActionState } from "react";
import { type LoginState, demoAccess, signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <div className="login-forms">
      <form action={demoAccess} className="login-judge">
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="btn-primary">Judge / demo access</button>
        <p className="login-note">Judges: one click, no account. Opens the full dashboard read-only.</p>
      </form>
      <div className="login-or"><span>or staff sign-in</span></div>
      <form action={action} className="login-form" aria-describedby={state.error ? "login-error" : undefined}>
        <input type="hidden" name="next" value={next} />
        <label className="login-field">
          Work email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="login-field">
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {state.error && <p id="login-error" className="login-error" role="alert">{state.error}</p>}
        <button type="submit" className="btn-secondary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
