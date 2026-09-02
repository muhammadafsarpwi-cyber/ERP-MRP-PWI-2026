import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserAvatar, { getInitials, resolveSrc } from './UserAvatar';

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

describe('UserAvatar', () => {
  it('computes initials from a full name', () => {
    expect(getInitials('Muhammad Afsar')).toBe('MA');
    expect(getInitials('Jane')).toBe('J');
    expect(getInitials('   ')).toBe('?');
  });

  it('renders initials fallback when no avatar URL is present', () => {
    render(<UserAvatar displayName="Muhammad Afsar" size={32} />);
    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('renders the image when an absolute avatar URL is provided', () => {
    render(<UserAvatar displayName="Muhammad Afsar" avatarUrl="https://cdn.example.com/avatar.jpg" size={32} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/avatar.jpg');
  });

  it('resolves relative avatar URLs against the API origin', () => {
    const resolved = resolveSrc('/uploads/avatars/abc/def.jpg');
    expect(resolved).toMatch(/^https?:\/\//);
    expect(resolved).toContain('/uploads/avatars/abc/def.jpg');
  });

  it('renders the generic user icon when no name or avatar is available', () => {
    const { container } = render(<UserAvatar />);
    expect(container.querySelector('.anticon-user')).toBeInTheDocument();
  });
});
