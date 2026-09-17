import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register, confirmRegistration, login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptLegal, setAcceptLegal] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [destination, setDestination] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await register(name, username, email, password, acceptLegal);
      if (result.requiresConfirmation) {
        setAwaitingConfirmation(true);
        setDestination(result.destination || email);
      } else navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmation(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      await confirmRegistration(username, confirmationCode);
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Confirmation failed");
    } finally { setBusy(false); }
  }

  if (awaitingConfirmation) return <div className="auth-page"><form className="auth-card" onSubmit={handleConfirmation}><span className="eyebrow">AWS COGNITO</span><h1>Confirm your account</h1><p className="subtitle">Enter the six-digit code sent to {destination}.</p>{error && <div className="error-banner">{error}</div>}<label>Confirmation code</label><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={confirmationCode} onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, ""))} autoFocus required /><button type="submit" disabled={busy || confirmationCode.length !== 6}>{busy ? "Verifying..." : "Verify and continue"}</button></form></div>;

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Create account</h1>
        <p className="subtitle">Set up your Karmex LTS workspace</p>

        {error && <div className="error-banner">{error}</div>}

        <label>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label>Unique username</label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength={3} maxLength={24} placeholder="your_username" required />

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        <label className="legal-consent">
          <input type="checkbox" checked={acceptLegal} onChange={(e) => setAcceptLegal(e.target.checked)} required />
          <span>I agree to the <Link to="/terms" target="_blank">Terms v1.6</Link> and acknowledge the <Link to="/privacy" target="_blank">Privacy Policy v1.6</Link>.</span>
        </label>

        <button type="submit" disabled={busy || !acceptLegal}>
          {busy ? "Creating..." : "Sign Up"}
        </button>

        <p className="switch-link">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
        <p className="auth-legal">By creating an account, you agree to our <Link to="/terms">Terms</Link> and acknowledge our <Link to="/privacy">Privacy Policy</Link>.</p>
      </form>
    </div>
  );
}
