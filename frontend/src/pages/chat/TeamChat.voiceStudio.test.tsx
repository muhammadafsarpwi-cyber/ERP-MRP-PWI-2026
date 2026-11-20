import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import TeamChat from './TeamChat';
import { apiService } from '../../services/api';

jest.mock('../../services/api', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const apiMock = apiService as jest.Mocked<typeof apiService>;

jest.setTimeout(30000);

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  Element.prototype.scrollIntoView = jest.fn();
});

describe('TeamChat — WhatsApp-Style Voice Studio Bar', () => {
  let mockRecorderInstance: {
    state: 'inactive' | 'recording' | 'paused';
    mimeType: string;
    ondataavailable: ((ev: { data: Blob }) => void) | null;
    onstop: (() => void) | null;
    start: jest.Mock;
    pause: jest.Mock;
    resume: jest.Mock;
    requestData: jest.Mock;
    stop: jest.Mock;
  };
  let mockAnalyser: {
    fftSize: number;
    smoothingTimeConstant: number;
    frequencyBinCount: number;
    getByteFrequencyData: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(() => {
    localStorage.clear();
    HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = jest.fn();
    apiMock.get.mockReset();
    apiMock.post.mockReset();

    apiMock.get.mockImplementation((url: string) => {
      if (url === '/team-chat/users') {
        return Promise.resolve({
          success: true,
          data: {
            currentUser: {
              id: 'user-1',
              fullName: 'Muhammad Afsar',
              email: 'afsar@pwi.test',
              role: 'ADMIN',
              department: 'Management',
              avatarUrl: null,
            },
            users: [],
          },
        } as any);
      }
      if (url === '/team-chat/conversations') {
        return Promise.resolve({
          success: true,
          data: [
            {
              id: 'conv-general',
              type: 'GROUP',
              title: '#general-factory',
              departmentTag: 'General',
              participantCount: 5,
              unreadCount: 0,
              updatedAt: '2026-11-21T01:00:00Z',
              createdAt: '2026-11-21T01:00:00Z',
              partner: null,
              lastMessage: null,
            },
          ],
        } as any);
      }
      if (url.includes('/messages')) {
        return Promise.resolve({
          success: true,
          data: {
            conversationId: 'conv-general',
            currentUserId: 'user-1',
            messages: [],
          },
        } as any);
      }
      return Promise.resolve({ success: true, data: [] } as any);
    });

    apiMock.post.mockResolvedValue({
      success: true,
      data: {
        id: 'msg-voice-1',
        conversationId: 'conv-general',
        senderId: 'user-1',
        content: '',
        erpRefCode: null,
        attachmentUrl: 'data:audio/webm;base64,AAAA',
        attachmentName: 'voice-note-012500.webm',
        messageType: 'VOICE',
        audioDurationSec: 2,
        isOwn: true,
        sender: { id: 'user-1', fullName: 'Muhammad Afsar', avatarUrl: null, role: 'ADMIN' },
        createdAt: '2026-11-21T01:25:00Z',
      },
    } as any);

    const stopTrack = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
    });

    mockRecorderInstance = {
      state: 'inactive',
      mimeType: 'audio/webm',
      ondataavailable: null,
      onstop: null,
      start: jest.fn(() => {
        mockRecorderInstance.state = 'recording';
        mockRecorderInstance.ondataavailable?.({
          data: new Blob(['audio-chunk-header'], { type: 'audio/webm' }),
        });
      }),
      pause: jest.fn(() => {
        mockRecorderInstance.state = 'paused';
      }),
      resume: jest.fn(() => {
        mockRecorderInstance.state = 'recording';
      }),
      requestData: jest.fn(() => {
        mockRecorderInstance.ondataavailable?.({
          data: new Blob(['audio-chunk-tail'], { type: 'audio/webm' }),
        });
      }),
      stop: jest.fn(() => {
        mockRecorderInstance.state = 'inactive';
        mockRecorderInstance.onstop?.();
      }),
    };

    const MockMediaRecorder: any = jest.fn(() => mockRecorderInstance);
    MockMediaRecorder.isTypeSupported = jest.fn(() => true);
    (window as any).MediaRecorder = MockMediaRecorder;

    mockAnalyser = {
      fftSize: 128,
      smoothingTimeConstant: 0.72,
      frequencyBinCount: 64,
      getByteFrequencyData: jest.fn((arr: Uint8Array) => {
        arr.fill(140);
      }),
      disconnect: jest.fn(),
    };

    (window as any).AudioContext = jest.fn(() => ({
      state: 'running',
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      createMediaStreamSource: jest.fn(() => ({ connect: jest.fn(), disconnect: jest.fn() })),
      createAnalyser: jest.fn(() => mockAnalyser),
    }));

    (URL as any).createObjectURL = jest.fn(() => 'blob:mock-voice-preview');
    (URL as any).revokeObjectURL = jest.fn();
  });

  const renderChat = () =>
    render(
      <MemoryRouter>
        <AntApp>
          <TeamChat />
        </AntApp>
      </MemoryRouter>,
    );

  it('opens the calm emerald Voice Studio bar, supports pause/preview/resume, and sends voice note', async () => {
    const { container } = renderChat();

    const recordBtn = await screen.findByRole('button', { name: 'Record voice note' });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.getByText('Recording')).toBeInTheDocument();
    });

    const studioBar = container.querySelector('.erp-voice-studio-bar');
    expect(studioBar).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Discard voice note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause voice recording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Voice Note' })).toBeInTheDocument();

    // Pause recording -> reveals inline Preview & Resume controls
    fireEvent.click(screen.getByRole('button', { name: 'Pause voice recording' }));
    expect(mockRecorderInstance.pause).toHaveBeenCalled();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume voice recording' })).toBeInTheDocument();

    // Preview URL builds asynchronously after 90ms requestData flush
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Preview voice note' })).not.toBeDisabled();
    });
    expect(container.querySelector('audio[src="blob:mock-voice-preview"]')).not.toBeNull();

    // Play inline preview before sending
    fireEvent.click(screen.getByRole('button', { name: 'Preview voice note' }));
    await waitFor(() => {
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    });

    // Resume recording
    fireEvent.click(screen.getByRole('button', { name: 'Resume voice recording' }));
    expect(mockRecorderInstance.resume).toHaveBeenCalled();
    expect(screen.getByText('Recording')).toBeInTheDocument();

    // Send voice note
    fireEvent.click(screen.getByRole('button', { name: 'Send Voice Note' }));
    expect(mockRecorderInstance.stop).toHaveBeenCalled();
    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/team-chat/conversations/conv-general/messages',
        expect.objectContaining({
          messageType: 'VOICE',
        }),
      );
    });
  });

  it('discards cleanly when Cancel / Delete is clicked', async () => {
    const { container } = renderChat();

    const recordBtn = await screen.findByRole('button', { name: 'Record voice note' });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(container.querySelector('.erp-voice-studio-bar')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Discard voice note' }));
    expect(mockRecorderInstance.stop).toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(container.querySelector('.erp-voice-studio-bar')).toBeNull();
  });
});
