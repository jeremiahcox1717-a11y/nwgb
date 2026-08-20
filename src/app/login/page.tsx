import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <section className="login-card">
        <p className="whisper">Private access</p>
        <h1>NWGB</h1>
        <p>
          This finder is locked. It is not a public directory. Only people with
          the password can see Google listings without websites.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
