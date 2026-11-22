import apiService from './api';
import {
  fetchCommunicationSummary,
  invalidateCommunicationSummaryCache,
} from './communicationSummaryService';
import {
  fetchNippleImportAlerts,
  invalidateNippleAlertsCache,
} from './nippleAlertsService';
import {
  fetchCachedCustomers,
  invalidateLookupsCache,
} from './lookupsCache';

describe('Egress optimization caches & request coalescing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    invalidateCommunicationSummaryCache();
    invalidateNippleAlertsCache();
    invalidateLookupsCache();
  });

  it('coalesces concurrent communication summary requests and reuses cache with ETag enabled', async () => {
    const spy = jest.spyOn(apiService, 'get').mockResolvedValue({
      success: true,
      data: {
        email: { configured: true, provider: 'smtp', status: 'CONFIGURED', queued: 0, sending: 0, sent: 5, failed: 0, lastDeliveryAt: null },
        whatsapp: { configured: false, provider: 'whatsapp', status: 'NOT_CONFIGURED', queued: 0, sending: 0, sent: 0, failed: 0, lastDeliveryAt: null },
      },
    } as any);

    const [a, b] = await Promise.all([fetchCommunicationSummary(), fetchCommunicationSummary()]);
    const c = await fetchCommunicationSummary();

    expect(a?.email.sent).toBe(5);
    expect(b?.email.sent).toBe(5);
    expect(c?.email.sent).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('/communication/settings/summary', undefined, { silent: true, useEtag: true });
  });

  it('coalesces nipple import alert checks and uses ETag revalidation', async () => {
    const spy = jest.spyOn(apiService, 'get').mockResolvedValue({
      success: true,
      data: [{ itemId: 'n1', itemCode: 'RM-NIP-001', reorderAlertStatus: 'COVERED' }],
    } as any);

    const [first, second] = await Promise.all([fetchNippleImportAlerts(), fetchNippleImportAlerts()]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('/sales/analytics/nipple-import-alerts', undefined, { silent: true, useEtag: true });
  });

  it('caches customers globally across callers and tabs via fetchCachedCustomers()', async () => {
    const spy = jest.spyOn(apiService, 'get').mockResolvedValue({
      success: true,
      data: [{ id: 'cust-1', companyName: 'CROWN FIT PAKISTAN', customerCode: 'CUS-CFP-001' }],
    } as any);

    const [c1, c2] = await Promise.all([fetchCachedCustomers(), fetchCachedCustomers()]);
    const c3 = await fetchCachedCustomers();

    expect(c1).toHaveLength(1);
    expect(c2).toHaveLength(1);
    expect(c3).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      '/customer/customers',
      { limit: 500, status: 'ACTIVE' },
      { silent: true, useEtag: true },
    );
  });
});
