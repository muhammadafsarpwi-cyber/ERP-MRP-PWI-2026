import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App as AntApp } from 'antd';
import SignaturePad from './SignaturePad';

jest.setTimeout(60000);

/**
 * Prompt #19 §14 — the digital signature is OPTIONAL and is captured with
 * draw / clear / save. These tests drive the real component; only the browser
 * APIs jsdom lacks (2D canvas, image decoding, layout) are stubbed, and they are
 * plain functions because Create React App enables `resetMocks: true`, which
 * would strip a `jest.fn()` implementation before every test.
 */

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const calls: { draw: number; clear: number; toDataURL: number } = { draw: 0, clear: 0, toDataURL: 0 };

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = function getContext() {
    return {
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      strokeStyle: '#000',
      fillStyle: '#000',
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {
        calls.draw += 1;
      },
      stroke: () => {},
      clearRect: () => {
        calls.clear += 1;
      },
      fillRect: () => {},
      drawImage: () => {},
    };
  };
  (HTMLCanvasElement.prototype as any).toDataURL = () => {
    calls.toDataURL += 1;
    return PNG_DATA_URL;
  };
  (HTMLCanvasElement.prototype as any).getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: 460, bottom: 160, width: 460, height: 160, toJSON: () => ({}) }) as DOMRect;
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    width = 0;
    height = 0;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      setTimeout(() => this.onload?.(), 0);
    }
  }
  (global as any).Image = StubImage;
});

beforeEach(() => {
  calls.draw = 0;
  calls.clear = 0;
  calls.toDataURL = 0;
});

function renderPad(props: Partial<React.ComponentProps<typeof SignaturePad>> = {}) {
  const onChange = jest.fn();
  const view = render(
    <AntApp>
      <SignaturePad onChange={onChange} testId="pad" {...props} />
    </AntApp>,
  );
  return { view, onChange, canvas: screen.getByTestId('pad-canvas') as HTMLCanvasElement };
}

/** Press, drag and release — what a finger or a mouse actually does. */
function sign(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 30, clientY: 40, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 150, clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 260, clientY: 60, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 260, clientY: 60, pointerId: 1 });
}

describe('SignaturePad', () => {
  it('starts empty, with Clear and Save disabled — the signature is optional', () => {
    const { canvas, onChange } = renderPad();

    expect(screen.getByTestId('pad-status')).toHaveTextContent('No signature captured');
    expect(screen.getByTestId('pad-clear')).toBeDisabled();
    expect(screen.getByTestId('pad-save')).toBeDisabled();
    // Nothing was invented on mount.
    expect(onChange).not.toHaveBeenCalled();
    expect(calls.toDataURL).toBe(0);
    expect(canvas.getAttribute('aria-label')).toBe('Signature drawing area');
  });

  it('draws a stroke and reports "Signature captured" once the pointer is released', () => {
    const { canvas } = renderPad();

    sign(canvas);

    expect(calls.draw).toBeGreaterThan(0);
    expect(screen.getByTestId('pad-status')).toHaveTextContent('Signature captured');
    expect(screen.getByTestId('pad-clear')).not.toBeDisabled();
    expect(screen.getByTestId('pad-save')).not.toBeDisabled();
  });

  it('exports the drawing as a PNG data URL exactly once per stroke', () => {
    const { canvas, onChange } = renderPad();

    sign(canvas);

    // §22 — the value handed to the page is a data URL, never a storage path.
    expect(onChange).toHaveBeenCalledWith(PNG_DATA_URL);
    expect(onChange).toHaveBeenCalledTimes(1);

    // A second, separate stroke exports again.
    sign(canvas);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not report ink while the pointer is merely hovering the pad', () => {
    const { canvas, onChange } = renderPad();

    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 80, pointerId: 1 });
    fireEvent.pointerLeave(canvas);

    expect(calls.draw).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('pad-status')).toHaveTextContent('No signature captured');
  });

  it('Clear wipes the drawing and hands back null', () => {
    const { canvas, onChange } = renderPad();
    sign(canvas);

    fireEvent.click(screen.getByTestId('pad-clear'));

    expect(calls.clear).toBeGreaterThan(0);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId('pad-status')).toHaveTextContent('No signature captured');
    expect(screen.getByTestId('pad-clear')).toBeDisabled();
  });

  it('Save re-exports the current drawing on demand', () => {
    const { canvas, onChange } = renderPad();
    sign(canvas);
    onChange.mockClear();
    const before = calls.toDataURL;

    fireEvent.click(screen.getByTestId('pad-save'));

    expect(calls.toDataURL).toBe(before + 1);
    expect(onChange).toHaveBeenCalledWith(PNG_DATA_URL);
  });

  it('re-paints an externally supplied value, so the pad and the record agree', () => {
    const { view, onChange } = renderPad({ value: PNG_DATA_URL });

    // A supplied signature counts as ink and the controls become usable.
    expect(screen.getByTestId('pad-status')).toHaveTextContent('Signature captured');
    expect(screen.getByTestId('pad-save')).not.toBeDisabled();
    // Loading a value is not a new signature.
    expect(onChange).not.toHaveBeenCalled();

    view.rerender(
      <AntApp>
        <SignaturePad onChange={onChange} testId="pad" value={null} />
      </AntApp>,
    );
    expect(screen.getByTestId('pad-status')).toHaveTextContent('No signature captured');
  });

  it('ignores every gesture while disabled', () => {
    const { canvas, onChange } = renderPad({ disabled: true });

    sign(canvas);

    expect(calls.draw).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('pad-clear')).toBeDisabled();
    expect(screen.getByTestId('pad-save')).toBeDisabled();
  });
});
