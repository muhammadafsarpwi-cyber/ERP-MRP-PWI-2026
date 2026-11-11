const fs = require('fs');
const path = 'frontend/src/pages/production/packing/HandPackingEntry.tsx';
let code = fs.readFileSync(path, 'utf8');

const targetStart = '  const renderAddNippleModal = () => {';
const targetEnd = '  // Open and load full audited historical transactions for the View Modal';

const newModalCode = `  const renderAddNippleModal = () => {
    if (!addNippleTargetBatch) return null;

    const totalBatchCartons = addNippleTargetBatch.cartons || 1;
    const totalBatchGross = addNippleTargetBatch.pendingNippleGross || (totalBatchCartons * 10);
    const totalBatchPcs = addNippleTargetBatch.pendingNipplePcs || (totalBatchCartons * 1440);
    const grossPerCarton = totalBatchCartons > 0 ? (totalBatchGross / totalBatchCartons) : 10;
    const pcsPerCarton = totalBatchCartons > 0 ? (totalBatchPcs / totalBatchCartons) : 1440;

    const currentCartons = addNippleCartons > 0 ? Math.min(addNippleCartons, totalBatchCartons) : totalBatchCartons;
    const activeReqGross = Math.round((grossPerCarton * currentCartons) * 100) / 100;
    const activeReqPcs = Math.round(pcsPerCarton * currentCartons);
    const isPartialBatch = currentCartons < totalBatchCartons;
    const remainingCartons = Math.max(0, totalBatchCartons - currentCartons);
    const remainingPendingGross = Math.round((totalBatchGross - activeReqGross) * 100) / 100;
    const remainingPendingPcs = Math.max(0, totalBatchPcs - activeReqPcs);

    const isSufficient = nippleStockInfo ? (nippleStockInfo.availablePcs >= activeReqPcs) : false;

    return (
      <Modal
        open={addNippleModalVisible}
        zIndex={1600}
        onCancel={() => !addNippleSubmitting && setAddNippleModalVisible(false)}
        width={620}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#ecfdf5', color: '#059669', padding: '6px 10px', borderRadius: 8, fontSize: 18 }}>
              <PlusCircleOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--theme-heading, var(--theme-text, #0f172a))' }}>
                Complete Batch: Add Nipple to {addNippleTargetBatch.batchNo}
              </div>
              <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>
                {isPartialBatch ? 'Partial completion: Convert selected cartons to full pack and leave remaining in Safety Stock' : 'Convert full batch into a completed pack and deduct nipple inventory from store'}
              </div>
            </div>
          </div>
        }
        footer={[
          <Button key="cancel" onClick={() => setAddNippleModalVisible(false)} disabled={addNippleSubmitting}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={addNippleSubmitting}
            onClick={handleAddNippleSubmit}
            style={{ background: '#059669', borderColor: '#059669', fontWeight: 800, padding: '0 20px' }}
          >
            {isPartialBatch ? \`Confirm & Complete \${currentCartons} Cartons\` : 'Confirm & Complete Full Batch'}
          </Button>,
        ]}
      >
        <div style={{ padding: '8px 0' }}>
          <Alert
            type="info"
            showIcon
            message={<strong>Batch Details: {addNippleTargetBatch.batchNo} ({addNippleTargetBatch.customerName})</strong>}
            description={
              <div style={{ fontSize: 12, color: '#334155' }}>
                Currently packed as <strong>Spokes Only</strong> in White Poly Bag for Safety Stock. Select how many cartons you want to complete with nipples.
              </div>
            }
            style={{ marginBottom: 14, borderRadius: 8 }}
          />

          <Row gutter={[12, 14]}>
            <Col span={24}>
              <div style={{ background: 'var(--theme-surface-alt, #0f172a)', border: '1px solid var(--theme-border, #334155)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Finished Good Item:</span>
                  <strong style={{ color: 'var(--theme-heading, #ffffff)', fontSize: 13 }}>{addNippleTargetBatch.fgItemCode} — {addNippleTargetBatch.fgItemName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Total in Safety Stock:</span>
                  <Tag color="blue" style={{ fontWeight: 800, fontSize: 12 }}>{totalBatchCartons} Cartons ({addNippleTargetBatch.gross} Gross)</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)' }}>Pending Nipple Requirement:</span>
                  <Tag color="orange" style={{ fontWeight: 800, fontSize: 12 }}>
                    {addNippleTargetBatch.pendingNippleCode || 'Nipple'} — {totalBatchGross} GRS ({formatNumber(totalBatchPcs, 0)} PCS)
                  </Tag>
                </div>
              </div>
            </Col>

            {/* Interactive Carton Selector */}
            <Col span={24}>
              <div style={{
                background: isPartialBatch ? 'rgba(2, 132, 199, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                border: \`1.5px solid \${isPartialBatch ? '#0284c7' : '#10b981'}\`,
                borderRadius: 8,
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-heading, #ffffff)' }}>
                      ?? Cartons to Complete with Nipple:
                    </span>
                    <div style={{ fontSize: 11.5, color: 'var(--theme-text-muted, #94a3b8)' }}>
                      Total available in safety stock batch: <strong>{totalBatchCartons} Cartons</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InputNumber
                      min={1}
                      max={totalBatchCartons}
                      step={1}
                      precision={0}
                      value={currentCartons}
                      onChange={(val) => setAddNippleCartons(val || 1)}
                      style={{ width: 110, fontWeight: 800, fontSize: 16 }}
                    />
                    <Button
                      size="small"
                      onClick={() => setAddNippleCartons(totalBatchCartons)}
                      disabled={currentCartons === totalBatchCartons}
                    >
                      All ({totalBatchCartons} CTN)
                    </Button>
                  </div>
                </div>

                {isPartialBatch ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(255,255,255,0.06)', padding: '6px 10px', borderRadius: 6, fontSize: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: '#0284c7', fontWeight: 800 }}>? Partial Completion:</span>
                    <span style={{ color: 'var(--theme-text, #ffffff)' }}>
                      <strong>{currentCartons} Cartons</strong> will be completed with nipples.
                    </span>
                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                      <strong>{remainingCartons} Cartons</strong> ({remainingPendingGross} GRS) will stay in Safety Stock.
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#10b981', fontWeight: 700 }}>
                    ? Full Batch: Completing all {totalBatchCartons} Cartons with nipples.
                  </div>
                )}
              </div>
            </Col>

            <Col xs={24} sm={12}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 4, display: 'block' }}>
                ?? Completion Date:
              </span>
              <DatePicker
                style={{ width: '100%', fontWeight: 700 }}
                value={addNippleDate}
                onChange={(d) => d && setAddNippleDate(d)}
                format="YYYY-MM-DD"
              />
            </Col>

            <Col xs={24} sm={12}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 4, display: 'block' }}>
                ?? Nipple Warehouse:
              </span>
              <Select
                style={{ width: '100%', fontWeight: 700 }}
                value={addNippleWarehouseId}
                onChange={(w) => {
                  setAddNippleWarehouseId(w);
                  if (addNippleTargetBatch) loadNippleStock(addNippleTargetBatch);
                }}
                options={warehouses.map((w) => ({
                  value: w.id,
                  label: w.warehouseCode === 'WH-002' ? \`?? \${w.warehouseCode} — \${w.name} (Dedicated Nipple Store)\` : \`\${w.warehouseCode} — \${w.name}\`,
                }))}
              />
            </Col>

            {/* Live Nipple Store Balance in WH-002 */}
            <Col span={24}>
              <div
                style={{
                  background: isSufficient ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  border: \`1px solid \${isSufficient ? '#10b981' : '#f59e0b'}\`,
                  borderRadius: 8,
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--theme-heading, #ffffff)' }}>
                    ?? Live Nipple Store Balance (WH-002):
                  </span>
                  {nippleStockInfo?.loading ? (
                    <Spin size="small" />
                  ) : nippleStockInfo ? (
                    <Tag color={isSufficient ? 'success' : 'warning'} style={{ fontWeight: 800 }}>
                      {isSufficient ? '? In Stock — Ready to Deduct' : '?? Insufficient Store Stock'}
                    </Tag>
                  ) : (
                    <Tag color="default">Loading stock...</Tag>
                  )}
                </div>

                {nippleStockInfo && !nippleStockInfo.loading && (
                  <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>Available in SPI Nipple Packing Warehouse:</span>
                      <strong style={{ color: '#0284c7' }}>
                        {formatNumber(nippleStockInfo.availableGross, 2)} GRS ({formatNumber(nippleStockInfo.availablePcs, 0)} PCS · {formatNumber(nippleStockInfo.availableCartons, 1)} CTN)
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>Required for {currentCartons} Cartons:</span>
                      <strong style={{ color: '#d97706' }}>
                        {activeReqGross} GRS ({formatNumber(activeReqPcs, 0)} PCS)
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--theme-border, #334155)', paddingTop: 4 }}>
                      <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>Remaining Store Balance After Deduction:</span>
                      <strong style={{ color: isSufficient ? '#10b981' : '#ef4444' }}>
                        {formatNumber(Math.max(0, nippleStockInfo.availableGross - activeReqGross), 2)} GRS ({formatNumber(Math.max(0, nippleStockInfo.availablePcs - activeReqPcs), 0)} PCS)
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </div>
      </Modal>
    );
  };
`;

const sIdx = code.indexOf(targetStart);
const eIdx = code.indexOf(targetEnd);
if (sIdx !== -1 && eIdx !== -1) {
  code = code.substring(0, sIdx) + newModalCode + '\n\n  ' + code.substring(eIdx);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully patched renderAddNippleModal');
} else {
  console.log('Marker not found', sIdx, eIdx);
}
