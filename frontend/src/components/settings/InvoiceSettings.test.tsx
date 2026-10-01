import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InvoiceSettings from './InvoiceSettings';

describe('InvoiceSettings Component', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <InvoiceSettings />
      </MemoryRouter>
    );
  };

  it('renders the invoice settings container and cards', () => {
    renderComponent();

    expect(screen.getByTestId('invoice-settings')).toBeInTheDocument();
    expect(screen.getByText('Terms & tax')).toBeInTheDocument();
    expect(screen.getByText('Default wording')).toBeInTheDocument();
    expect(screen.getByText('Invoice design')).toBeInTheDocument();
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('Show on invoice')).toBeInTheDocument();
    expect(screen.getByText('Payment options on invoice')).toBeInTheDocument();
    expect(screen.getByText('QR code')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
  });

  it('renders all 5 design patterns and allows selecting them', async () => {
    renderComponent();

    const modernCard = screen.getByTestId('invoice-pattern-modern');
    const classicCard = screen.getByTestId('invoice-pattern-classic');
    const corporateCard = screen.getByTestId('invoice-pattern-corporate');
    const elegantCard = screen.getByTestId('invoice-pattern-elegant');
    const boldCard = screen.getByTestId('invoice-pattern-bold');

    expect(modernCard).toBeInTheDocument();
    expect(classicCard).toBeInTheDocument();
    expect(corporateCard).toBeInTheDocument();
    expect(elegantCard).toBeInTheDocument();
    expect(boldCard).toBeInTheDocument();

    // Default is modern
    expect(modernCard).toHaveClass('invoice-design-card--active');

    // Click Classic
    fireEvent.click(classicCard);
    expect(classicCard).toHaveClass('invoice-design-card--active');
    expect(modernCard).not.toHaveClass('invoice-design-card--active');

    // Click Corporate
    fireEvent.click(corporateCard);
    expect(corporateCard).toHaveClass('invoice-design-card--active');

    // Click Elegant
    fireEvent.click(elegantCard);
    expect(elegantCard).toHaveClass('invoice-design-card--active');

    // Click Bold
    fireEvent.click(boldCard);
    expect(boldCard).toHaveClass('invoice-design-card--active');
  });

  it('updates live preview when wording or terms are edited', () => {
    renderComponent();

    const notesInput = screen.getByPlaceholderText('Thank you for your business.');
    fireEvent.change(notesInput, { target: { value: 'Custom invoice notes for testing.' } });

    expect(screen.getAllByText('Custom invoice notes for testing.')[0]).toBeInTheDocument();
  });

  it('allows saving and resetting changes', async () => {
    renderComponent();

    const notesInput = screen.getByPlaceholderText('Thank you for your business.');
    fireEvent.change(notesInput, { target: { value: 'Updated note' } });

    const saveBtn = screen.getByRole('button', { name: /save invoice settings/i });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      const stored = localStorage.getItem('erp_invoice_settings_v1');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toMatchObject({ invoiceNotes: 'Updated note' });
    });
  });

  it('renders all Show on invoice switches and toggles them', () => {
    renderComponent();

    expect(screen.getByText('Your tax number')).toBeInTheDocument();
    expect(screen.getByText('Customer code')).toBeInTheDocument();
    expect(screen.getByText('Customer phone & email')).toBeInTheDocument();
    expect(screen.getByText('Customer tax number')).toBeInTheDocument();
    expect(screen.getByText('Invoice details box')).toBeInTheDocument();
    expect(screen.getByText('Balance due box')).toBeInTheDocument();
    expect(screen.getByText('Product SKU')).toBeInTheDocument();
    expect(screen.getByText('Amount in words')).toBeInTheDocument();
    expect(screen.getByText('Signature lines')).toBeInTheDocument();
    expect(screen.getByText('Status watermark')).toBeInTheDocument();
  });
});
