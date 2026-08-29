import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Welcome from './Welcome';
import Login from './Login';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import WelcomeSlideshow, { SLIDE_INTERVAL_MS } from '../../components/auth/WelcomeSlideshow';

// jsdom does not implement matchMedia; antd's responsive observer relies on it.
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

const slideTitles = ['One', 'Two', 'Three'];
const miniSlides = slideTitles.map((title, i) => ({ src: `/m-${i + 1}.jpg`, title }));

describe('auth screens smoke', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders Welcome with brand headings and CTA', () => {
    render(
      <MemoryRouter>
        <Welcome />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1, name: 'PWI' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Pakistan Wire & Industry' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter system/i })).toBeInTheDocument();
  });

  it('Enter System button navigates to /login', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /enter system/i }));
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('Enter key navigates to /login', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('Escape key navigates to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('slideshow auto-completes and notifies once after all six slides', () => {
    jest.useFakeTimers();
    const onComplete = jest.fn();
    render(<WelcomeSlideshow onComplete={onComplete} />);
    // One flush per slide so the component effect can schedule the next timer.
    act(() => {
      jest.advanceTimersByTime(SLIDE_INTERVAL_MS);
    });
    for (let i = 1; i < 8; i += 1) {
      act(() => {
        jest.advanceTimersByTime(SLIDE_INTERVAL_MS);
      });
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('slideshow next/prev/continue controls behave correctly', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    const { container } = render(
      <WelcomeSlideshow slides={miniSlides} onComplete={onComplete} />
    );
    const title = () =>
      (container.querySelector('.erp-slide-title') as HTMLElement).textContent;

    expect(title()).toBe('One');
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(title()).toBe('Two');

    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(title()).toBe('Three');
    expect(screen.getByRole('button', { name: 'Continue to Sign In' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue to Sign In' }));
    expect(onComplete).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Previous slide' }));
    expect(title()).toBe('Two');
  });

  it('slideshow arrow keys move between slides', () => {
    const { container } = render(<WelcomeSlideshow slides={miniSlides} />);
    const title = () =>
      (container.querySelector('.erp-slide-title') as HTMLElement).textContent;

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(title()).toBe('Two');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(title()).toBe('Three');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(title()).toBe('Two');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(title()).toBe('One');
  });

  it('renders Login form fields, brand mark and autocomplete hints', () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const emailInput = container.querySelector('#login_email') as HTMLInputElement;
    const passwordInput = container.querySelector('#login_password') as HTMLInputElement;
    expect(emailInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('autocomplete', 'username');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
    expect(container.querySelector('.erp-auth-panel-brand .erp-brand-mark')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders ForgotPassword form', () => {
    const { container } = render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );
    expect(container.querySelector('#forgot-password_email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('renders ResetPassword token form', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc']}>
        <ResetPassword />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Set New Password' })
    ).toBeInTheDocument();
  });

  it('renders ResetPassword invalid-link state without token', () => {
    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    );
    expect(screen.getByText('Invalid Reset Link')).toBeInTheDocument();
  });

  it('password toggle switches input type', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    const field = container.querySelector('#login_password') as HTMLInputElement;
    expect(field).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(field).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('login validates empty form', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Please enter your email')).toBeInTheDocument();
    expect(screen.getByText('Please enter your password')).toBeInTheDocument();
  });
});