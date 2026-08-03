import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import './index.css';

const ZKP_BACKEND_URL = import.meta.env.VITE_ZKP_SERVER_URL || 'http://localhost:5001/api';
const ENV_PRIVATE_KEY = import.meta.env.VITE_FRONTEND_PRIVATE_KEY || '';
const ENV_REGISTRATION_SECRET = import.meta.env.VITE_REGISTRATION_SECRET || 'default_admin_secret';
const DAPP_LOGIN_URL = 'https://dapp.internalbuildtools.online/';

export function App() {
  // Navigation State
  const [workspace, setWorkspace] = useState<'studio' | 'vault' | 'telemetry'>('studio');

  // Multi-Step Registration Wizard State
  // 0 = Hero Welcome Landing Page
  // 1 = Step 1: Student ID & Name
  // 2 = Step 2: Password & Contact Profile
  // 3 = Step 3: Cryptographic Signature & Commitment
  // 4 = Step 4: Success Completion & DApp Login Link
  const [regStep, setRegStep] = useState<0 | 1 | 2 | 3 | 4>(0);

  // Registration Form State (100% of fields preserved)
  const [govId, setGovId] = useState('EG/2021/1001');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [registrationSecret, setRegistrationSecret] = useState(ENV_REGISTRATION_SECRET);
  const [showPassword, setShowPassword] = useState(false);

  // Client Wallet for ECDSA Signature
  const [clientWallet, setClientWallet] = useState<ethers.HDNodeWallet | ethers.Wallet | null>(null);
  const [timestamp, setTimestamp] = useState<number>(Date.now());
  const [signature, setSignature] = useState<string>('');
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Submission Status & Result Details
  const [loading, setLoading] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string; details?: any } | null>(null);

  // ZKP Ticket Vault & Verifier State
  const [loginGovId, setLoginGovId] = useState('EG/2021/1001');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginStatus, setLoginStatus] = useState<{ type: 'success' | 'error'; message: string; data?: any } | null>(null);

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

  // Canonical message format for registration verification
  const canonicalMessage = useMemo(() => {
    return `ZKP-GovID Registration\nGovID: ${govId.trim().toUpperCase()}\nName: ${name.trim()}\nTimestamp: ${timestamp}`;
  }, [govId, name, timestamp]);

  // Recalculate signature when wallet or input changes
  useEffect(() => {
    let isCancelled = false;
    const signPayload = async () => {
      if (!clientWallet || !govId || !name) {
        setSignature('');
        return;
      }
      setIsSigning(true);
      try {
        const sig = await clientWallet.signMessage(canonicalMessage);
        if (!isCancelled) {
          setSignature(sig);
        }
      } catch (err) {
        console.error('Signing error:', err);
      } finally {
        if (!isCancelled) setIsSigning(false);
      }
    };

    signPayload();
    return () => {
      isCancelled = true;
    };
  }, [clientWallet, canonicalMessage, govId, name]);

  const setPresetStudentId = (preset: string) => {
    setGovId(preset);
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Handle Wizard Step Validation & Navigation
  const validateAndNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus(null);
    if (!govId.trim()) {
      setRegisterStatus({ type: 'error', message: 'Please enter a Student Register Number / GovID.' });
      return;
    }
    if (!name.trim()) {
      setRegisterStatus({ type: 'error', message: 'Please enter the student / citizen Full Name.' });
      return;
    }
    setRegStep(2);
  };

  const validateAndNextStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus(null);
    if (!password) {
      setRegisterStatus({ type: 'error', message: 'Please set an Account Password for authentication.' });
      return;
    }
    setRegStep(3);
  };

  // Final Step: Submit Registration to Backend
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus(null);

    if (!clientWallet || !signature) {
      setRegisterStatus({ type: 'error', message: 'Cryptographic signature is generating. Please try again.' });
      return;
    }

    setLoading(true);
    const currentTimestamp = Date.now();
    setTimestamp(currentTimestamp);

    try {
      const freshMessage = `ZKP-GovID Registration\nGovID: ${govId.trim().toUpperCase()}\nName: ${name.trim()}\nTimestamp: ${currentTimestamp}`;
      const freshSignature = await clientWallet.signMessage(freshMessage);

      const payload = {
        govId: govId.trim(),
        password,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
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
          message: `Identity successfully enrolled! Registered to ${data.citizen?.name} (${data.citizen?.govId}).`,
          details: data.citizen
        });
        setLoginGovId(govId.trim());
        setLoginPassword(password);
        // Move to celebratory completion step!
        setRegStep(4);
      } else {
        setRegisterStatus({
          type: 'error',
          message: data.error || 'Failed to register citizen identity.'
        });
      }
    } catch (err: any) {
      console.error('Registration fetch error:', err);
      setRegisterStatus({
        type: 'error',
        message: 'Could not connect to ZKP GovID server at ' + ZKP_BACKEND_URL + '. Ensure backend server is running.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset wizard to register another identity
  const handleRegisterAnother = () => {
    setGovId('');
    setPassword('');
    setName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setRegisterStatus(null);
    setRegStep(1);
  };

  // Handle Vault Ticket Verification (Other Tabs - Unchanged)
  const handleTestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginStatus(null);

    if (!loginGovId || !loginPassword) {
      setLoginStatus({ type: 'error', message: 'GovID/Student ID and Password are required.' });
      return;
    }

    setLoginLoading(true);
    try {
      const response = await fetch(`${ZKP_BACKEND_URL}/govid/verify-citizen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          govId: loginGovId.trim(),
          password: loginPassword
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setLoginStatus({
          type: 'success',
          message: 'Identity verified successfully! Zero-Knowledge Credentials unlocked.',
          data
        });
      } else {
        setLoginStatus({
          type: 'error',
          message: data.error || 'Authentication failed.'
        });
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setLoginStatus({
        type: 'error',
        message: 'Failed to connect to ZKP server.'
      });
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="app-shell">
      {/* SaaS App Shell Topbar */}
      <header className="app-topbar">
        <div className="brand-block">
          <div className="brand-icon">🏛️</div>
          <div className="brand-text">
            <h1>ZKP GovID Authority Node</h1>
            <p>Decentralized Citizen Identity &amp; Cryptographic Proof Engine</p>
          </div>
        </div>

        {/* View Switcher */}
        <div className="view-switcher">
          <button
            type="button"
            className={`view-btn ${workspace === 'studio' ? 'active' : ''}`}
            onClick={() => { setWorkspace('studio'); }}
          >
            <span>📝</span> Identity Studio
          </button>
          <button
            type="button"
            className={`view-btn ${workspace === 'vault' ? 'active' : ''}`}
            onClick={() => setWorkspace('vault')}
          >
            <span>🔐</span> Credential Vault
          </button>
          <button
            type="button"
            className={`view-btn ${workspace === 'telemetry' ? 'active' : ''}`}
            onClick={() => setWorkspace('telemetry')}
          >
            <span>📊</span> Node Architecture
          </button>
        </div>

        <div className="topbar-actions">
          <div className="node-status-pill">
            <span className="status-indicator"></span>
            <span>Simulator Active (Port 5000)</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main className="main-workspace">
        {/* ========================================================
           WORKSPACE 1: IDENTITY REGISTRATION STUDIO (HERO & WIZARD)
           ======================================================== */}
        {workspace === 'studio' && (
          <div>
            {/* HERO WELCOME LANDING PAGE (regStep === 0) */}
            {regStep === 0 && (
              <div className="hero-landing">
                <div className="hero-badge-pill">
                  <span>🛡️</span>
                  <span>SECURED BY ZK-PROOFS &amp; ECDSA SIGNATURES</span>
                </div>
                <h1 className="hero-title">
                  Decentralized Civic &amp;<br />
                  <span>Academic Identity Authority</span>
                </h1>
                <p className="hero-description">
                  Enroll your student ID or national civic credentials to receive cryptographic Zero-Knowledge Proof tickets. Participate in secure, anonymous community governance without exposing your identity.
                </p>

                <div className="hero-features-grid">
                  <div className="feature-box">
                    <div className="feature-icon">🛡️</div>
                    <h3>Zero-Knowledge Privacy</h3>
                    <p>Prove voting and civic eligibility on-chain without ever revealing your student ID or private data.</p>
                  </div>
                  <div className="feature-box">
                    <div className="feature-icon">🔐</div>
                    <h3>ECDSA Key Signatures</h3>
                    <p>Every enrollment is authenticated using deterministic ECDSA cryptographic client keypairs.</p>
                  </div>
                  <div className="feature-box">
                    <div className="feature-icon">🏛️</div>
                    <h3>Verifiable Credentials</h3>
                    <p>Your signed ZKP governance credentials work seamlessly with the decentralized civic DApp.</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-hero-start"
                  onClick={() => setRegStep(1)}
                >
                  <span>🚀</span>
                  <span>Start Identity Registration</span>
                </button>
              </div>
            )}

            {/* MULTI-STEP WIZARD PROGRESS BAR (regStep 1, 2, or 3) */}
            {(regStep === 1 || regStep === 2 || regStep === 3) && (
              <div className="wizard-progress-container">
                <div className="progress-steps-list">
                  <div className="progress-line-track">
                    <div
                      className="progress-line-fill"
                      style={{
                        width:
                          regStep === 1 ? '0%' : regStep === 2 ? '50%' : '100%'
                      }}
                    />
                  </div>

                  {/* Step 1 Circle */}
                  <div
                    className={`step-node ${regStep === 1 ? 'active' : regStep > 1 ? 'completed' : ''}`}
                    onClick={() => setRegStep(1)}
                  >
                    <div className="step-circle">
                      {regStep > 1 ? '✓' : '1'}
                    </div>
                    <span className="step-label">1. Student ID</span>
                  </div>

                  {/* Step 2 Circle */}
                  <div
                    className={`step-node ${regStep === 2 ? 'active' : regStep > 2 ? 'completed' : ''}`}
                    onClick={() => { if (regStep > 1) setRegStep(2); }}
                  >
                    <div className="step-circle">
                      {regStep > 2 ? '✓' : '2'}
                    </div>
                    <span className="step-label">2. Security Profile</span>
                  </div>

                  {/* Step 3 Circle */}
                  <div
                    className={`step-node ${regStep === 3 ? 'active' : ''}`}
                  >
                    <div className="step-circle">3</div>
                    <span className="step-label">3. Crypto Commitment</span>
                  </div>
                </div>
              </div>
            )}

            {/* WIZARD CARD WRAPPER FOR STEPS 1, 2, 3, AND 4 */}
            {regStep > 0 && (
              <div className="wizard-card">
                {/* Global Error Banner if any */}
                {registerStatus && registerStatus.type === 'error' && (
                  <div className="status-banner status-error" style={{ margin: '20px 40px 0' }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <div><strong>{registerStatus.message}</strong></div>
                  </div>
                )}

                {/* STEP 1: STUDENT / CITIZEN IDENTIFICATION */}
                {regStep === 1 && (
                  <form onSubmit={validateAndNextStep1}>
                    <div className="wizard-header">
                      <div className="wizard-header-text">
                        <h2>Step 1: Student / Citizen Identification</h2>
                        <p>Enter the primary identity number and legal name to enroll in the ledger.</p>
                      </div>
                      <span className="step-counter-badge">Step 1 of 3</span>
                    </div>

                    <div className="wizard-body">
                      <div className="form-grid">
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

                        <div className="input-block">
                          <div className="label-row">
                            <span className="input-label">Full Name *</span>
                          </div>
                          <input
                            type="text"
                            className="clean-input"
                            placeholder="e.g. Subodha Gunawardena"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="wizard-footer">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setRegStep(0)}
                      >
                        ⬅ Return to Overview
                      </button>
                      <button type="submit" className="btn-civic">
                        Next: Profile &amp; Security ➔
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP 2: PROFILE & SECURITY */}
                {regStep === 2 && (
                  <form onSubmit={validateAndNextStep2}>
                    <div className="wizard-header">
                      <div className="wizard-header-text">
                        <h2>Step 2: Security &amp; Contact Profile</h2>
                        <p>Set a secure password for your identity and add optional academic contact details.</p>
                      </div>
                      <span className="step-counter-badge">Step 2 of 3</span>
                    </div>

                    <div className="wizard-body">
                      <div className="form-grid">
                        <div className="input-block">
                          <div className="label-row">
                            <span className="input-label">Account Password *</span>
                          </div>
                          <div className="input-container" style={{ gap: '8px' }}>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              className="clean-input"
                              placeholder="Set citizen security password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              autoFocus
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

                        <div className="input-block">
                          <div className="label-row">
                            <span className="input-label">Faculty Email (Optional)</span>
                          </div>
                          <input
                            type="email"
                            className="clean-input"
                            placeholder="e.g. student@eng.pdn.ac.lk"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>

                        <div className="input-block">
                          <div className="label-row">
                            <span className="input-label">Phone Number (Optional)</span>
                          </div>
                          <input
                            type="text"
                            className="clean-input"
                            placeholder="e.g. +94771234567"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>

                        <div className="input-block">
                          <div className="label-row">
                            <span className="input-label">Address (Optional)</span>
                          </div>
                          <input
                            type="text"
                            className="clean-input"
                            placeholder="e.g. Peradeniya University Campus"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="wizard-footer">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setRegStep(1)}
                      >
                        ⬅ Back: Student ID
                      </button>
                      <button type="submit" className="btn-civic">
                        Next: Crypto Commitment ➔
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP 3: CRYPTOGRAPHIC SIGNATURE & COMMITMENT */}
                {regStep === 3 && (
                  <form onSubmit={handleRegister}>
                    <div className="wizard-header">
                      <div className="wizard-header-text">
                        <h2>Step 3: Cryptographic Commitment</h2>
                        <p>Sign your enrollment payload using ECDSA and commit to the local SQLite ledger.</p>
                      </div>
                      <span className="step-counter-badge">Step 3 of 3</span>
                    </div>

                    <div className="wizard-body">
                      <div className="form-grid">
                        {/* Hardware Security Module Display inside Wizard */}
                        <div className="wizard-crypto-card">
                          <div className="wizard-crypto-header">
                            <div>
                              <span style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', display: 'block' }}>
                                🔐 ECDSA Hardware Security Engine
                              </span>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                Real-Time Client Payload Signature
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={generateNewWallet}
                              style={{ padding: '6px 12px', fontSize: '11px', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' }}
                            >
                              🔄 Rotate Key
                            </button>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#cbd5e1' }}>Client Signer Address</span>
                              {clientWallet && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ fontSize: '11px', padding: '3px 10px', background: '#1e293b', color: '#e2e8f0', border: 'none' }}
                                  onClick={() => handleCopy(clientWallet.address, 'address')}
                                >
                                  {copiedField === 'address' ? '✅ Copied!' : '📋 Copy'}
                                </button>
                              )}
                            </div>
                            <div className="terminal-block code-address">
                              {clientWallet ? clientWallet.address : 'Generating keypair...'}
                            </div>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#cbd5e1' }}>Canonical Signed Payload Digest</span>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: '11px', padding: '3px 10px', background: '#1e293b', color: '#e2e8f0', border: 'none' }}
                                onClick={() => handleCopy(canonicalMessage, 'digest')}
                              >
                                {copiedField === 'digest' ? '✅ Copied!' : '📋 Copy'}
                              </button>
                            </div>
                            <div className="terminal-block">
                              {canonicalMessage}
                            </div>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#cbd5e1' }}>ECDSA Signature</span>
                              {signature && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  style={{ fontSize: '11px', padding: '3px 10px', background: '#1e293b', color: '#e2e8f0', border: 'none' }}
                                  onClick={() => handleCopy(signature, 'signature')}
                                >
                                  {copiedField === 'signature' ? '✅ Copied!' : '📋 Copy'}
                                </button>
                              )}
                            </div>
                            <div className="terminal-block code-sig">
                              {isSigning ? 'Calculating signature...' : signature || 'Awaiting input...'}
                            </div>
                          </div>
                        </div>

                        {/* Admin Secret */}
                        <div className="input-block">
                          <div className="label-row">
                            <span className="input-label">Registration / Admin Secret (from .env)</span>
                            <span className="label-tag">SERVER AUTH</span>
                          </div>
                          <input
                            type="password"
                            className="clean-input"
                            placeholder="Enter registration secret"
                            value={registrationSecret}
                            onChange={(e) => setRegistrationSecret(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="wizard-footer">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setRegStep(2)}
                      >
                        ⬅ Back: Security Profile
                      </button>
                      <button type="submit" className="btn-civic" disabled={loading}>
                        {loading ? 'Committing to Ledger...' : '⚡ Enroll & Sign Commitment'}
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP 4: SUCCESS COMPLETION SCREEN & DAPP LOGIN LINK */}
                {regStep === 4 && (
                  <div className="success-screen">
                    <div className="success-icon-circle">✓</div>
                    <h2 className="success-title">🎉 Identity Successfully Enrolled!</h2>
                    <p className="success-subtitle">
                      Your academic / citizen identity commitment has been cryptographically signed and stored in the ZKP Authority Node ledger.
                    </p>

                    {/* Enrolled Profile Summary */}
                    <div className="success-profile-summary">
                      <div className="summary-row">
                        <span className="summary-label">Enrolled Name</span>
                        <span className="summary-value">{name}</span>
                      </div>
                      <div className="summary-row">
                        <span className="summary-label">Student ID / GovID</span>
                        <span className="summary-value">{govId}</span>
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
                      <h3 className="dapp-link-title">Ready for Anonymous Governance</h3>
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
                        <span>Open Governance DApp to Log In</span>
                      </a>
                    </div>

                    <div style={{ marginTop: '16px' }}>
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
            )}
          </div>
        )}

        {/* ========================================================
           WORKSPACE 2: ZKP CREDENTIAL VAULT & VERIFIER
           ======================================================== */}
        {workspace === 'vault' && (
          <div className="vault-workspace">
            <div className="verifier-bar-card">
              <div className="card-title-group">
                <h2>
                  <span>🎟️</span> Credential Vault &amp; Ticket Verifier
                </h2>
                <p>Authenticate an enrolled identity and unlock its issued Zero-Knowledge governance credentials.</p>
              </div>

              {loginStatus && (
                <div className={`status-banner status-${loginStatus.type}`} style={{ marginTop: '20px' }}>
                  {loginStatus.type === 'success' && <span style={{ fontSize: '18px' }}>✅</span>}
                  {loginStatus.type === 'error' && <span style={{ fontSize: '18px' }}>⚠️</span>}
                  <div>
                    <strong>{loginStatus.message}</strong>
                  </div>
                </div>
              )}

              <form onSubmit={handleTestLogin} className="verifier-form-row">
                <div className="input-block">
                  <span className="input-label">Student ID / GovID</span>
                  <input
                    type="text"
                    className="clean-input"
                    placeholder="e.g. EG/2021/1001"
                    value={loginGovId}
                    onChange={(e) => setLoginGovId(e.target.value)}
                    required
                  />
                </div>

                <div className="input-block">
                  <span className="input-label">Security Password</span>
                  <input
                    type="password"
                    className="clean-input"
                    placeholder="Enter registered password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-civic" disabled={loginLoading} style={{ height: '44px', marginTop: 0 }}>
                  {loginLoading ? 'Verifying...' : '⚡ Unlock Credentials'}
                </button>
              </form>
            </div>

            {loginStatus?.data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="surface-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase' }}>Deterministic Citizen Root Seed</span>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '14px', fontWeight: '700', color: '#0f172a', marginTop: '4px' }}>
                      {loginStatus.data.citizenSeed}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleCopy(loginStatus.data.citizenSeed, 'seed')}
                  >
                    {copiedField === 'seed' ? '✅ Copied Seed!' : '📋 Copy Seed'}
                  </button>
                </div>

                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginBottom: '16px' }}>
                    Issued Governance Ticket Cards ({loginStatus.data.ticketBatch?.length || 0})
                  </h3>
                  <div className="credential-gallery-grid">
                    {loginStatus.data.ticketBatch?.map((t: any, idx: number) => (
                      <div className="credential-token-card" key={idx}>
                        <div className="token-card-header">
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                            Ticket Token #{idx + 1}
                          </span>
                          <span className="token-badge">VERIFIED CREDENTIAL</span>
                        </div>
                        <div className="token-id-mono">
                          ID: {t.ticketId}
                        </div>
                        <div className="token-sig-mono">
                          Sig: {t.signature}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="surface-card" style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>🔒</span>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>Vault Locked</h3>
                <p style={{ fontSize: '14px' }}>Enter an enrolled GovID and password above to unlock and inspect issued Zero-Knowledge ticket credentials.</p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
           WORKSPACE 3: NODE ARCHITECTURE & TELEMETRY
           ======================================================== */}
        {workspace === 'telemetry' && (
          <div className="bento-grid">
            <div className="bento-card">
              <span className="bento-tag">API ENDPOINT</span>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>ZKP Authority Node</h3>
              <p style={{ fontSize: '13.5px', color: '#64748b' }}>Primary REST endpoint for identity verification and ticket batch issuance.</p>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', background: '#f1f5f9', padding: '12px', borderRadius: '8px', color: '#0f172a', fontWeight: '700' }}>
                {ZKP_BACKEND_URL}
              </div>
            </div>

            <div className="bento-card">
              <span className="bento-tag">SUPPORTED IDENTITIES</span>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>Identity Schemas</h3>
              <p style={{ fontSize: '13.5px', color: '#64748b' }}>Accepted formats for registration and proof generation within the network.</p>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12.5px', background: '#f1f5f9', padding: '12px', borderRadius: '8px', color: '#334155', lineHeight: '1.6' }}>
                • Faculty GovID: EG/20__/____<br />
                • National ID (NIC): 12-Digit Format
              </div>
            </div>

            <div className="bento-card">
              <span className="bento-tag">STORAGE ENGINE</span>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>Ledger Database</h3>
              <p style={{ fontSize: '13.5px', color: '#64748b' }}>Persistent storage engine enforcing unique identity constraints.</p>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', background: '#ecfdf5', padding: '12px', borderRadius: '8px', color: '#065f46', fontWeight: '700' }}>
                SQLite 3 (data/citizens.db)
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
