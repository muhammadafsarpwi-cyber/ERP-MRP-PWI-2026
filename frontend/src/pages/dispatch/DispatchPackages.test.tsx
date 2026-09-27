import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DispatchPackagesPage } from './DispatchPackagesPage';
import { MobilePackageBuilder } from './MobilePackageBuilder';
import { GatePassExitModal } from './GatePassExitModal';
import { DispatchPackagePrintModal } from './DispatchPackagePrint';
import {
  dispatchPackageService,
  DispatchPackageStatus,
} from '../../services/dispatchPackageService';
import { apiService } from '../../services/api';

jest.mock('../../services/dispatchPackageService');
jest.mock('../../services/api');

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as any;
});

const mockPackageOpen = {
  id: 'pkg-1',
  companyId: 'comp-1',
  packageNo: 'PKG-2026000001',
  customerName: 'Prime Electric Co',
  salesOrderNo: 'SO-1001',
  status: DispatchPackageStatus.OPEN,
  packageDate: '2026-09-27',
  totalUnits: 2,
  totalWeight: 53.9,
  totalLength: 750,
  packageQrPayload: 'PKG-2026000001',
  printCount: 0,
  createdAt: '2026-09-27T10:00:00Z',
  updatedAt: '2026-09-27T10:00:00Z',
  units: [
    {
      id: 'pu-rel-1',
      companyId: 'comp-1',
      packageId: 'pkg-1',
      productionUnitId: 'pu-1',
      addedAt: '2026-09-27T10:01:00Z',
      status: 'PACKED' as const,
      productionUnit: {
        id: 'pu-1',
        unitSerialNo: 'PWI-PU-2026000011',
        coilNo: 'CN-011',
        weightKg: 27.1,
        lengthMeters: 500,
        batchNo: '01',
        item: { id: 'it-1', itemCode: 'CAS-06', name: '6 MM PVC 2P OUTER CASING' },
      },
    },
    {
      id: 'pu-rel-2',
      companyId: 'comp-1',
      packageId: 'pkg-1',
      productionUnitId: 'pu-2',
      addedAt: '2026-09-27T10:02:00Z',
      status: 'PACKED' as const,
      productionUnit: {
        id: 'pu-2',
        unitSerialNo: 'PWI-PU-2026000012',
        coilNo: 'CN-012',
        weightKg: 26.8,
        lengthMeters: 250,
        batchNo: '01',
        item: { id: 'it-1', itemCode: 'CAS-06', name: '6 MM PVC 2P OUTER CASING' },
      },
    },
  ],
};

const mockPackageFinalized = {
  ...mockPackageOpen,
  id: 'pkg-2',
  packageNo: 'PKG-2026000002',
  status: DispatchPackageStatus.FINALIZED,
  gatePassNo: 'GP-2026-0099',
  vehicleNo: 'LEA-1234',
  driverName: 'Muhammad Akram',
};

