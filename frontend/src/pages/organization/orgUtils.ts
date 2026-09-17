import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

export const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '-';
};

export interface OrgAuditFields {
  createdAt: string;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

export const renderCreatedBy = (record: OrgAuditFields): string =>
  record.createdByName || (record.createdBy ? 'Admin' : '-');

export const renderUpdatedBy = (record: OrgAuditFields): string =>
  record.updatedByName || (record.updatedBy ? 'Admin' : '-');

export interface AuditColumnRecord extends OrgAuditFields {
  [key: string]: any;
}

export const getAuditColumns = <T extends AuditColumnRecord>(): ColumnsType<T> => [
  {
    title: 'Created By',
    key: 'createdByName',
    width: 140,
    render: (_, record) => renderCreatedBy(record),
  },
  {
    title: 'Created Date',
    key: 'createdAt',
    width: 150,
    render: (_, record) => formatDateTime(record.createdAt),
  },
  {
    title: 'Updated By',
    key: 'updatedByName',
    width: 140,
    render: (_, record) => renderUpdatedBy(record),
  },
  {
    title: 'Updated Date',
    key: 'updatedAt',
    width: 150,
    render: (_, record) => formatDateTime(record.updatedAt),
  },
];