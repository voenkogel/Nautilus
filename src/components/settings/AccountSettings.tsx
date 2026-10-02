import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { changeCredentials, fetchAccount, isAuthDisabled, type AccountInfo } from '../../utils/auth';
import { FormInput } from '../ui/FormInput';
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
      setAccount({ username, source: 'file' });
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
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-800">Account</h3>
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <ShieldAlert size={18} className="flex-shrink-0 mt-0.5 text-amber-500" />
          <div>
            Authentication is disabled on this server (<code>NAUTILUS_AUTH_DISABLED=true</code>), so anyone on
            your local network has admin access. Remove the flag and restart the server to require a login again.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-800 mb-1">Account</h3>
        <p className="text-sm text-gray-500">
          Change the administrator username and password. Saving signs out every other session.
        </p>
      </div>

      {account?.source === 'env' && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <ShieldAlert size={18} className="flex-shrink-0 mt-0.5 text-amber-500" />
          <div>
            You are signed in with the password from the <code>.env</code> file. Once you change it here,
            the new credentials are stored hashed on the server and <code>NAUTILUS_ADMIN_PASSWORD</code> is
            no longer used.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="account-username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <FormInput
            id="account-username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            accentColor={`${accentColor}40`}
            disabled={!account || isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="account-new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <FormInput
            id="account-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave empty to keep the current password"
            accentColor={`${accentColor}40`}
            disabled={!account || isSubmitting}
          />
          <p className="text-xs text-gray-500 mt-1">At least {PASSWORD_MIN} characters. A long passphrase works well.</p>
        </div>

        {passwordChanged && (
          <div>
            <label htmlFor="account-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <FormInput
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              accentColor={`${accentColor}40`}
              disabled={isSubmitting}
            />
          </div>
        )}

        <div className="pt-2 border-t border-gray-200">
          <label htmlFor="account-current-password" className="block text-sm font-medium text-gray-700 mb-1 mt-2">Current password</label>
          <FormInput
            id="account-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Required to confirm changes"
            accentColor={`${accentColor}40`}
            disabled={!account || isSubmitting}
          />
        </div>

        {(usernameChanged || passwordChanged) && validationError && (
          <p className="text-sm text-amber-700">{validationError}</p>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>
        )}

        <Button type="submit" variant="primary" accentColor={accentColor} disabled={!canSubmit}>
          <KeyRound size={16} />
          {isSubmitting ? 'Saving…' : 'Update credentials'}
        </Button>
      </form>
    </div>
  );
};

export default AccountSettings;
