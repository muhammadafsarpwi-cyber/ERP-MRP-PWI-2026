import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { message } from 'antd';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaInstallContextType {
  /** True if the browser supports PWA installation and event has been captured */
  isInstallable: boolean;
  /** True if the app is already installed or running in standalone mode */
  isInstalled: boolean;
  /** True if device is iOS (iPhone/iPad) */
  isIos: boolean;
  /** Whether the auto-prompt modal / banner is currently visible */
  showBanner: boolean;
  /** Open the install prompt (triggers native dialog or iOS modal) */
  promptInstall: () => Promise<void>;
  /** Hide the auto-prompt banner for this session */
  dismissBanner: () => void;
  /** Open the detailed install modal (for manual install instructions) */
  openInstallModal: () => void;
  /** Close the detailed install modal */
  closeInstallModal: () => void;
  /** State of detailed install guide modal */
  isInstallModalOpen: boolean;
}

const PwaInstallContext = createContext<PwaInstallContextType | null>(null);

export const PwaInstallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  useEffect(() => {
    // 1. Detect if running as standalone app
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 2. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    if (isIosDevice) {
      // iOS doesn't support beforeinstallprompt, but is installable via Safari share menu
      setIsInstallable(true);
      const dismissed = sessionStorage.getItem('pwi_pwa_dismissed');
      if (!dismissed) {
        const timer = setTimeout(() => setShowBanner(true), 1500);
        return () => clearTimeout(timer);
      }
    }

    // 3. Listen for Chromium/Edge native beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser default mini-infobar
      e.preventDefault();
      const installEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(installEvent);
      setIsInstallable(true);

      const dismissed = sessionStorage.getItem('pwi_pwa_dismissed');
      if (!dismissed) {
        // Show the install prompt option shortly after website opens
        setTimeout(() => setShowBanner(true), 1500);
      }
    };

    // 4. Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setShowBanner(false);
      setIsInstallModalOpen(false);
      setDeferredPrompt(null);
      message.success('Pakistan Wire Industries ERP has been installed on your device!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setShowBanner(false);
          setIsInstallModalOpen(false);
          message.success('Installation started! PWI ERP is being added to your apps.');
        } else {
          setShowBanner(false);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('[PWA] Prompt error:', err);
      }
    } else {
      // If no native prompt (Safari or desktop manual install), show the modal guide
      setIsInstallModalOpen(true);
    }
  }, [deferredPrompt]);

  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    sessionStorage.setItem('pwi_pwa_dismissed', 'true');
  }, []);

  const openInstallModal = useCallback(() => {
    setIsInstallModalOpen(true);
  }, []);

  const closeInstallModal = useCallback(() => {
    setIsInstallModalOpen(false);
  }, []);

  return (
    <PwaInstallContext.Provider
      value={{
        isInstallable,
        isInstalled,
        isIos,
        showBanner,
        promptInstall,
        dismissBanner,
        openInstallModal,
        closeInstallModal,
        isInstallModalOpen,
      }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
};

export const usePwaInstall = (): PwaInstallContextType => {
  const context = useContext(PwaInstallContext);
  if (!context) {
    throw new Error('usePwaInstall must be used within a PwaInstallProvider');
  }
  return context;
};
