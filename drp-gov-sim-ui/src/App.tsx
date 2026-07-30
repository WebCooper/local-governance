import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import './index.css';

const ZKP_BACKEND_URL = import.meta.env.VITE_ZKP_SERVER_URL || 'http://localhost:5001/api';
const ENV_PRIVATE_KEY = import.meta.env.VITE_FRONTEND_PRIVATE_KEY || '';
const ENV_REGISTRATION_SECRET = import.meta.env.VITE_REGISTRATION_SECRET || 'default_admin_secret';

export function App() {
  const [activeTab, setActiveTab] = useState<'register' | 'test-login' | 'system'>('register');

  // Form State
  const [govId, setGovId] = useState('EG/2021/1001');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [registrationSecret, setRegistrationSecret] = useState(ENV_REGISTRATION_SECRET);
  const [showPassword, setShowPassword] = useState(false);

  // Client Wallet for Payload Signing
  const [clientWallet, setClientWallet] = useState<ethers.HDNodeWallet | ethers.Wallet | null>(null);
  const [timestamp, setTimestamp] = useState<number>(Date.now());
  const [signature, setSignature] = useState<string>('');
  const [isSigning, setIsSigning] = useState<boolean>(false);

  // Submission Status
  const [loading, setLoading] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string; details?: any } | null>(null);

  // Login Verification State
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

  // Quick preset helper
  const setPresetStudentId = (preset: string) => {
    setGovId(preset);
  };

  // Handle Form Submission
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus(null);

    if (!govId.trim()) {
      setRegisterStatus({ type: 'error', message: 'Student Register Number / GovID is required.' });
      return;
    }

    if (!password) {
      setRegisterStatus({ type: 'error', message: 'Password is required for registration.' });
      return;
    }

    if (!name.trim()) {
      setRegisterStatus({ type: 'error', message: 'Full Name is required.' });
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
      // Re-sign message with updated timestamp
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
          message: `User/Student registered successfully! Registered as ${data.citizen?.name} (${data.citizen?.govId}).`,
          details: data.citizen
        });
        // Pre-fill login test form
        setLoginGovId(govId.trim());
        setLoginPassword(password);
      } else {
        setRegisterStatus({
          type: 'error',
          message: data.error || 'Failed to register student.'
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


  // Handle Login & Ticket Verification Test
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
          message: 'Identity verified successfully! Signed ZKP Ticket Batch issued.',
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
    <div className="app-container">
      {/* Top Header Bar */}
      <header className="glass-card app-header">
        <div className="brand-container">
          <div className="logo-badge">🎓</div>
          <div className="brand-title">
            <h1>ZKP GovID Portal — Faculty Premise Deployment</h1>
            <p>Student Identity Registration & Cryptographic Verification Node</p>
          </div>
        </div>
        <div className="status-badge">
          <span className="status-dot"></span>
          Simulator Online (Port 5000)
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => setActiveTab('register')}
        >
          <span>📝</span> Register Student / User
        </button>
        <button
          className={`tab-btn ${activeTab === 'test-login' ? 'active' : ''}`}
          onClick={() => setActiveTab('test-login')}
        >
          <span>🧪</span> Test Ticket Verification
        </button>
        <button
          className={`tab-btn ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          <span>⚙️</span> Server Config & Info
        </button>
      </nav>

      {/* TAB 1: Student Registration */}
      {activeTab === 'register' && (
        <div className="portal-grid">
          {/* Registration Form */}
          <div className="glass-card form-section">
            <h2 className="section-title">
              <span>🆔</span> Student Registration Form
            </h2>
            <p className="section-desc">
              Register faculty student IDs (EG/20__/____ format) or 12-digit national NICs with custom passwords.
            </p>

            {registerStatus && (
              <div className={`alert-box alert-${registerStatus.type}`}>
                {registerStatus.type === 'success' && <span>✅</span>}
                {registerStatus.type === 'error' && <span>⚠️</span>}
                <div>
                  <strong>{registerStatus.message}</strong>
                </div>
              </div>
            )}

            <form onSubmit={handleRegister}>
              <div className="input-group">
                <label className="input-label">Student Register ID / GovID *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. EG/2021/1234 or 199912345678"
                  value={govId}
                  onChange={(e) => setGovId(e.target.value)}
                  required
                />
                <div className="format-pills">
                  <span className="pill-btn" onClick={() => setPresetStudentId('EG/2021/1001')}>
                    + EG/2021/1001
                  </span>
                  <span className="pill-btn" onClick={() => setPresetStudentId('EG/2020/0452')}>
                    + EG/2020/0452
                  </span>
                  <span className="pill-btn" onClick={() => setPresetStudentId('199812345678')}>
                    + 12-Digit NIC
                  </span>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Subodha Gunawardena"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Account Password *</label>
                <div className="input-wrapper" style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Set account password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="pill-btn"
                    style={{ whiteSpace: 'nowrap', padding: '0 14px' }}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Faculty Email (Optional)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. student@eng.pdn.ac.lk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Phone Number (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. +94771234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Address (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Faculty Hostels, Peradeniya"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Registration / Admin Secret (from .env)</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Secret key for ZKP backend"
                  value={registrationSecret}
                  onChange={(e) => setRegistrationSecret(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Registering...' : '🔒 Sign & Register Student'}

              </button>
            </form>
          </div>

          {/* Cryptography & Payload Verification Display */}
          <div className="glass-card crypto-card">
            <div className="crypto-header">
              <h2 className="section-title">
                <span>🔐</span> Payload Signing Engine
              </h2>
              <button className="pill-btn" onClick={generateNewWallet}>
                🔄 New Client Keypair
              </button>
            </div>

            <div>
              <span className="input-label">Client Signer Address</span>
              <div className="code-block" style={{ color: '#67e8f9' }}>
                {clientWallet ? clientWallet.address : 'Generating keypair...'}
              </div>
            </div>

            <div>
              <span className="input-label">Canonical Signed Payload Digest</span>
              <div className="code-block">
                {canonicalMessage}
              </div>
            </div>

            <div>
              <span className="input-label">ECDSA Signature (ethers.verifyMessage)</span>
              <div className="code-block" style={{ color: '#a7f3d0' }}>
                {isSigning ? 'Calculating signature...' : signature || 'Awaiting input...'}
              </div>
            </div>

            <div className="alert-box alert-info" style={{ marginTop: 'auto' }}>
              <span>ℹ️</span>
              <div>
                <strong>Zero-Knowledge Identity Verification:</strong>
                <br />
                The frontend signs the student registration payload using an ECDSA private key. The ZKP simulator verifies the signature prior to saving to SQLite.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Test Ticket Verification */}
      {activeTab === 'test-login' && (
        <div className="portal-grid">
          <div className="glass-card form-section">
            <h2 className="section-title">
              <span>🎟️</span> ZKP Ticket Verification Test
            </h2>
            <p className="section-desc">
              Test authenticating a registered student/user and obtaining a batch of signed ZKP tickets from the authority.
            </p>

            {loginStatus && (
              <div className={`alert-box alert-${loginStatus.type}`}>
                {loginStatus.type === 'success' && <span>✅</span>}
                {loginStatus.type === 'error' && <span>⚠️</span>}
                <div>
                  <strong>{loginStatus.message}</strong>
                </div>
              </div>
            )}

            <form onSubmit={handleTestLogin}>
              <div className="input-group">
                <label className="input-label">Student ID / GovID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. EG/2021/1001"
                  value={loginGovId}
                  onChange={(e) => setLoginGovId(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter registered password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loginLoading}>
                {loginLoading ? 'Verifying...' : '⚡ Authenticate & Request Tickets'}
              </button>
            </form>
          </div>

          <div className="glass-card crypto-card">
            <h2 className="section-title">
              <span>📦</span> Issued ZKP Ticket Batch
            </h2>

            {loginStatus?.data ? (
              <>
                <div>
                  <span className="input-label">Deterministic Citizen Seed</span>
                  <div className="code-block" style={{ color: '#fef08a' }}>
                    {loginStatus.data.citizenSeed}
                  </div>
                </div>

                <div>
                  <span className="input-label">
                    Issued Tickets ({loginStatus.data.ticketBatch?.length || 0})
                  </span>
                  <div className="ticket-list">
                    {loginStatus.data.ticketBatch?.map((t: any, idx: number) => (
                      <div className="ticket-item" key={idx}>
                        <div>
                          <div className="ticket-id">ID: {t.ticketId.slice(0, 18)}...</div>
                          <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                            Sig: {t.signature.slice(0, 24)}...
                          </div>
                        </div>
                        <span className="ticket-status">AVAILABLE</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="alert-box alert-info">
                <span>💡</span>
                <div>
                  Submit the credentials on the left to verify real-time ticket batch issuance from the ZKP GovID SQLite database.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: System Config */}
      {activeTab === 'system' && (
        <div className="glass-card form-section" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 className="section-title">
            <span>⚙️</span> ZKP GovID Simulator Architecture
          </h2>
          <br />
          <div className="input-group">
            <label className="input-label">ZKP Simulator Endpoint</label>
            <div className="code-block">{ZKP_BACKEND_URL}</div>
          </div>
          <div className="input-group">
            <label className="input-label">Supported GovID Formats</label>
            <div className="code-block">
              1. Student Registration Number (Faculty deployment): EG/20__/____ (e.g. EG/2021/1001)<br />
              2. Government National Identity Card (12-Digit NIC): e.g. 199812345678
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Database Engine</label>
            <div className="code-block">
              SQLite 3 (`data/citizens.db`) with `govId` UNIQUE constraint.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
