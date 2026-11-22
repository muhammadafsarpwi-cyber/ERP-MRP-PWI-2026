import React from 'react';
import { render } from '@testing-library/react';
import PreConfirmVerificationCard from './PreConfirmVerificationCard';
import { summarizeLinesTaxVerification } from '../../utils/salesTaxVerification';

describe('PreConfirmVerificationCard — stacked code/name formatting', () => {
  const summary = summarizeLinesTaxVerification(
    [
      {
        id: 'l1',
        itemCode: 'SPI-FG-SPK-001',
        itemName: '250*17 Inn / Out Spoke Straight__RM-250*17 Nipple',
        quantity: 10,
        unitPrice: 100,
        taxPercent: 18,
      },
    ],
    18,
  );

  it('stacks "[CODE] NAME" customer values into a code pill and a separate bold name line', () => {
    const { container } = render(
      <PreConfirmVerificationCard
        summary={summary}
        headerItems={[{ label: 'Customer Name', value: '[CUS-ASA-005] ALI SHAH AUTOS' }]}
      />,
    );
    const spans = Array.from(container.querySelectorAll('span'));
    const codeSpan = spans.find((s) => s.textContent === 'CUS-ASA-005');
    const nameSpan = spans.find((s) => s.textContent === 'ALI SHAH AUTOS');
    expect(codeSpan).toBeTruthy();
    expect(nameSpan).toBeTruthy();
    expect(codeSpan).not.toBe(nameSpan);
    expect(container.textContent).not.toContain('[CUS-ASA-005]');
  });

  it('splits item names at "__" onto a separate sub-line', () => {
    const { container } = render(<PreConfirmVerificationCard summary={summary} />);
    const divs = Array.from(container.querySelectorAll('div'));
    expect(divs.some((d) => d.textContent === '250*17 Inn / Out Spoke Straight')).toBe(true);
    expect(divs.some((d) => d.textContent === 'RM-250*17 Nipple')).toBe(true);
    expect(container.textContent).not.toContain('__');
  });
});
