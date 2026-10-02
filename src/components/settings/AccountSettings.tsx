import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { changeCredentials, fetchAccount, isAuthDisabled, type AccountInfo } from '../../utils/auth';
import { Button } from '../ui/Button';
import { useToast } from '../Toast';

// Mirrors the server-side rules in server/services/credentials.js.
const PASSWORD_MIN = 12;
const USERNAME_MAX = 64;

interface AccountSettingsProps {
  accentColor: string;
}

/** Settings → Account: change the admin username and/or password. */
export const AccountSettings: React.FC<AccountSettingsProps> = ({ accentColor }) => {
  const { addToast } = useToast();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthDisabled()) return;
    let cancelled = false;
    fetchAccount().then((info) => {
      if (!cancelled && info) {
        setAccount(info);
        setNewUsername(info.username);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const usernameChanged = !!account && newUsername.trim() !== '' && newUsername.trim() !== account.username;
  const passwordChanged = newPassword !== '';

  // Client-side checks for instant feedback; the server re-validates everything.
  const validationError = (() => {
    if (newUsername.trim() === '') return 'Username cannot be empty';
    if (newUsername.trim().length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters`;
    if (passwordChanged && newPassword.length < PASSWORD_MIN) return `New password must be at least ${PASSWORD_MIN} characters`;
    if (passwordChanged && newPassword !== confirmPassword) return 'New passwords do not match';
    return null;
  })();

  const canSubmit = (usernameChanged || passwordChanged) && !validationError && currentPassword !== '' && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    const result = await changeCredentials({
      currentPassword,
      newUsername: usernameChanged ? newUsername.trim() : undefined,
      newPassword: passwordChanged ? newPassword : undefined,
    });
    setIsSubmitting(false);
    if (result.success) {
      const username = result.username ?? newUsername.trim();
      setAccount({ username });
      setNewUsername(username);
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      addToast({
        type: 'success',
        message: 'Credentials updated. Other sessions have been signed out.',
        duration: 5000,
      });
    } else {
      setError(result.error ?? 'Failed to update credentials');
    }
  };

  if (isAuthDisabled()) {
    return (
      <div className="preference-sections">
        <section className="preference-section">
          <div><h4>Open access</h4><p>No sign-in is required.</p></div>
          <div className="account-open-access">
            <ShieldAlert size={18} />
            <p>
              Authentication is disabled on this server (<code>NAUTILUS_AUTH_DISABLED=true</code>), so anyone on
              your local network has admin access. Remove the flag and restart the server to require a login again.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const pending = usernameChanged || passwordChanged;

  return (
    <form onSubmit={handleSubmit} className="preference-sections">
      <section className="preference-section">
        <div><h4>Administrator</h4><p>The account used to sign in and edit the network.</p></div>
        <div className="preference-fields">
          <label className="preference-field">Username
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={USERNAME_MAX}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              disabled={!account || isSubmitting}
            />
          </label>
        </div>
      </section>

      <section className="preference-section">
        <div><h4>Password</h4><p>Leave empty to keep the current password.</p></div>
        <div className="preference-fields account-password-fields">
          <div className="preference-field">
            <label htmlFor="account-new-password">New password</label>
            <input
              id="account-new-password"
              type="password"
              autoComplete="new-password"
              aria-describedby="account-password-hint"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={!account || isSubmitting}
            />
            <small id="account-password-hint">At least {PASSWORD_MIN} characters. A long passphrase works well.</small>
          </div>
          <label className="preference-field">Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={!passwordChanged || isSubmitting}
            />
          </label>
        </div>
      </section>

      <section className="preference-section">
        <div><h4>Confirm changes</h4><p>Saving signs out every other session.</p></div>
        <div className="preference-fields account-confirmation">
          <label className="preference-field">Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={!account || isSubmitting}
            />
          </label>
          {pending && validationError && <p className="text-warning" role="alert">{validationError}</p>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" accentColor={accentColor} disabled={!canSubmit}>
            <KeyRound size={16} />
            {isSubmitting ? 'Saving…' : 'Update credentials'}
          </Button>
        </div>
      </section>
    </form>
  );
};

export default AccountSettings;
