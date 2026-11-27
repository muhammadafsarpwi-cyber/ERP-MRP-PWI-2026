import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import SettingsFolderTabs from './SettingsFolderTabs';
import { SETTINGS_PERMISSIONS } from './settingsNavigationConfig';

describe('SettingsFolderTabs', () => {
  beforeEach(() => {
    localStorage.setItem(
      'erp_user',
      JSON.stringify({
        id: 'u-1',
        email: 'admin@pwi.com',
        permissions: Object.values(SETTINGS_PERMISSIONS),
      }),
    );
    localStorage.setItem('erp_permissions_ts', Date.now().toString());
  });

  afterEach(() => {
    localStorage.clear();
  });
  it('renders all visible folder tabs with active selection', () => {
    render(
      <MemoryRouter initialEntries={['/settings/profile-branding']}>
        <SettingsFolderTabs activePath="/settings/profile-branding" />
      </MemoryRouter>
    );

    expect(screen.getByTestId('settings-folder-tabs')).toBeInTheDocument();
    const brandingTab = screen.getByTestId('folder-tab-profile-branding');
    expect(brandingTab).toHaveClass('is-active');
    expect(brandingTab).toHaveAttribute('aria-selected', 'true');

    const invoiceTab = screen.getByTestId('folder-tab-invoice');
    expect(invoiceTab).not.toHaveClass('is-active');
    expect(invoiceTab).toHaveAttribute('aria-selected', 'false');
  });

  it('allows clicking scroll buttons without error', () => {
    render(
      <MemoryRouter initialEntries={['/settings/profile-branding']}>
        <SettingsFolderTabs activePath="/settings/profile-branding" />
      </MemoryRouter>
    );

    const leftBtn = screen.getByRole('button', { name: /scroll settings tabs left/i });
    const rightBtn = screen.getByRole('button', { name: /scroll settings tabs right/i });

    expect(leftBtn).toBeInTheDocument();
    expect(rightBtn).toBeInTheDocument();

    fireEvent.click(rightBtn);
    fireEvent.click(leftBtn);
  });
});
