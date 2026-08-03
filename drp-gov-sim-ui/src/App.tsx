import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import './index.css';

const getBackendUrl = () => {
  let url = (import.meta.env.VITE_ZKP_SERVER_URL || 'http://localhost:5001/api').trim();
  url = url.replace(/\/+$/, '');
  if (!url.endsWith('/api')) {
    url = `${url}/api`;
  }
  return url;
};
const ZKP_BACKEND_URL = getBackendUrl();
const ENV_PRIVATE_KEY =
  import.meta.env.VITE_FRONTEND_PRIVATE_KEY &&
  import.meta.env.VITE_FRONTEND_PRIVATE_KEY !== 'your_private_key_here'
    ? import.meta.env.VITE_FRONTEND_PRIVATE_KEY
    : '';
const ENV_REGISTRATION_SECRET =
  import.meta.env.VITE_REGISTRATION_SECRET &&
  import.meta.env.VITE_REGISTRATION_SECRET !== 'your_admin_secret_here' &&
  import.meta.env.VITE_REGISTRATION_SECRET !== 'default_admin_secret'
    ? import.meta.env.VITE_REGISTRATION_SECRET
    : 'GQZa8aPRmwxNn1uNMufqIJzCDJJZJwsDShxVb4/YGx0';
const DAPP_LOGIN_URL = 'https://dapp.internalbuildtools.online/';

