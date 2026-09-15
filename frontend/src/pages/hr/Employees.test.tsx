import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import EmployeesPage from './Employees';
import apiService from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  describeRequestError: (err: any) =>
    err?.response?.data?.message ?? String(err?.message ?? 'Unknown request error'),
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

beforeAll(() => {
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
});

const mockEmployees = [
  {
    id: 'emp-1',
    companyId: 'company-1',
    employeeCode: '00400541',
    firstName: 'Muhammad',
    lastName: 'Farooq',
    email: 'farooq@example.com',
    phone: '0300-1234567',
    designationName: 'Flattening Operator',
    departmentName: 'Flattening',
    divisionName: 'Manufacturing',
    sectionName: 'Plant 1',
    status: 'ACTIVE',
  },
  {
    id: 'emp-2',
    companyId: 'company-1',
    employeeCode: '00400542',
    firstName: 'M.Arsalan',
    lastName: '',
    email: 'arsalan@example.com',
    phone: '0301-7654321',
    designationName: 'Senior operator',
    departmentName: 'Spiral',
    divisionName: 'Manufacturing',
    sectionName: 'Plant 2',
    status: 'ACTIVE',
  },
];

import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { App } from 'antd';

function HeaderActionsHost() {
  const extra = useHeaderActions((s) => s.extra);
  const title = useHeaderActions((s) => s.title);
  return (
    <div data-testid="header-actions">
      <div>{title}</div>
      <div>{extra}</div>
    </div>
  );
}

function renderPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/hr/employees']}>
        <HeaderActionsHost />
        <EmployeesPage />
      </MemoryRouter>
    </App>
  );
}

describe('EmployeesPage (2027 Model)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('erp_user', JSON.stringify({ defaultCompanyId: 'company-1' }));

    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/hr/employees') {
        return { data: mockEmployees, total: 2 };
      }
      if (url === '/divisions') {
        return { data: [{ id: 'div-1', name: 'Manufacturing' }] };
      }
      if (url === '/sections') {
        return { data: [{ id: 'sec-1', name: 'Plant 1', divisionId: 'div-1' }] };
      }
      if (url === '/departments') {
        return { data: [{ id: 'dept-1', name: 'Flattening', divisionId: 'div-1' }] };
      }
      if (url === '/hr/designations') {
        return { data: [{ id: 'des-1', designationCode: 'DES-01', designationName: 'Flattening Operator' }] };
      }
      return { data: [] };
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the 4 mandatory table headers (EmployeeID, EmployeeName, Designation, Department)', async () => {
    renderPage();

    // Verify 4 mandatory column headers
    const idHeaders = await screen.findAllByText('EmployeeID');
    expect(idHeaders.length).toBeGreaterThan(0);

    const nameHeaders = screen.getAllByText('EmployeeName');
    expect(nameHeaders.length).toBeGreaterThan(0);

    const desigHeaders = screen.getAllByText('Designation');
    expect(desigHeaders.length).toBeGreaterThan(0);

    const deptHeaders = screen.getAllByText('Department');
    expect(deptHeaders.length).toBeGreaterThan(0);

    // Verify data rows
    expect(await screen.findByText('00400541')).toBeInTheDocument();
    expect(screen.getByText('Muhammad Farooq')).toBeInTheDocument();
    expect(screen.getByText('Flattening Operator')).toBeInTheDocument();
    expect(screen.getByText('Flattening')).toBeInTheDocument();

    expect(screen.getByText('00400542')).toBeInTheDocument();
    expect(screen.getByText('M.Arsalan')).toBeInTheDocument();
  });

  it('renders toolbar action buttons: New Employee, Import, Export, PDF, Print', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: /New Employee/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print/i })).toBeInTheDocument();
  });

  it('opens New Employee modal when clicking New Employee button', async () => {
    renderPage();

    const newBtn = await screen.findByRole('button', { name: /New Employee/i });
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText('Primary Master Details (Mandatory)')).toBeInTheDocument();
      expect(screen.getByLabelText(/EmployeeID \(Code\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Employee Name \(First\)/i)).toBeInTheDocument();
    });
  });

  it('opens Import modal when clicking Import button', async () => {
    renderPage();

    const importBtn = await screen.findByRole('button', { name: /Import/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText(/Import Employees.*Excel.*CSV/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download Template/i })).toBeInTheDocument();
    });
  });

  it('opens View Details drawer when clicking employee code link', async () => {
    renderPage();

    const codeLink = await screen.findByText('00400541');
    fireEvent.click(codeLink);

    await waitFor(() => {
      expect(screen.getByText('Organization & Placement')).toBeInTheDocument();
      expect(screen.getByText('Contact & Personal')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Edit Employee/i })).toBeInTheDocument();
    });
  });
});
