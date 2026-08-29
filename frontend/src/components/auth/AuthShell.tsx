import React from 'react';
import AuthBrand from './AuthBrand';
import ThemeToggle from './ThemeToggle';
import { WELCOME_SLIDES } from './WelcomeSlideshow';

interface AuthShellProps {
  /** Background image URL (defaults to the first welcome image). */
  image?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Shared layout for the Login, Forgot Password and Reset Password screens:
 * full-bleed industrial photography, readability overlay, engineering grid,
 * corner brackets, brand top bar and a two-column auth body.
 */
const AuthShell: React.FC<AuthShellProps> = ({ image, children, footer }) => {
  const bg = image || WELCOME_SLIDES[0]?.src;

  return (
    <div className="erp-auth-root">
      <div className="erp-auth-media-static" style={{ backgroundImage: `url(${bg})` }} />
      <div className="erp-auth-shade" />
      <div className="erp-auth-grid" />
      <div className="erp-auth-corners" aria-hidden="true">
        <span className="erp-corner erp-corner-tl" />
        <span className="erp-corner erp-corner-tr" />
        <span className="erp-corner erp-corner-bl" />
        <span className="erp-corner erp-corner-br" />
      </div>

      <header className="erp-auth-top">
        <AuthBrand />
        <div className="erp-auth-top-right">
          <ThemeToggle />
        </div>
      </header>

      <div className="erp-auth-body">{children}</div>

      {footer && <footer className="erp-auth-footer">{footer}</footer>}
    </div>
  );
};

export default AuthShell;