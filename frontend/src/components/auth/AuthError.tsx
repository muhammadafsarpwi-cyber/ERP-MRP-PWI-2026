import React from 'react';
import { Alert } from 'antd';

interface AuthErrorProps {
  message?: string | null;
  onClose?: () => void;
}

/** Accessible error banner shared by the authentication forms. */
const AuthError: React.FC<AuthErrorProps> = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <Alert
      role="alert"
      message={message}
      type="error"
      showIcon
      closable={!!onClose}
      onClose={onClose}
      style={{ marginBottom: 20 }}
    />
  );
};

export default AuthError;