export function App() {
  // Registration Wizard State
  // 1 = Registration Form Page (Student Register ID / GovID *, Account Password *, Confirm Password *)
  // 2 = Success Completion & DApp Login Link
  const [regStep, setRegStep] = useState<1 | 2>(1);

  // Registration Form State (Only requested fields: GovID, Password, Confirm Password)
  const [govId, setGovId] = useState('EG/2021/1001');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationSecret] = useState(ENV_REGISTRATION_SECRET);

  // Client Wallet for ECDSA Signature (handled automatically in background)
  const [clientWallet, setClientWallet] = useState<ethers.HDNodeWallet | ethers.Wallet | null>(null);
  const [timestamp, setTimestamp] = useState<number>(Date.now());
  const [signature, setSignature] = useState<string>('');

  // Submission Status & Result Details
  const [loading, setLoading] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: any;
  } | null>(null);

  // Generate or load signing wallet on component mount
  useEffect(() => {
    if (ENV_PRIVATE_KEY) {
      try {
        const wallet = new ethers.Wallet(ENV_PRIVATE_KEY);
        setClientWallet(wallet);
        return;
      } catch (e) {
        console.warn('Invalid VITE_FRONTEND_PRIVATE_KEY in .env, generating random wallet instead.');
      }
    }
    generateNewWallet();
  }, []);

  const generateNewWallet = () => {
    const newWallet = ethers.Wallet.createRandom();
    setClientWallet(newWallet);
  };

  // Derive a canonical name from GovID so backend validation succeeds cleanly
  const resolvedName = useMemo(() => {
    return govId.trim() ? `Student (${govId.trim()})` : 'Student Citizen';
  }, [govId]);

  // Canonical message format for registration verification
  const canonicalMessage = useMemo(() => {
    return `ZKP-GovID Registration\nGovID: ${govId.trim().toUpperCase()}\nName: ${resolvedName}\nTimestamp: ${timestamp}`;
  }, [govId, resolvedName, timestamp]);

  // Recalculate signature when wallet or input changes
  useEffect(() => {
    let isCancelled = false;
    const signPayload = async () => {
      if (!clientWallet || !govId.trim()) {
        setSignature('');
        return;
      }
      try {
        const sig = await clientWallet.signMessage(canonicalMessage);
        if (!isCancelled) {
          setSignature(sig);
        }
      } catch (err) {
        console.error('Signing error:', err);
      }
    };

    signPayload();
    return () => {
      isCancelled = true;
    };
  }, [clientWallet, canonicalMessage, govId]);

  const setPresetStudentId = (preset: string) => {
    setGovId(preset);
  };

  // Handle Complete Registration (Validates fields & submits to ZKP backend)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus(null);

    // Validate fields
    if (!govId.trim()) {
      setRegisterStatus({ type: 'error', message: 'Please enter a Student Register ID / GovID.' });
      return;
    }
    if (!password) {
      setRegisterStatus({ type: 'error', message: 'Please set an Account Password for your digital identity.' });
      return;
    }
    if (!confirmPassword) {
      setRegisterStatus({ type: 'error', message: 'Please confirm your Account Password.' });
      return;
    }
    if (password !== confirmPassword) {
      setRegisterStatus({
        type: 'error',
        message: 'Passwords do not match. Please ensure both Account Password and Password Confirmation are identical.'
      });
      return;
    }

    if (!clientWallet || !signature) {
      setRegisterStatus({ type: 'error', message: 'Cryptographic signature is generating. Please try again.' });
      return;
    }

    setLoading(true);
    const currentTimestamp = Date.now();
    setTimestamp(currentTimestamp);

    try {
      const freshMessage = `ZKP-GovID Registration\nGovID: ${govId.trim().toUpperCase()}\nName: ${resolvedName}\nTimestamp: ${currentTimestamp}`;
      const freshSignature = await clientWallet.signMessage(freshMessage);

      const payload = {
        govId: govId.trim(),
        password,
        name: resolvedName,
        timestamp: currentTimestamp,
        signature: freshSignature,
        signerAddress: clientWallet.address,
        secret: registrationSecret
      };

      const response = await fetch(`${ZKP_BACKEND_URL}/govid/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setRegisterStatus({
          type: 'success',
          message: `Identity successfully enrolled! Registered Student ID: ${govId.trim()}`,
          details: data.citizen
        });
        // Move directly to celebratory completion screen!
        setRegStep(2);
      } else {
        setRegisterStatus({
          type: 'error',
          message: data.error || 'Failed to enroll student identity.'
        });
      }
    } catch (err: any) {
      console.error('Registration fetch error:', err);
      setRegisterStatus({
        type: 'error',
        message: `Could not connect to ZKP GovID server at ${ZKP_BACKEND_URL}. Ensure backend server is running.`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAnother = () => {
    setGovId('EG/2021/1001');
    setPassword('');
    setConfirmPassword('');
    setRegisterStatus(null);
    setRegStep(1);
    generateNewWallet();
  };

  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="app-shell">
      {/* SaaS App Shell Topbar (NO TABS) */}
      <header className="app-topbar">
        <div className="brand-block">
          <div className="brand-icon">🏛️</div>
          <div className="brand-text">
            <h1>ZKP GovID Authority Node</h1>
            <p>Decentralized Student &amp; Citizen Identity Enrollment</p>
          </div>
        </div>

        {/* Topbar right side: Network status indicator only */}
        <div className="topbar-actions">
          <div className="node-status-pill">
            <span className="status-indicator"></span>
            <span>AuraChain Network • Connected</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main className="main-workspace">
        <div>
          {/* ========================================================
             WIZARD CARD WRAPPER FOR STEPS 1 AND 2
             ======================================================== */}
          <div className="wizard-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
              {/* Global Error Banner if any */}
              {registerStatus && registerStatus.type === 'error' && (
                <div className="status-banner status-error" style={{ margin: '20px 32px 0' }}>
                  <span style={{ fontSize: '18px' }}>⚠️</span>
                  <div><strong>{registerStatus.message}</strong></div>
                </div>
              )}

              {/* STEP 1: STUDENT REGISTER ID / GOVID & PASSWORD (ONLY STEP BEFORE SUCCESS) */}
              {regStep === 1 && (
                <form onSubmit={handleRegister}>
                  <div className="wizard-header">
                    <div className="wizard-header-text">
                      <h2>Student Identity Registration</h2>
                      <p>Enter your Student Register ID / GovID and set a secure account password to enroll.</p>
                    </div>
                    <span className="step-counter-badge">SECURE ENROLLMENT</span>
                  </div>

                  <div className="wizard-body">
                    <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '22px' }}>
                      {/* Field 1: Student Register ID / GovID * */}
                      <div className="input-block">
                        <div className="label-row">
                          <span className="input-label">Student Register ID / GovID *</span>
                          <span className="label-tag">PRIMARY KEY</span>
                        </div>
                        <input
                          type="text"
                          className="clean-input"
                          placeholder="e.g. EG/2021/1001 or 199912345678"
                          value={govId}
                          onChange={(e) => setGovId(e.target.value)}
                          required
                          autoFocus
                        />
                        <div className="preset-strip">
                          <button type="button" className="preset-chip" onClick={() => setPresetStudentId('EG/2021/1001')}>
                            + EG/2021/1001
                          </button>
                          <button type="button" className="preset-chip" onClick={() => setPresetStudentId('EG/2020/0452')}>
                            + EG/2020/0452
                          </button>
                          <button type="button" className="preset-chip" onClick={() => setPresetStudentId('199812345678')}>
                            + 12-Digit NIC
                          </button>
                        </div>
                      </div>

                      {/* Field 2: Account Password * */}
                      <div className="input-block">
                        <div className="label-row">
                          <span className="input-label">Account Password *</span>
                        </div>
                        <div className="input-container" style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            className="clean-input"
                            placeholder="Set account password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ whiteSpace: 'nowrap', padding: '12px 18px', fontWeight: '700' }}
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>

                      {/* Field 3: Confirm Password * */}
                      <div className="input-block">
                        <div className="label-row">
                          <span className="input-label">Confirm Password *</span>
                          {passwordsMatch && (
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              ✓ Passwords match
                            </span>
                          )}
                          {passwordsMismatch && (
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              ✕ Passwords do not match
                            </span>
                          )}
                        </div>
                        <div className="input-container" style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            className="clean-input"
                            placeholder="Re-enter account password to confirm"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ whiteSpace: 'nowrap', padding: '12px 18px', fontWeight: '700' }}
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="wizard-footer" style={{ justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn-civic" disabled={loading}>
                      {loading ? 'Enrolling Identity...' : '⚡ Complete Digital Registration'}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2: SUCCESS COMPLETION SCREEN & DAPP LOGIN LINK */}
              {regStep === 2 && (
                <div className="success-screen">
                  <div className="success-icon-circle">✓</div>
                  <h2 className="success-title">🎉 You Have Successfully Completed Digital Identity Registration!</h2>
                  <p className="success-subtitle">
                    Your student / civic identity has been cryptographically signed and enrolled in the Zero-Knowledge credential ledger.
                  </p>

                  {/* Enrolled Profile Summary */}
                  <div className="success-profile-summary">
                    <div className="summary-row">
                      <span className="summary-label">Student ID / GovID</span>
                      <span className="summary-value" style={{ fontWeight: '800', color: '#0f172a' }}>{govId}</span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Enrolled Status</span>
                      <span className="summary-value" style={{ color: '#16a34a', fontWeight: '700' }}>✓ Verified ZKP Citizen</span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Signer Address</span>
                      <span className="summary-value" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#2563eb' }}>
                        {clientWallet?.address}
                      </span>
                    </div>
                  </div>

                  {/* Prominent DApp Login Box */}
                  <div className="dapp-link-card">
                    <span style={{ fontSize: '32px' }}>🏛️</span>
                    <h3 className="dapp-link-title">Ready for Decentralized Governance</h3>
                    <p className="dapp-link-desc">
                      You can now log into the Decentralized Civic Governance DApp using your registered credentials (<strong>{govId}</strong>) to participate in voting and civic proposals.
                    </p>

                    <a
                      href={DAPP_LOGIN_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-dapp-cta"
                    >
                      <span>🚀</span>
                      <span>Open Governance DApp ({DAPP_LOGIN_URL})</span>
                    </a>
                  </div>

                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleRegisterAnother}
                    >
                      🔄 Enroll Another Student Identity
                    </button>
                  </div>
                </div>
              )}
            </div>
        </div>
      </main>
    </div>
  );
}

export default App;
