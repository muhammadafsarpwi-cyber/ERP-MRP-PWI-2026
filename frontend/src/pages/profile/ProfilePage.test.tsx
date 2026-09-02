import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from './ProfilePage';
import apiService from '../../services/api';
import { useUserStore } from '../../store/userStore';

jest.mock('../../services/api');

const apiMock = apiService as jest.Mocked<typeof apiService>;

const mockUser = {
  id: 'user-1',
  email: 'muhammadafsarpwi@gmail.com',
  displayName: 'Muhammad Afsar',
  firstName: 'Muhammad',
  lastName: 'Afsar',
  username: 'afsar',
  phone: '+92-300-1234567',
  employeeId: 'EMP-001',
  avatarUrl: null,
  status: 'ACTIVE',
  userRoles: [{ id: 'ur1', roleId: 'r1', role: { roleCode: 'SUPER_ADMIN', name: 'Super Administrator' } }],
  permissions: ['admin.users.view'],
};

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

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();
    useUserStore.getState().setUser(mockUser);
    apiMock.get.mockReset();
    apiMock.patch.mockReset();
    apiMock.post.mockReset();
    apiMock.delete.mockReset();
    apiMock.get.mockResolvedValue({ data: mockUser } as any);
  });

  it('renders the authenticated user profile information', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Muhammad Afsar')).toBeInTheDocument();
    expect(screen.getAllByText('muhammadafsarpwi@gmail.com').length).toBeGreaterThan(0);
    expect(screen.getByText('Super Administrator')).toBeInTheDocument();
    expect(screen.getByText('EMP-001')).toBeInTheDocument();
  });

  it('enters edit mode and saves updated profile fields', async () => {
    const user = userEvent.setup();
    apiMock.patch.mockResolvedValue({
      data: { ...mockUser, firstName: 'Ahmad', displayName: 'Ahmad Afsar' },
      message: 'Profile updated successfully',
    } as any);

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    const editButton = await screen.findByRole('button', { name: /edit profile/i }, { timeout: 8000 });
    await user.click(editButton);

    const firstName = screen.getByLabelText('First Name') as HTMLInputElement;
    await user.clear(firstName);
    await user.type(firstName, 'Ahmad');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/auth/me', expect.objectContaining({ firstName: 'Ahmad' })));
    expect(await screen.findByText('Profile updated successfully')).toBeInTheDocument();
  }, 15000);

  it('shows an error message when saving fails', async () => {
    const user = userEvent.setup();
    apiMock.patch.mockRejectedValue({ response: { data: { message: 'Failed to update your profile.' } } });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /edit profile/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Failed to update your profile.')).toBeInTheDocument();
  });
});
