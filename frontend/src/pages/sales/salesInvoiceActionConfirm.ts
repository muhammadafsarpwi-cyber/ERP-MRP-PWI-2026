export type InvoiceActionKey =
  | 'view'
  | 'print'
  | 'post'
  | 'payment'
  | 'email'
  | 'whatsapp'
  | 'edit'
  | 'cancel'
  | 'delete';

export interface InvoiceActionMeta {
  actionKey: InvoiceActionKey;
  title: string;
  badgeLabel: string;
  badgeColor: string;
  description: string;
  isDanger: boolean;
  showZeroTaxWarning: boolean;
}

export function getInvoiceActionMeta(
  actionKey: InvoiceActionKey,
  record: {
    invoiceNo?: string;
    taxAmount?: number | string | null;
    subtotal?: number | string | null;
    totalAmount?: number | string | null;
  },
): InvoiceActionMeta {
  const invoiceNo = record?.invoiceNo || 'Selected Invoice';
  const taxValue = Number(record?.taxAmount || 0);

  switch (actionKey) {
    case 'view':
      return {
        actionKey,
        title: 'Confirm View & Inspect Invoice',
        badgeLabel: 'INSPECT INVOICE',
        badgeColor: 'blue',
        description: `Open detailed financial breakdown and line-item verification for ${invoiceNo}.`,
        isDanger: false,
        showZeroTaxWarning: false,
      };
    case 'print':
      return {
        actionKey,
        title: 'Confirm Print Tax Invoice',
        badgeLabel: 'PRINT TAX INVOICE',
        badgeColor: 'cyan',
        description: `Prepare and open the printable Tax Invoice document for ${invoiceNo}.`,
        isDanger: false,
        showZeroTaxWarning: false,
      };
    case 'post':
      return {
        actionKey,
        title: 'Confirm Approve & Post Invoice',
        badgeLabel: 'APPROVE & POST TO LEDGER',
        badgeColor: 'green',
        description: `Posting ${invoiceNo} will finalize the invoice, debit the customer receivable ledger, and record the General Ledger revenue journal.`,
        isDanger: false,
        showZeroTaxWarning: taxValue === 0,
      };
    case 'payment':
      return {
        actionKey,
        title: 'Confirm Record Payment',
        badgeLabel: 'RECORD PAYMENT RECEIPT',
        badgeColor: 'geekblue',
        description: `Open the payment receipt dialog to collect funds and settle ${invoiceNo}.`,
        isDanger: false,
        showZeroTaxWarning: false,
      };
    case 'email':
      return {
        actionKey,
        title: 'Confirm Send Email',
        badgeLabel: 'SEND CUSTOMER EMAIL',
        badgeColor: 'purple',
        description: `Launch your email composer pre-filled with invoice summary details for ${invoiceNo}.`,
        isDanger: false,
        showZeroTaxWarning: false,
      };
    case 'whatsapp':
      return {
        actionKey,
        title: 'Confirm Send WhatsApp',
        badgeLabel: 'SHARE VIA WHATSAPP',
        badgeColor: 'green',
        description: `Open WhatsApp with a pre-formatted payment summary message for ${invoiceNo}.`,
        isDanger: false,
        showZeroTaxWarning: false,
      };
    case 'edit':
      return {
        actionKey,
        title: 'Confirm Edit Invoice',
        badgeLabel: 'EDIT DRAFT INVOICE',
        badgeColor: 'orange',
        description: `Open ${invoiceNo} in the invoice editor to modify line quantities, pricing, tax, or terms.`,
        isDanger: false,
        showZeroTaxWarning: false,
      };
    case 'cancel':
      return {
        actionKey,
        title: 'Confirm Cancel Invoice',
        badgeLabel: 'CANCEL INVOICE',
        badgeColor: 'volcano',
        description: `Cancelling ${invoiceNo} marks the invoice void and prevents further posting or payment collection.`,
        isDanger: true,
        showZeroTaxWarning: false,
      };
    case 'delete':
      return {
        actionKey,
        title: 'Confirm Delete Invoice',
        badgeLabel: 'PERMANENT DELETE',
        badgeColor: 'red',
        description: `Deleting ${invoiceNo} permanently removes this unposted invoice record from the database.`,
        isDanger: true,
        showZeroTaxWarning: false,
      };
  }
}
