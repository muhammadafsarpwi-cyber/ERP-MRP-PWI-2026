import { useEffect, useState } from 'react';

export const WHATSAPP_SETTINGS_STORAGE_KEY = 'erp_whatsapp_settings_v1';
export const WHATSAPP_SETTINGS_UPDATED_EVENT = 'pwi:whatsapp-settings-updated';

export interface StoredWhatsAppSettings {
  countryCode?: string;
  templates?: Record<string, string | undefined>;
}

/** Reads WhatsApp Settings saved by Settings -> WhatsApp Messages (`erp_whatsapp_settings_v1`). */
export function readWhatsAppSettings(): StoredWhatsAppSettings {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(WHATSAPP_SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed as StoredWhatsAppSettings;
        }
      }
    }
  } catch {
    // Ignore storage read/parse errors and fall back to defaults
  }
  return {};
}

/** Dispatches a live event so open WhatsApp modals refresh immediately without reloading the page. */
export function dispatchWhatsAppSettingsUpdated(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(WHATSAPP_SETTINGS_UPDATED_EVENT));
  } catch {
    // Ignore if CustomEvent unavailable
  }
}

/** Resolves a saved non-empty WhatsApp template from Settings -> WhatsApp Messages, else defaultTemplate. */
export function resolveWhatsAppTemplate(templateKey: string, defaultTemplate: string): string {
  const settings = readWhatsAppSettings();
  const saved = settings.templates?.[templateKey];
  if (typeof saved === 'string' && saved.trim().length > 0) {
    return saved.trim();
  }
  return defaultTemplate;
}

/** Safely replaces `{token}` placeholders without regex/replacement-$ quirks. */
export function renderWhatsAppTemplate(
  template: string,
  replacements: Record<string, string>,
  caseInsensitive = false,
): string {
  let out = template;
  for (const [token, value] of Object.entries(replacements)) {
    if (!caseInsensitive) {
      out = out.split(token).join(value);
    } else {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'gi'), () => value);
    }
  }
  return out;
}

/** Returns the configured country code digits from Settings -> WhatsApp Messages (default: '92'). */
export function getWhatsAppCountryCode(fallback = '92'): string {
  const settings = readWhatsAppSettings();
  const digits = String(settings.countryCode || fallback).replace(/\D/g, '');
  return digits || fallback;
}

/** Applies the saved Settings country code to local `03xx...` phone numbers. */
export function formatWhatsAppPhoneWithCountryCode(phone?: string): string {
  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  if (!cleanPhone) return '';
  if (cleanPhone.startsWith('0')) {
    return `${getWhatsAppCountryCode()}${cleanPhone.slice(1)}`;
  }
  return cleanPhone;
}

/** React hook that increments whenever Settings -> WhatsApp Messages saves changes (same tab or cross-tab). */
export function useWhatsAppSettingsVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === WHATSAPP_SETTINGS_STORAGE_KEY) bump();
    };
    window.addEventListener(WHATSAPP_SETTINGS_UPDATED_EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WHATSAPP_SETTINGS_UPDATED_EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return version;
}
