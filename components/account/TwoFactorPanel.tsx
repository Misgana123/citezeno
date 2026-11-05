'use client';

import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authClient, authMessage } from '@/lib/auth-client';
import { Notice, PasswordField } from '../auth/bits';
import { Icon } from '../Icon';
import { toast } from '../toast';

type Step = 'idle' | 'password' | 'scan' | 'disable';

/* Turn authenticator-app codes on or off. Needs a password, so accounts that
   only use Google or GitHub are told to add one first. */
export function TwoFactorPanel({ enabled: initial, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [step, setStep] = useState<Step>('idle');
  const [password, setPassword] = useState('');
  const [uri, setUri] = useState('');
  const [qr, setQr] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    QRCode.toDataURL(uri, { margin: 1, width: 200, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''));
  }, [uri]);

  const secret = uri ? new URL(uri).searchParams.get('secret') || '' : '';
  const reset = () => {
    setStep('idle');
    setPassword('');
    setCode('');
    setErr(null);
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (error || !data || data.method !== 'totp') return setErr(authMessage(error));
    setUri(data.totpURI);
    setCodes(data.backupCodes);
    setStep('scan');
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\D/g, '') });
    setBusy(false);
    if (error) return setErr(authMessage(error));
    setEnabled(true);
    reset();
    toast('Two-step verification is on');
    router.refresh();
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return setErr(authMessage(error));
    setEnabled(false);
    reset();
    toast('Two-step verification is off');
    router.refresh();
  };

  const downloadCodes = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`Citezeno backup codes\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' }));
    a.download = 'citezeno-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="tfa">
      <h3 className="h3" style={{ fontSize: 16 }}>
        Two-step verification {enabled ? <span className="badge ok"><Icon name="check" /> On</span> : <span className="badge warn">Off</span>}
      </h3>
      <p className="small" style={{ margin: '4px 0 14px' }}>
        After your password, ask for a code from an authenticator app such as Google Authenticator, 1Password or Authy.
      </p>

      {!hasPassword ? (
        <Notice kind="info">Two-step verification protects password sign-in. You sign in with Google or GitHub, which have their own.</Notice>
      ) : step === 'idle' ? (
        <div className="actions">
          {enabled ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setStep('disable')}>
              Turn off
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => setStep('password')}>
              <Icon name="lock" /> Set up two-step verification
            </button>
          )}
        </div>
      ) : step === 'password' || step === 'disable' ? (
        <form onSubmit={step === 'password' ? start : disable}>
          {err && <Notice kind="err">{err}</Notice>}
          <PasswordField label="Confirm your password" name="tfa-password" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Cancel
            </button>
            <button className={`btn btn-sm${step === 'disable' ? ' btn-danger' : ''}`} disabled={busy || !password}>
              {busy ? 'Checking…' : step === 'disable' ? 'Turn off' : 'Continue'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={confirm} className="tfa-setup">
          {err && <Notice kind="err">{err}</Notice>}
          <div className="tfa-grid">
            <div>
              <p className="tfa-step">1. Scan this with your authenticator app</p>
              {qr ? <img src={qr} alt="QR code for your authenticator app" width={180} height={180} className="tfa-qr" /> : <div className="tfa-qr" />}
              <p className="hint">
                Can’t scan? Enter this key: <code className="tfa-key">{secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              </p>
            </div>
            <div>
              <p className="tfa-step">2. Save your backup codes</p>
              <p className="hint">Each one signs you in once if you lose your phone. Keep them somewhere safe.</p>
              <ul className="tfa-codes">
                {codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button type="button" className="btn btn-ghost btn-sm" onClick={downloadCodes}>
                <Icon name="download" /> Download codes
              </button>
            </div>
          </div>
          <label className="field">
            3. Enter the 6-digit code the app shows
            <input className="input otp-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
          </label>
          <div className="actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Cancel
            </button>
            <button className="btn btn-thread btn-sm" disabled={busy || code.replace(/\D/g, '').length !== 6}>
              {busy ? 'Checking…' : 'Turn on'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
