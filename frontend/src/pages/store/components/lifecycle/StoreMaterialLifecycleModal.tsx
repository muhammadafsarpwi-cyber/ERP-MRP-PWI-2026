import React, { useEffect, useState } from 'react';
import { Button, Modal, Tag, Typography, theme } from 'antd';
import { CloseOutlined, TagsOutlined } from '@ant-design/icons';
import { StoreMaterialLifecycleView } from '../../StoreItemLifecycle';
import type { MaterialLifecycle } from '../../../../services/storeMaterialTrace';

const { Text } = Typography;

export interface StoreMaterialLifecycleModalProps {
  open: boolean;
  itemId?: string;
  initialItemCode?: string;
  initialItemName?: string;
  initialStoreId?: string;
  onClose: () => void;
}

export const StoreMaterialLifecycleModal: React.FC<StoreMaterialLifecycleModalProps> = ({
  open,
  itemId,
  initialItemCode,
  initialItemName,
  initialStoreId,
  onClose,
}) => {
  const { token } = theme.useToken();
  const [storeId, setStoreId] = useState<string | undefined>(initialStoreId);
  const [loadedItem, setLoadedItem] = useState<MaterialLifecycle['item'] | null>(null);

  useEffect(() => {
    setStoreId(initialStoreId);
  }, [initialStoreId, itemId, open]);

  useEffect(() => {
    if (!open) {
      setLoadedItem(null);
    }
  }, [open, itemId]);

  const displayCode = loadedItem?.item_code || initialItemCode;
  const displayName = loadedItem?.name || initialItemName;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={1100}
      closable={false}
      destroyOnHidden
      styles={{
        content: {
          padding: 7,
          borderRadius: 20,
          background: token.colorFillSecondary,
          border: `1px solid ${token.colorBorder}`,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
          backdropFilter: 'blur(12px)',
        },
        body: {
          padding: 0,
        },
      }}
    >
      <div
        style={{
          borderRadius: 14,
          background: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'hidden',
        }}
      >
        {/* Executive Gradient Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 20px',
            background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgElevated} 100%)`,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${token.colorPrimary} 0%, #0891b2 100%)`,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(8, 145, 178, 0.25)',
              }}
            >
              <TagsOutlined />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text strong style={{ fontSize: 16, color: token.colorText }}>
                  Store Material Lifecycle
                </Text>
                {displayCode && (
                  <Tag color="cyan" style={{ margin: 0, fontWeight: 700 }}>
                    {displayCode}
                  </Tag>
                )}
              </div>
              <Text
                type="secondary"
                ellipsis
                style={{ fontSize: 12.5, display: 'block', marginTop: 2 }}
              >
                {displayName
                  ? `${displayCode ? `${displayCode} — ` : ''}${displayName}`
                  : 'Complete item traceability, stock ledger & procurement ETA'}
              </Text>
            </div>
          </div>

          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            aria-label="Close Store Material Lifecycle"
            style={{
              borderRadius: 10,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: token.colorTextSecondary,
              flexShrink: 0,
            }}
          />
        </div>

        {/* Scrollable Lifecycle Content */}
        <div
          style={{
            padding: '16px 20px 20px',
            maxHeight: '78vh',
            overflowY: 'auto',
          }}
        >
          {itemId && (
            <StoreMaterialLifecycleView
              itemId={itemId}
              storeId={storeId}
              onStoreChange={setStoreId}
              isModal
              onItemLoaded={setLoadedItem}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default StoreMaterialLifecycleModal;
