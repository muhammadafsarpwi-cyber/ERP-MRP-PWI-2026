import React from 'react';
import AuthBrand from './AuthBrand';
import CommandCenterScene from './CommandCenterScene';
import ThemeToggle from './ThemeToggle';

interface AuthShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Shared layout for the Login, Forgot Password and Reset Password screens:
 * the theme-driven "Enterprise Command Center" WebGL hall (structural walls,
 * seam floor, side storage racks with wire rod coils, wire treatment
 * modules), corner brackets, brand top bar and a two-column auth body with
 * the glassmorphic login container.
 *
 * The old static dark photo + readability shade + engineering grid layers
 * are gone: the 3D hall renders the backdrop and responds live to the
 * central Light/Dark theme state (see CommandCenterScene / webglCommandCenter),
 * and every structural element below follows the same theme tokens.
 */
const AuthShell: React.FC<AuthShellProps> = ({ children, footer }) => {
  return (
    <div className="erp-auth-root">
      <CommandCenterScene />
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
