import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import StoreItems from './StoreItems';
import apiService from '../../services/api';

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter initialEntries={['/store/items']}>{ui}</MemoryRouter>);
};

jest.mock('../../services/api');
const mockedApi = apiService as jest.Mocked<typeof apiService>;

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    function (query: string) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    };
});

describe('StoreItems Component', () => {
  const mockDivisions = [
    { id: 'div-1', divisionCode: 'SPD', name: 'Spoke Division' },
    { id: 'div-2', divisionCode: 'CCD', name: 'Control Cable Division' },
  ];

  const mockSections = [
    { id: 'sec-1', sectionCode: 'SEC-SPD-01', name: 'Assembly Line A', divisionId: 'div-1' },
    { id: 'sec-2', sectionCode: 'SEC-CCD-01', name: 'CCD Raw Material Store', divisionId: 'div-2' },
  ];

  const mockDepartments = [
    { id: 'dept-1', departmentCode: 'DEPT-01', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' },
    { id: 'dept-2', departmentCode: 'DEPT-02', name: 'CCD Stores', divisionId: 'div-2', sectionId: 'sec-2' },
  ];

  const mockStores = [
    {
      id: 'store-1',
      storeCode: 'CCD-FG-STORE',
      storeName: 'CCD Finished Goods Store',
      storeType: 'FINISHED_GOODS',
      divisionId: 'div-1',
      sectionId: 'sec-1',
      departmentId: 'dept-1',
      status: 'ACTIVE',
    },
    {
      id: 'store-2',
      storeCode: 'CCD-RM-STORE',
      storeName: 'CCD Raw Material Store',
      storeType: 'RAW_MATERIAL',
      divisionId: 'div-2',
      sectionId: 'sec-2',
      departmentId: 'dept-2',
      status: 'ACTIVE',
    },
  ];

  const mockStoreItems = [
    {
      id: 'si-1',
      storeId: 'store-2',
      itemId: 'item-001',
      item: {
        id: 'item-001',
        itemCode: 'RM-WIRE-002',
        name: '1.45 mm-B4 Wire',
        uomCode: 'KG',
        uomName: 'Kilogram',
      },
      bin: 'A-01',
      rack: 'Rack-A',
      shelf: 'Shelf-1',
      locationDetail: 'Bay 4',
      minimumStock: 500,
      reorderLevel: 750,
      maximumStock: 3000,
      preferredIssueMethod: 'FIFO',
      batchTracked: true,
      serialTracked: false,
      status: 'ACTIVE',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockImplementation(async (url: string, params?: any) => {
      if (url === '/divisions') return { data: mockDivisions };
      if (url === '/sections') return { data: mockSections };
      if (url === '/departments') return { data: mockDepartments };
      if (url === '/store/stores') return mockStores;
      if (url.startsWith('/store/stores/store-2/items')) return mockStoreItems;
      if (url.startsWith('/store/stores/store-1/items')) return [];
      return [];
    });
  });

  it('renders cascading hierarchy inputs', async () => {
    renderWithRouter(<StoreItems />);
    expect(screen.getByText('Hierarchy & Store Selection')).toBeInTheDocument();
    expect(screen.getByText('Division')).toBeInTheDocument();
    expect(screen.getByText('Section')).toBeInTheDocument();
    expect(screen.getByText('Department')).toBeInTheDocument();
    expect(screen.getByText('Store / Warehouse')).toBeInTheDocument();
  });

  it('loads and displays initial empty state prompt with store shortcuts', async () => {
    renderWithRouter(<StoreItems />);
    await waitFor(() => {
      expect(screen.getByText('Select Division, Section, and Department')).toBeInTheDocument();
    });
    expect(screen.getByText('CCD Finished Goods Store')).toBeInTheDocument();
    expect(screen.getByText('CCD Raw Material Store')).toBeInTheDocument();
  });

  it('loads store items when store shortcut button is clicked', async () => {
    renderWithRouter(<StoreItems />);
    await waitFor(() => {
      expect(screen.getByText('CCD Raw Material Store')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CCD Raw Material Store'));

    await waitFor(() => {
      expect(screen.getByText('RM-WIRE-002')).toBeInTheDocument();
      expect(screen.getByText('1.45 mm-B4 Wire')).toBeInTheDocument();
      expect(screen.getByText('Bin: A-01')).toBeInTheDocument();
      expect(screen.getByText('Rack: Rack-A')).toBeInTheDocument();
      expect(screen.getByText('Shelf: Shelf-1')).toBeInTheDocument();
    });
  });
});
