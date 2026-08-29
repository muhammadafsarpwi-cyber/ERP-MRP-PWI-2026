import React from 'react';

export const PWI_BRAND_MARK = `${process.env.PUBLIC_URL}/logo-mark.png`;

interface AuthBrandProps {
  size?: 'sm' | 'lg';
  /**
   * `light` (default): white mark + white text for dark brand surfaces
   * (slideshow top bar, brand pane).
   * `theme`: adapts to the active light/dark theme (used inside auth cards).
   */
  variant?: 'light' | 'theme';
  className?: string;
}

/**
 * PWI brand lockup used across the entire auth experience.
 * The mark is the official PWI logo asset (preprocessed for transparency);
 * the wordmark text beside it uses the same typevoice everywhere.
 */
const AuthBrand: React.FC<AuthBrandProps> = ({
  size = 'sm',
  variant = 'light',
  className,
}) => {
  const cls = ['erp-auth-brand', `is-${variant}`, size === 'lg' ? 'is-lg' : '', className || '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} aria-label="PWI — Pakistan Wire & Industry">
      <img
        className="erp-brand-mark"
        src={PWI_BRAND_MARK}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="erp-brand-lockup">
        <span className="erp-brand-name">PWI</span>
        <span className="erp-brand-sub">Pakistan Wire &amp; Industry</span>
      </span>
    </div>
  );
};

export default AuthBrand;