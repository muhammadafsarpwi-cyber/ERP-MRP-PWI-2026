import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StageBlock } from './ProductionFlowCard';
import {
  stageTitleForOperation,
  isEmptyValue,
  type ProductionFlowStage,
} from './itemTypes';

jest.setTimeout(45000);

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

function stage(overrides: Partial<ProductionFlowStage>): ProductionFlowStage {
  return {
    sequence: 5,
    itemNumber: 5,
    kind: 'process',
    stageKey: 'OP_X',
    title: 'STRIPPING',
    itemId: null,
    itemCode: null,
    itemName: null,
    itemType: null,
    isCurrent: false,
    configured: true,
    ...overrides,
  };
}

describe('TASK 14 — stageTitleForOperation (+isEmptyValue) mapping helpers', () => {
  it('uses the REAL operation text verbatim (no keyword canonical mapping)', () => {
    expect(stageTitleForOperation('Wire Straightening', 'process')).toBe('WIRE STRAIGHTENING');
    expect(stageTitleForOperation('Wire Straightening', 'output')).toBe('WIRE STRAIGHTENING OUTPUT');
    expect(stageTitleForOperation('Swagging', 'process')).toBe('SWAGGING');
    expect(stageTitleForOperation('Swagging', 'output')).toBe('SWAGGING OUTPUT');
    expect(stageTitleForOperation('Flattening', 'process')).toBe('FLATTENING');
    expect(stageTitleForOperation('Flattening', 'output')).toBe('FLATTENING OUTPUT');
  });

  it('never substitutes canonical names for unrelated operations', () => {
    // "Flattening" must NOT appear for a Spiral-based route and vice-versa.
    expect(stageTitleForOperation('Spiral Winding', 'process')).toBe('SPIRAL WINDING');
    expect(stageTitleForOperation('Spiral Winding', 'output')).toBe('SPIRAL WINDING OUTPUT');
    expect(stageTitleForOperation('PVC Extrusion', 'process')).toBe('PVC EXTRUSION');
    expect(stageTitleForOperation('Packing', 'process')).toBe('PACKING');
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(stageTitleForOperation(null, 'process')).toBeNull();
    expect(stageTitleForOperation(undefined, 'process')).toBeNull();
    expect(stageTitleForOperation('', 'process')).toBeNull();
    expect(stageTitleForOperation('   ', 'process')).toBeNull();
    expect(stageTitleForOperation('', 'output')).toBeNull();
  });

  it('isEmptyValue treats null / undefined / whitespace-only as empty', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue('   ')).toBe(true);
    expect(isEmptyValue('\t\n ')).toBe(true);
    expect(isEmptyValue('3.75 mm 2P')).toBe(false);
    expect(isEmptyValue('Wire Straightening')).toBe(false);
  });
});

describe('TASK 14 — ProductionFlowCard StageBlock rendering', () => {
  it('renders STEP and ITEM numbers on a configured stage', () => {
    render(<StageBlock stage={stage({ sequence: 2, itemNumber: 2, kind: 'output' })} />);
    expect(screen.getByText('STEP 02')).toBeInTheDocument();
    expect(screen.getByText('ITEM 02')).toBeInTheDocument();
  });

  it('renders the real operation name from data on a configured process stage', () => {
    render(
      <StageBlock
        stage={stage({
          sequence: 1,
          itemNumber: 2,
          kind: 'process',
          title: 'WIRE STRAIGHTENING',
          operationName: 'Wire Straightening',
          departmentName: 'Wire Straightening',
          configured: true,
        })}
      />,
    );
    expect(screen.getByText('Wire Straightening')).toBeInTheDocument();
    expect(screen.getByText('WIRE STRAIGHTENING')).toBeInTheDocument();
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
    expect(screen.queryByText('Flattening')).not.toBeInTheDocument();
  });

  it('shows the em dash for a configured stage with no operation', () => {
    render(
      <StageBlock
        stage={stage({
          kind: 'process',
          title: 'FINISHED GOOD',
          operationName: null,
          departmentName: null,
          configured: true,
        })}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders division · section on a process stage when available', () => {
    render(
      <StageBlock
        stage={stage({
          kind: 'process',
          operationName: 'Swagging',
          departmentName: 'Spoke',
          divisionName: 'Spokes Division',
          sectionName: 'Butted',
        })}
      />,
    );
    expect(screen.getByText('Spokes Division · Butted')).toBeInTheDocument();
  });

  it('renders the item code + name on an output stage', () => {
    render(
      <StageBlock
        stage={stage({
          sequence: 3,
          itemNumber: 3,
          kind: 'output',
          title: 'WIRE STRAIGHTENING OUTPUT',
          itemCode: 'WIP-STRAIGHT-001',
          itemName: 'Straightened Wire',
          configured: true,
        })}
      />,
    );
    expect(screen.getByText('WIP-STRAIGHT-001')).toBeInTheDocument();
    expect(screen.getByText('Straightened Wire')).toBeInTheDocument();
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
  });

  it('shows "Not configured" for an unconfigured stage', () => {
    render(
      <StageBlock
        stage={stage({
          kind: 'process',
          operationName: null,
          configured: false,
        })}
      />,
    );
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });
});