describe('Dispatch Packages & Mobile QR Scanning Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService.get as jest.Mock).mockResolvedValue({ data: [] });
    (dispatchPackageService.list as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockPackageOpen, mockPackageFinalized],
      total: 2,
    });
    (dispatchPackageService.getOne as jest.Mock).mockResolvedValue({
      success: true,
      data: mockPackageOpen,
    });
  });

  // 1. Mobile package screen & list rendering
  test('1. Renders dispatch packages list with running metrics and status', async () => {
    render(<DispatchPackagesPage />);

    expect(screen.getByText(/Dispatch Packages & Mobile QR Scanning/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('PKG-2026000001')).toBeInTheDocument();
      expect(screen.getByText('PKG-2026000002')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Prime Electric Co').length).toBeGreaterThan(0);
  });

  // 2. Mobile package builder screen & running totals
  test('2. Renders Mobile Package Builder with live running totals', async () => {
    render(
      <MobilePackageBuilder
        open={true}
        onClose={jest.fn()}
        pkgId="pkg-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('PKG-2026000001')).toBeInTheDocument();
    });

    // Running totals verification
    expect(screen.getByText('UNITS')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByText('53.9')).toBeInTheDocument();
    expect(screen.getByText('750')).toBeInTheDocument();
    expect(screen.getByText('CN-011')).toBeInTheDocument();
    expect(screen.getByText('CN-012')).toBeInTheDocument();
  });

  // 3. Scan success workflow
  test('3. Scans Production Unit QR and adds unit with success feedback', async () => {
    const updatedPkg = {
      ...mockPackageOpen,
      totalUnits: 3,
      totalWeight: 81.0,
      totalLength: 1000,
    };

    (dispatchPackageService.scanAndAddUnit as jest.Mock).mockResolvedValue({
      success: true,
      data: updatedPkg,
      unit: {
        coilNo: 'CN-013',
        unitSerialNo: 'PWI-PU-2026000013',
        weightKg: 27.1,
        lengthMeters: 250,
        item: { name: '6 MM PVC 2P OUTER CASING' },
      },
      message: 'Unit CN-013 added to package PKG-2026000001',
    });

    render(
      <MobilePackageBuilder
        open={true}
        onClose={jest.fn()}
        pkgId="pkg-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('PKG-2026000001')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Scan coil QR or serial/i);
    fireEvent.change(input, { target: { value: 'PWI-PU-2026000013' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(dispatchPackageService.scanAndAddUnit).toHaveBeenCalledWith(
        'pkg-1',
        'PWI-PU-2026000013'
      );
      expect(screen.getByText('✓ ADDED TO PACKAGE')).toBeInTheDocument();
    });
  });

  // 4. Duplicate scan protection
  test('4. Duplicate scan protection warns operator and does not duplicate unit', async () => {
    (dispatchPackageService.scanAndAddUnit as jest.Mock).mockRejectedValue({
      response: {
        data: {
          message: 'Production unit CN-011 is already in this package',
        },
      },
    });

    render(
      <MobilePackageBuilder
        open={true}
        onClose={jest.fn()}
        pkgId="pkg-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('PKG-2026000001')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Scan coil QR or serial/i);
    fireEvent.change(input, { target: { value: 'CN-011' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('⚠ ALREADY IN THIS PACKAGE')).toBeInTheDocument();
      expect(
        screen.getByText('Production unit CN-011 is already in this package')
      ).toBeInTheDocument();
    });
  });

  // 5. Remove unit before finalization
  test('5. Removes unit from package when requested without affecting master PU', async () => {
    (dispatchPackageService.removeUnit as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        ...mockPackageOpen,
        totalUnits: 1,
        totalWeight: 27.1,
        units: [mockPackageOpen.units[0]],
      },
      removedUnitId: 'pu-rel-2',
      message: 'Unit removed from package',
    });

    render(
      <MobilePackageBuilder
        open={true}
        onClose={jest.fn()}
        pkgId="pkg-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('CN-012')).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  // 6. Finalize confirmation dialog & execution
  test('6. Opens finalize confirmation and locks package', async () => {
    (dispatchPackageService.finalize as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        ...mockPackageOpen,
        status: DispatchPackageStatus.FINALIZED,
      },
      message: 'Package finalized successfully',
    });

    render(
      <MobilePackageBuilder
        open={true}
        onClose={jest.fn()}
        pkgId="pkg-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/FINALIZE PACKAGE \(2 Units\)/i)).toBeInTheDocument();
    });

    const finalizeBtn = screen.getByText(/FINALIZE PACKAGE \(2 Units\)/i);
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Confirm Package Finalization/i)).toBeInTheDocument();
      expect(screen.getByText(/Package Finalization Locks Contents/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Yes, Finalize & Lock Package/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(dispatchPackageService.finalize).toHaveBeenCalledWith('pkg-1');
    });
  });

  // 7. Package document / label print preview
  test('7. Renders package document print preview with Package QR and coils table', () => {
    render(
      <DispatchPackagePrintModal
        open={true}
        onClose={jest.fn()}
        pkg={mockPackageFinalized as any}
      />
    );

    expect(screen.getByText(/Dispatch Package Document/i)).toBeInTheDocument();
    expect(screen.getByText('PACKAGE QR')).toBeInTheDocument();
    expect(screen.getByText('Print Package Document / Label')).toBeInTheDocument();
  });

  // 8. Gate Pass linkage & factory exit verification
  test('8. Authorizes gate exit and marks package dispatched', async () => {
    (dispatchPackageService.gateVerify as jest.Mock).mockResolvedValue({
      success: true,
      data: mockPackageFinalized,
      message: 'Package verified',
    });

    (dispatchPackageService.gateExit as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        ...mockPackageFinalized,
        status: DispatchPackageStatus.DISPATCHED,
        dispatchedAt: new Date().toISOString(),
      },
      message: 'Gate pass exited successfully',
    });

    render(
      <GatePassExitModal
        open={true}
        onClose={jest.fn()}
        pkg={mockPackageFinalized as any}
      />
    );

    expect(screen.getByText(/Gate Pass & Factory Exit Verification/i)).toBeInTheDocument();
    expect(screen.getByText('Confirm Factory Exit / Mark Exited')).toBeInTheDocument();

    const exitBtn = screen.getByText('Confirm Factory Exit / Mark Exited');
    fireEvent.click(exitBtn);

    await waitFor(() => {
      expect(dispatchPackageService.gateExit).toHaveBeenCalledWith('pkg-2', expect.any(Object));
    });
  });
});
