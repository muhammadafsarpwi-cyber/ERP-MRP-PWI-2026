import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DowntimeReasonSelect from './DowntimeReasonSelect';
import apiService from '../../../services/api';
import * as lookupsCache from '../../../services/lookupsCache';

jest.mock('../../../services/api');
const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(30000);

describe('DowntimeReasonSelect', () => {
  const mockOptions = [
    { value: 'reason-1', label: 'Machine Maintenance', code: 'MAINT' },
    { value: 'reason-2', label: 'Power Failure', code: 'POWER' },
  ];

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dropdown and displays + Add Custom Reason button when opened', async () => {
    render(<DowntimeReasonSelect options={mockOptions} placeholder="Select reason" />);

    // Click select to open dropdown
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    // Verify existing options and the persistent "+ Add Custom Reason" button
    await waitFor(() => {
      expect(screen.getByText('Machine Maintenance')).toBeInTheDocument();
      expect(screen.getByText('Power Failure')).toBeInTheDocument();
      expect(screen.getByText('+ Add Custom Reason')).toBeInTheDocument();
    });
  });

  it('opens inline input on clicking + Add Custom Reason and cancels on cancel', async () => {
    render(<DowntimeReasonSelect options={mockOptions} />);

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    const addBtn = await screen.findByText('+ Add Custom Reason');
    fireEvent.click(addBtn);

    // Verify inline input and Save/Cancel buttons
    const input = await screen.findByPlaceholderText('Type new downtime reason...');
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Type new downtime reason...')).not.toBeInTheDocument();
      expect(screen.getByText('+ Add Custom Reason')).toBeInTheDocument();
    });
  });

  it('persists newly created downtime reason to database and triggers onChange', async () => {
    const handleChange = jest.fn();
    const handleReasonCreated = jest.fn();

    apiMock.post.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'new-reason-uuid',
        name: 'Hydraulic Oil Leak',
        code: 'HYDRAULIC_OIL_LEAK',
      },
    } as any);

    const spyAddCache = jest.spyOn(lookupsCache, 'addCachedDowntimeReason');

    render(
      <DowntimeReasonSelect
        options={mockOptions}
        onChange={handleChange}
        onReasonCreated={handleReasonCreated}
      />,
    );

    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    const addBtn = await screen.findByText('+ Add Custom Reason');
    fireEvent.click(addBtn);

    const input = await screen.findByPlaceholderText('Type new downtime reason...');
    fireEvent.change(input, { target: { value: 'Hydraulic Oil Leak' } });

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith('/production/downtime-reasons', {
        name: 'Hydraulic Oil Leak',
      });
      expect(spyAddCache).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-reason-uuid',
          name: 'Hydraulic Oil Leak',
        }),
      );
      expect(handleReasonCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-reason-uuid',
          name: 'Hydraulic Oil Leak',
        }),
      );
      expect(handleChange).toHaveBeenCalledWith('new-reason-uuid');
    });
  });
});
