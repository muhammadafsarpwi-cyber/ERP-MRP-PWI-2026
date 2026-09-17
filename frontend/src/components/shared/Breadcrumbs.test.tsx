import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Breadcrumbs />
    </MemoryRouter>,
  );

const crumbTexts = () => {
  const nav = screen.getByRole('navigation');
  return within(nav)
    .getAllByRole('listitem')
    .map((li) => (li.textContent || '').trim())
    .filter((t) => t && t !== '/');
};

describe('Breadcrumbs', () => {
  it('renders Home / Production / Production Reports for /production/reports (no duplicate Production)', () => {
    renderAt('/production/reports');
    expect(crumbTexts()).toEqual(['Home', 'Production', 'Production Reports']);
  });

  it('keeps the Production parent crumb for other production routes', () => {
    renderAt('/production/receiving');
    expect(crumbTexts()).toEqual(['Home', 'Production', 'Raw Material Receiving']);
  });
});
