import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { ColumnsType } from 'antd/es/table';
import { TableColumnSelector, useColumnVisibility } from './TableColumnSelector';

interface Row {
  id: string;
  code: string;
  amount: number;
  notes?: string;
}

const TestGrid: React.FC<{ storageKey: string }> = ({ storageKey }) => {
  const columns: ColumnsType<Row> = [
    { title: 'Code', dataIndex: 'code', key: 'code' },
    { title: <span>Amount (PKR)</span>, dataIndex: 'amount', key: 'amount' },
    { title: 'Notes', dataIndex: 'notes', key: 'notes' },
    { title: 'Actions', key: 'actions', render: () => null },
  ];

  const { visibleColumns, selectorProps } = useColumnVisibility(storageKey, columns);

  return (
    <div>
      <TableColumnSelector {...selectorProps} />
      <div data-testid="visible-keys">{visibleColumns.map((c: any) => c.key).join(',')}</div>
    </div>
  );
};

describe('TableColumnSelector & useColumnVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows all columns initially and toggles optional columns cleanly with localStorage persistence', () => {
    const key = 'test_cols_pref_1';
    const { unmount } = render(<TestGrid storageKey={key} />);

    expect(screen.getByTestId('visible-keys').textContent).toBe('code,amount,notes,actions');
    expect(screen.getByText('4/4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Columns/i }));

    const notesCheckbox = screen.getByLabelText('Notes') as HTMLInputElement;
    expect(notesCheckbox.checked).toBe(true);
    fireEvent.click(notesCheckbox);

    expect(screen.getByTestId('visible-keys').textContent).toBe('code,amount,actions');
    expect(screen.getAllByText('3/4').length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(localStorage.getItem(key) || '[]')).toEqual(['notes']);

    // Actions remains locked
    const actionsCheckbox = screen.getByLabelText(/Actions/i) as HTMLInputElement;
    expect(actionsCheckbox.disabled).toBe(true);

    // Re-mounting restores saved preference
    unmount();
    render(<TestGrid storageKey={key} />);
    expect(screen.getByTestId('visible-keys').textContent).toBe('code,amount,actions');
    expect(screen.getByText('3/4')).toBeTruthy();
  });
});
