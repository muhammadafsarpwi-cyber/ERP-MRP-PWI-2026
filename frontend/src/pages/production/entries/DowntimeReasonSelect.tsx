import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Select, Input, Button, message } from 'antd';
import type { InputRef } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import apiService from '../../../services/api';
import { addCachedDowntimeReason } from '../../../services/lookupsCache';

export interface DowntimeReasonOption {
  value: string;
  label: string;
  code?: string;
}

export interface DowntimeReasonSelectProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: DowntimeReasonOption[];
  onReasonCreated?: (newReason: { id: string; name: string; code?: string }) => void;
  placeholder?: string;
  size?: 'small' | 'middle' | 'large';
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  popupClassName?: string;
}

const STORAGE_KEY_CUSTOM_REASONS = 'erp_custom_downtime_reasons_v1';

function getStoredCustomReasons(): DowntimeReasonOption[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_REASONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function persistCustomReason(item: DowntimeReasonOption): void {
  try {
    const list = getStoredCustomReasons();
    if (!list.some((r) => r.value === item.value || r.label.trim().toLowerCase() === item.label.trim().toLowerCase())) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_REASONS, JSON.stringify([...list, item]));
    }
  } catch {}
}

export const DowntimeReasonSelect: React.FC<DowntimeReasonSelectProps> = ({
  id,
  value,
  onChange,
  options,
  onReasonCreated,
  placeholder = 'Downtime reason',
  size = 'small',
  className,
  style,
  disabled = false,
  popupClassName = 'production-select-popup',
}) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newReasonText, setNewReasonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [localReasons, setLocalReasons] = useState<DowntimeReasonOption[]>(() => getStoredCustomReasons());
  const inputRef = useRef<InputRef>(null);

  // Merge parent options with locally created/stored reasons to guarantee immediate and persistent appearance
  const mergedOptions = useMemo(() => {
    const map = new Map<string, DowntimeReasonOption>();
    (options || []).forEach((opt) => {
      if (opt && opt.value) map.set(opt.value, opt);
    });
    localReasons.forEach((opt) => {
      if (opt && opt.value && !map.has(opt.value)) {
        map.set(opt.value, opt);
      }
    });
    return Array.from(map.values());
  }, [options, localReasons]);

  // Focus input automatically when "+ Add Custom Reason" is opened
  useEffect(() => {
    if (isAdding) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isAdding]);

  const handleStartAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsAdding(true);
    if (searchValue.trim()) {
      setNewReasonText(searchValue.trim());
      setSearchValue(''); // Clear search so options list does not show "No data"
    }
  };

  const handleCancel = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsAdding(false);
    setNewReasonText('');
    setSearchValue('');
  };

  const handleSave = async (e?: React.MouseEvent | React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = newReasonText.trim();
    if (!trimmed) {
      message.warning('Please enter a downtime reason description');
      return;
    }

    setSaving(true);
    try {
      const response = await apiService.post<any>(
        '/production/downtime-reasons',
        { name: trimmed },
      );

      const created = response?.data || response;
      if (created && (created.id || created.name)) {
        const newOption: DowntimeReasonOption = {
          value: created.id,
          label: created.name || trimmed,
          code: created.code,
        };

        // 1. Immediately store in local component state & persistent browser storage
        setLocalReasons((prev) => {
          if (prev.some((r) => r.value === newOption.value)) return prev;
          return [...prev, newOption];
        });
        persistCustomReason(newOption);

        // 2. Update global lookups cache for Supabase sync
        addCachedDowntimeReason(created);

        // 3. Immediately select the newly created downtime reason in the form field
        onChange?.(newOption.value);

        // 4. Notify parent listener if provided
        onReasonCreated?.(created);

        message.success(`Downtime reason "${newOption.label}" saved successfully`);

        // 5. Reset state and close dropdown
        setIsAdding(false);
        setNewReasonText('');
        setSearchValue('');
        setOpen(false);
      } else {
        throw new Error('Invalid response received from server');
      }
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save new downtime reason to database';
      message.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select
      id={id}
      value={value}
      onChange={onChange}
      open={open}
      onDropdownVisibleChange={(visible) => {
        // If the user is actively adding a custom reason, prevent premature closing on clicks inside
        if (!visible && isAdding) {
          return;
        }
        setOpen(visible);
        if (!visible) {
          setIsAdding(false);
          setNewReasonText('');
          setSearchValue('');
        }
      }}
      searchValue={searchValue}
      onSearch={(txt) => setSearchValue(txt)}
      size={size}
      showSearch
      optionFilterProp="label"
      placeholder={placeholder}
      popupMatchSelectWidth={false}
      popupClassName={popupClassName}
      styles={{ popup: { root: { zIndex: 99999, minWidth: 290 } } }}
      className={className}
      style={{ width: '100%', ...style }}
      disabled={disabled}
      options={mergedOptions}
      dropdownRender={(menu) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {menu}

          {/* Persistent Action Footer */}
          <div
            onMouseDown={(e) => {
              // Crucial: prevent click from bubbling to document and dismissing Select
              e.stopPropagation();
            }}
            style={{
              padding: '6px 8px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(15, 23, 42, 0.98)',
            }}
          >
            {!isAdding ? (
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined style={{ color: '#10b981' }} />}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={handleStartAdd}
                style={{
                  width: '100%',
                  borderColor: '#10b981',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.06)',
                  fontWeight: 600,
                  fontSize: 12,
                  height: 28,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {searchValue.trim()
                  ? `+ Add "${searchValue.trim()}" as Reason`
                  : '+ Add Custom Reason'}
              </Button>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '2px 0',
                }}
              >
                <Input
                  ref={inputRef}
                  size="small"
                  placeholder="Type new downtime reason..."
                  value={newReasonText}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setNewReasonText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleSave(e);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCancel();
                    }
                  }}
                  disabled={saving}
                  style={{
                    background: '#0b0f19',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    fontSize: 12,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}
                >
                  <Button
                    size="small"
                    icon={<CloseOutlined />}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={handleCancel}
                    disabled={saving}
                    style={{
                      background: 'transparent',
                      borderColor: '#475569',
                      color: '#94a3b8',
                      fontSize: 11,
                      height: 24,
                      padding: '0 8px',
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={saving ? <LoadingOutlined /> : <CheckOutlined />}
                    loading={saving}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={handleSave}
                    style={{
                      background: '#10b981',
                      borderColor: '#10b981',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: 11,
                      height: 24,
                      padding: '0 10px',
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    />
  );
};

export default DowntimeReasonSelect;
