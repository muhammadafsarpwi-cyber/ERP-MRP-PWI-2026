/**
 * Backwards-compatible re-export barrel over the unified 0ms
 * `whatsappTemplateRenderer.ts` engine so all existing imports continue working.
 */
export {
  WHATSAPP_SETTINGS_STORAGE_KEY,
  WHATSAPP_SETTINGS_UPDATED_EVENT,
  DEFAULT_COMPANY_NAME,
  WHATSAPP_TEMPLATE_REGISTRY,
  getWhatsAppTemplateDefinition,
  buildDefaultWhatsAppTemplatesMap,
  invalidateWhatsAppSettingsCache,
  readWhatsAppSettings,
  saveWhatsAppSettings,
  dispatchWhatsAppSettingsUpdated,
  resolveWhatsAppTemplate,
  renderWhatsAppTemplate,
  renderWhatsAppRepeatingLines,
  getWhatsAppCountryCode,
  formatWhatsAppPhoneWithCountryCode,
  buildWhatsAppShareUrl,
  openWhatsAppWithTemplate,
  useWhatsAppSettingsVersion,
} from './whatsappTemplateRenderer';

export type {
  WhatsAppTemplateCategory,
  WhatsAppTemplateKey,
  WhatsAppTemplateDefinition,
  StoredWhatsAppSettings,
} from './whatsappTemplateRenderer';
