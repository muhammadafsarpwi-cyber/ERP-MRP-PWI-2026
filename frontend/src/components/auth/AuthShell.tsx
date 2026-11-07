import React from 'react';
import AntigravityParticlesBackground from './AntigravityParticlesBackground';
import AuthBrand from './AuthBrand';
import CommandCenterScene from './CommandCenterScene';
import ThemeToggle from './ThemeToggle';
import WelcomeTopRibbon from './WelcomeTopRibbon';
import ClassicalMusicControl from '../shared/ClassicalMusicControl';

interface AuthShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  centered?: boolean;
  backgroundVariant?: 'antigravity' | 'command-center';
  showTopRibbon?: boolean;
}

/**
 * Shared layout for the Login, Forgot Password and Reset Password screens:
 *  - Displays the active WelcomeTopRibbon (continuous sliding marquee of all divisions,
 *    audio controls, PWA install, and theme toggle) across both Welcome and Login screens;
 *  - High-Tech Antigravity particles background (blue & red floating nodes with constellation links);
 *  - Multi-theme adaptive frosted glass container.
 */
const AuthShell: React.FC<AuthShellProps> = ({
  children,
  footer,
  centered = false,
  backgroundVariant = 'antigravity',
  showTopRibbon = true,
}) => {
  const isAntigravity = backgroundVariant === 'antigravity';
  const rootClass = [
    'erp-auth-root',
    isAntigravity ? 'is-antigravity' : '',
    showTopRibbon ? 'has-top-ribbon' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const bodyClass = ['erp-auth-body', centered ? 'is-centered' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      {isAntigravity ? <AntigravityParticlesBackground /> : <CommandCenterScene />}

      {/* Top Slide Marquee Ribbon: Exact same live ticker as Welcome screen */}
      {showTopRibbon ? (
        <WelcomeTopRibbon />
      ) : (
        <header className="erp-auth-top">
          <AuthBrand />
          <div className="erp-auth-top-right">
            <ThemeToggle />
            <ClassicalMusicControl hideSettingsLink />
          </div>
        </header>
      )}

      {!centered && !showTopRibbon && (
        <div className="erp-auth-corners" aria-hidden="true">
          <span className="erp-corner erp-corner-tl" />
          <span className="erp-corner erp-corner-tr" />
          <span className="erp-corner erp-corner-bl" />
          <span className="erp-corner erp-corner-br" />
        </div>
      )}

      <main className={bodyClass}>{children}</main>

      {footer && <footer className="erp-auth-footer">{footer}</footer>}
    </div>
  );
};

export default AuthShell;
