import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button, Checkbox, Popover, Space, Tag, Typography, Divider, theme } from 'antd';
import { SettingOutlined, EyeOutlined, UndoOutlined } from '@ant-design/icons';
import type { ColumnsType, ColumnType } from 'antd/es/table';

const { Text } = Typography;

export interface ColumnToggleMeta {
  key: string;
  label: string;
  locked: boolean;
}

function extractReactText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractReactText).filter(Boolean).join(' ');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractReactText(node.props?.children);
  }
  return '';
}

export function resolveColumnKey<T>(col: ColumnType<T>, index: number): string {
  if (col.key !== undefined && col.key !== null && String(col.key).trim() !== '') {
    return String(col.key);
  }
  if (Array.isArray(col.dataIndex)) return col.dataIndex.join('.');
  if (col.dataIndex !== undefined && col.dataIndex !== null && String(col.dataIndex).trim() !== '') {
    return String(col.dataIndex);
  }
  return `col_${index}`;
}

export function resolveColumnLabel<T>(col: ColumnType<T>, fallbackKey: string): string {
  const raw = typeof col.title === 'function' ? '' : extractReactText(col.title).trim();
  if (raw) return raw.replace(/\s+/g, ' ');
  return fallbackKey
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export interface TableColumnSelectorProps {
  columnsMeta: ColumnToggleMeta[];
  hiddenKeys: string[];
  onToggleKey: (key: string, visible: boolean) => void;
  onShowAll: () => void;
  onReset: () => void;
  buttonText?: string;
  size?: 'small' | 'middle' | 'large';
}

export const TableColumnSelector: React.FC<TableColumnSelectorProps> = ({
  columnsMeta,
  hiddenKeys,
  onToggleKey,
  onShowAll,
  onReset,
  buttonText = 'Columns',
  size = 'middle',
}) => {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);

  const totalCount = columnsMeta.length;
  const visibleCount = columnsMeta.filter((c) => c.locked || !hiddenKeys.includes(c.key)).length;

  const content = (
    <div style={{ width: 250 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Text strong style={{ fontSize: 13 }}>
          <EyeOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
          Show / Hide Columns
        </Text>
        <Tag style={{ margin: 0 }}>
          {visibleCount}/{totalCount}
        </Tag>
      </div>

      <Divider style={{ margin: '6px 0 8px' }} />

      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {columnsMeta.map((col) => {
          const checked = col.locked || !hiddenKeys.includes(col.key);
          return (
            <label
              key={col.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '3px 4px',
                borderRadius: token.borderRadiusSM,
                cursor: col.locked ? 'not-allowed' : 'pointer',
                opacity: col.locked ? 0.65 : 1,
              }}
            >
              <Checkbox
                checked={checked}
                disabled={col.locked}
                onChange={(e) => onToggleKey(col.key, e.target.checked)}
              >
                <Text style={{ fontSize: 13 }}>{col.label}</Text>
              </Checkbox>
              {col.locked && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Required
                </Text>
              )}
            </label>
          );
        })}
      </div>

      <Divider style={{ margin: '8px 0 6px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Button size="small" type="link" onClick={onShowAll} style={{ padding: 0 }}>
          Show All
        </Button>
        <Button size="small" icon={<UndoOutlined />} onClick={onReset}>
          Reset Default
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
    >
      <Button size={size} icon={<SettingOutlined />} title="Customize visible table columns">
        <Space size={6}>
          <span>{buttonText}</span>
          <Tag
            color={visibleCount < totalCount ? 'blue' : undefined}
            style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 6px' }}
          >
            {visibleCount}/{totalCount}
          </Tag>
        </Space>
      </Button>
    </Popover>
  );
};

export interface UseColumnVisibilityOptions {
  defaultHiddenKeys?: string[];
  lockedKeys?: string[];
}

export function useColumnVisibility<T = any>(
  storageKey: string,
  allColumns: ColumnsType<T>,
  options?: UseColumnVisibilityOptions,
) {
  const defaultHidden = useMemo(
    () => options?.defaultHiddenKeys || [],
    [options?.defaultHiddenKeys],
  );
  const lockedSet = useMemo(() => {
    const base = new Set<string>(['actions', 'action']);
    (options?.lockedKeys || []).forEach((k) => base.add(k));
    return base;
  }, [options?.lockedKeys]);

  const readStored = useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaultHidden;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : defaultHidden;
    } catch {
      return defaultHidden;
    }
  }, [storageKey, defaultHidden]);

  const [hiddenKeys, setHiddenKeys] = useState<string[]>(readStored);

  useEffect(() => {
    setHiddenKeys(readStored());
  }, [readStored]);

  const persist = useCallback(
    (next: string[]) => {
      setHiddenKeys(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore storage quota failure
      }
    },
    [storageKey],
  );

  const columnsMeta = useMemo<ColumnToggleMeta[]>(() => {
    return (allColumns || []).map((col, idx) => {
      const leaf = col as ColumnType<T>;
      const key = resolveColumnKey(leaf, idx);
      const label = resolveColumnLabel(leaf, key);
      const locked = lockedSet.has(key) || key.toLowerCase() === 'actions';
      return { key, label, locked };
    });
  }, [allColumns, lockedSet]);

  const visibleColumns = useMemo<ColumnsType<T>>(() => {
    return (allColumns || []).filter((col, idx) => {
      const key = resolveColumnKey(col as ColumnType<T>, idx);
      if (lockedSet.has(key) || key.toLowerCase() === 'actions') return true;
      return !hiddenKeys.includes(key);
    });
  }, [allColumns, hiddenKeys, lockedSet]);

  const handleToggleKey = useCallback(
    (key: string, visible: boolean) => {
      if (lockedSet.has(key)) return;
      if (visible) {
        persist(hiddenKeys.filter((k) => k !== key));
      } else {
        persist(Array.from(new Set([...hiddenKeys, key])));
      }
    },
    [hiddenKeys, lockedSet, persist],
  );

  const handleShowAll = useCallback(() => persist([]), [persist]);
  const handleReset = useCallback(() => persist(defaultHidden), [defaultHidden, persist]);

  const selectorProps: TableColumnSelectorProps = {
    columnsMeta,
    hiddenKeys,
    onToggleKey: handleToggleKey,
    onShowAll: handleShowAll,
    onReset: handleReset,
  };

  return {
    visibleColumns,
    hiddenKeys,
    columnsMeta,
    selectorProps,
  };
}

export default TableColumnSelector;
