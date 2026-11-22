import { apiService } from './api';

export interface ChannelSummary {
  configured: boolean;
  provider: string;
  status: string;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  lastDeliveryAt: string | null;
}

export interface CommunicationSummaryData {
  unreadCount?: number;
  email: ChannelSummary;
  whatsapp: ChannelSummary;
}

interface SummaryApiResponse {
  success: boolean;
  data: CommunicationSummaryData;
}

const CACHE_TTL_MS = 45_000;

let cachedSummary: CommunicationSummaryData | null = null;
let cachedAt = 0;
let inFlightPromise: Promise<CommunicationSummaryData | null> | null = null;

/**
 * Fetches `/communication/settings/summary` with ETag revalidation (`304 Not Modified`),
 * shared short-lived memory cache, and in-flight coalescing so multiple header icons
 * (`EmailCommunicationIcon` & `WhatsAppCommunicationIcon`) share a single network call.
 */
export async function fetchCommunicationSummary(force = false): Promise<CommunicationSummaryData | null> {
  const now = Date.now();
  if (!force && cachedSummary && now - cachedAt < CACHE_TTL_MS) {
    return cachedSummary;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    try {
      const res = await apiService.get<SummaryApiResponse>(
        '/communication/settings/summary',
        undefined,
        { silent: true, useEtag: true },
      );
      if (res?.data) {
        cachedSummary = res.data;
        cachedAt = Date.now();
        return cachedSummary;
      }
      return cachedSummary;
    } catch {
      return cachedSummary;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

export function invalidateCommunicationSummaryCache(): void {
  cachedAt = 0;
}
