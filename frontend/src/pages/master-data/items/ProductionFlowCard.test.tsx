import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StageBlock } from './ProductionFlowCard';
import {
  deriveNextStageTitle,
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
    kind: 'process',
    stageKey: 'SPIRAL',
    title: 'SPIRAL',
    itemId: null,
    itemCode: null,
    itemName: null,
    itemType: null,
    isCurrent: false,
    configured: true,
    ...overrides,
  };
}

describe('TASK 12 — deriveNextStageTitle (+isEmptyValue) mapping helpers', () => {
  it('maps a spiral next step to the canonical SPIRAL / SPIRAL OUTPUT titles', () => {
    expect(deriveNextStageTitle('Spiral Winding', 'process')).toBe('SPIRAL');
    expect(deriveNextStageTitle('Spiral Winding', 'output')).toBe('SPIRAL OUTPUT');
  });

  it('maps other operation families to their own operation-based titles (no hardcoded SPIRAL)', () => {
    expect(deriveNextStageTitle('PVC Extrusion', 'process')).toBe('PVC EXTRUSION');
    expect(deriveNextStageTitle('PVC Extrusion', 'output')).toBe('PVC OUTPUT');
    expect(deriveNextStageTitle('Packing', 'process')).toBe('PACKING');
    expect(deriveNextStageTitle('Packing', 'output')).toBe('PACKING OUTPUT');
    expect(deriveNextStageTitle('Wire Drawing', 'process')).toBe('WIRE DRAWING');
    expect(deriveNextStageTitle('Wire Drawing', 'output')).toBe('DRAWING OUTPUT');
    expect(deriveNextStageTitle('Flattening', 'process')).toBe('FLATTENING');
    expect(deriveNextStageTitle('Flattening', 'output')).toBe('FLATTENING OUTPUT');
  });

  it('falls back to generic NEXT PROCESS / NEXT OUTPUT titles for unknown text', () => {
    expect(deriveNextStageTitle('Custom Step XYZ', 'process')).toBe('NEXT PROCESS');
    expect(deriveNextStageTitle('Custom Step XYZ', 'output')).toBe('NEXT OUTPUT');
    expect(deriveNextStageTitle('', 'process')).toBe('NEXT PROCESS');
    expect(deriveNextStageTitle('', 'output')).toBe('NEXT OUTPUT');
  });

  it('isEmptyValue treats null / undefined / whitespace-only as empty', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue('   ')).toBe(true);
    expect(isEmptyValue('\t\n ')).toBe(true);
    expect(isEmptyValue('3.75 mm 2P')).toBe(false);
    expect(isEmptyValue('Spiral Winding')).toBe(false);
  });
});

describe('TASK 12 — ProductionFlowCard StageBlock rendering', () => {
  it('renders the packing/next-step operation on a configured stage 05', () => {
    render(
      <StageBlock
        stage={stage({
          sequence: 5,
          kind: 'process',
          title: 'SPIRAL',
          operationName: 'Spiral Winding',
          configured: true,
        })}
      />,
    );
    expect(screen.getByText('Spiral Winding')).toBeInTheDocument();
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
  });

  it('renders the final product name on a configured stage 06 even with no item code', () => {
    render(
      <StageBlock
        stage={stage({
          sequence: 6,
          kind: 'output',
          title: 'SPIRAL OUTPUT',
          itemCode: null,
          itemName: '3.75 mm 2P',
          configured: true,
        })}
      />,
    );
    expect(screen.getByText('3.75 mm 2P')).toBeInTheDocument();
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
  });

  it('shows "Not configured" for an empty stage 05', () => {
    render(
      <StageBlock
        stage={stage({
          sequence: 5,
          kind: 'process',
          title: 'NEXT PROCESS',
          operationName: null,
          configured: false,
        })}
      />,
    );
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('shows "Not configured" for an empty stage 06', () => {
    render(
      <StageBlock
        stage={stage({
          sequence: 6,
          kind: 'output',
          title: 'NEXT OUTPUT',
          itemCode: null,
          itemName: null,
          configured: false,
        })}
      />,
    );
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });
});