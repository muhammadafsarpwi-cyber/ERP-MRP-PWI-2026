import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App as AntApp } from 'antd';
import { PhotoCapture } from './PhotoCapture';

/**
 * Prompt #17 — visitor photo capture.
 *
 * Both capture paths the brief requires must be reachable ("Take Photo" and
 * "Upload Photo"), and a device/browser without a camera — or a denied
 * permission — must degrade to the upload fallback instead of blocking the
 * visitor flow.
 *
 * `PhotoCapture` is a CONTROLLED component (the page owns the File), so the
 * tests drive it through a small harness that holds the value — exactly what
 * `VisitorManagement` does in production.
 */
function CaptureHarness(props: Partial<React.ComponentProps<typeof PhotoCapture>>) {
  const [file, setFile] = React.useState<File | null>(null);
  return (
    <PhotoCapture
      {...props}
      value={file}
      onChange={(next) => {
        setFile(next);
        props.onChange?.(next);
      }}
    />
  );
}

const renderCapture = (props: Partial<React.ComponentProps<typeof PhotoCapture>> = {}) =>
  render(
    <AntApp>
      <CaptureHarness {...props} />
    </AntApp>,
  );

const imageFile = (name = 'visitor.jpg', type = 'image/jpeg') =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type });

describe('PhotoCapture', () => {
  afterEach(() => {
    // jsdom has no camera; restore anything a test installed.
    delete (navigator as any).mediaDevices;
    jest.restoreAllMocks();
  });

  it('offers both a camera path and an upload path before a photo is taken', async () => {
    renderCapture();

    expect(await screen.findByTestId('photo-capture-take-photo')).toBeInTheDocument();
    expect(screen.getByTestId('photo-capture-upload-photo')).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG or WebP/)).toBeInTheDocument();
    expect(screen.queryByTestId('photo-capture-preview')).not.toBeInTheDocument();
  });

  it('handles a device without camera support by pointing at the upload fallback', async () => {
    renderCapture();

    fireEvent.click(screen.getByTestId('photo-capture-take-photo'));

    const fallback = await screen.findByTestId('photo-capture-camera-fallback');
    expect(fallback).toHaveTextContent('Camera unavailable — use Upload Photo instead.');
    // Upload path stays usable — visitor creation is never blocked.
    expect(screen.getByTestId('photo-capture-upload-photo')).not.toBeDisabled();
    expect(screen.queryByTestId('photo-capture-camera')).not.toBeInTheDocument();
  });

  it('handles a denied camera permission the same graceful way', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error('NotAllowedError'));
    (navigator as any).mediaDevices = { getUserMedia };

    renderCapture();
    fireEvent.click(screen.getByTestId('photo-capture-take-photo'));

    const fallback = await screen.findByTestId('photo-capture-camera-fallback');
    // The inline fallback is the always-visible hint; the antd warning message
    // says WHY the camera is unavailable.
    expect(fallback).toHaveTextContent('Camera unavailable — use Upload Photo instead.');
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } });
    expect(
      (await screen.findAllByText(/Camera access was denied or is unavailable/)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('photo-capture-upload-photo')).not.toBeDisabled();
  });

  it('accepts an uploaded image and shows a preview that can be removed', async () => {
    const onChange = jest.fn();
    renderCapture({ onChange });

    fireEvent.change(screen.getByTestId('photo-capture-file'), {
      target: { files: [imageFile()] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith(expect.any(File));

    // Preview appears once the FileReader resolves.
    expect(await screen.findByTestId('photo-capture-preview')).toBeInTheDocument();
    expect(screen.getByTestId('photo-capture-preview-image')).toHaveAttribute(
      'src',
      expect.stringContaining('data:'),
    );
    expect(screen.getByTestId('photo-capture-retake')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('photo-capture-remove'));
    await waitFor(() => expect(screen.queryByTestId('photo-capture-preview')).not.toBeInTheDocument());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('rejects a non-image file instead of uploading it', async () => {
    const onChange = jest.fn();
    renderCapture({ onChange });

    fireEvent.change(screen.getByTestId('photo-capture-file'), {
      target: { files: [new File(['not an image'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByText('Please choose an image file.')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('photo-capture-preview')).not.toBeInTheDocument();
  });

  it('rejects an image larger than 5 MB', async () => {
    const onChange = jest.fn();
    renderCapture({ onChange });

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByTestId('photo-capture-file'), { target: { files: [big] } });

    expect(await screen.findByText('The photo must be 5 MB or smaller.')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
