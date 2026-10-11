import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeleteConfirmModal from './DeleteConfirmModal';

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    function () {
      return {
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      };
    };
});

describe('DeleteConfirmModal', () => {
  it('renders confirmation modal when open=true and handles single confirm click cleanly', async () => {
    const onConfirm = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
    const onSuccessClose = jest.fn();
    const onCancel = jest.fn();

    const { rerender } = render(
      <DeleteConfirmModal
        open={true}
        title="Delete this daily production entry?"
        itemType="Daily Production Entry"
        itemName="225*17 Outer Straight"
        itemCode="WIP-SP-018"
        onConfirm={onConfirm}
        onSuccessClose={onSuccessClose}
        onCancel={onCancel}
      />
    );

    // Verify modal elements are rendered
    expect(screen.getByText('Delete this daily production entry?')).toBeInTheDocument();
    expect(screen.getByText('225*17 Outer Straight')).toBeInTheDocument();
    expect(screen.getByText('(WIP-SP-018)')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirm Delete/i });
    expect(confirmBtn).toBeInTheDocument();

    // Click confirm multiple times rapidly
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    // Should only invoke onConfirm once (prevents concurrent submission & page hang)
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Re-render while in-flight with changed props (e.g. parent table re-render)
    rerender(
      <DeleteConfirmModal
        open={true}
        title="Delete this daily production entry?"
        itemType="Daily Production Entry"
        itemName="225*17 Outer Straight"
        itemCode="WIP-SP-018"
        tags={['Shift 1', 'Spoke Dept']}
        onConfirm={onConfirm}
        onSuccessClose={onSuccessClose}
        onCancel={onCancel}
      />
    );

    // Wait for success screen
    await waitFor(() => {
      expect(screen.getByText('Successfully Deleted')).toBeInTheDocument();
    });

    const okBtn = screen.getByRole('button', { name: /OK/i });
    fireEvent.click(okBtn);

    expect(onSuccessClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when Cancel button is clicked', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <DeleteConfirmModal
        open={true}
        title="Delete item?"
        itemName="Test Item"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
