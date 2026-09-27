import React, { useState, useEffect } from 'react';
import { Card, Typography, Input, Button, Space, Alert, Result, Tag, Divider, QRCode, Row, Col, Table, theme } from 'antd';
import {
  ScanOutlined,
  SearchOutlined,
  ArrowRightOutlined,
  ToolOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  FileTextOutlined,
  CarOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  BarcodeOutlined,
  PlusCircleOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import BarcodeScanner from '../../components/shared/BarcodeScanner';
import BarcodePrint from '../../components/shared/BarcodePrint';
import ScannedMachineHistoryModal, { MachineLifecycleContent } from './ScannedMachineHistoryModal';
import { apiService } from '../../services/api';
import { productionUnitService } from '../../services/productionUnitService';
import { dispatchPackageService } from '../../services/dispatchPackageService';
import { printProductionUnitLabels } from '../production/units/ProductionUnitLabel';
import { BarcodeRecord, ENTITY_TYPE_LABELS, ENTITY_TYPE_ROUTES, BarcodeEntityType, BarcodeStatus } from './types';
import { printGatePassDocument } from '../../utils/printTemplates';

const { Title, Text } = Typography;

const ScanBarcode: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [result, setResult] = useState<BarcodeRecord | null>(null);
  const [itemRecord, setItemRecord] = useState<any>(null);
  const [gatePassRecord, setGatePassRecord] = useState<any>(null);
  const [productionUnitRecord, setProductionUnitRecord] = useState<any>(null);
  const [dispatchPackageRecord, setDispatchPackageRecord] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    // 1. Check URL parameters (e.g. from scanning a physical QR code with phone camera)
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code') || params.get('gatePass') || params.get('barcode');
    if (codeParam) {
      setSearchValue(codeParam);
      lookupBarcode(codeParam);
      return;
    }

    // 2. Check location state
    const state = location.state as any;
    if (state?.barcode) {
      setSearchValue(state.barcode);
      lookupBarcode(state.barcode);
    } else if (state?.entityId && state?.entityType) {
      const fakeResult: BarcodeRecord = {
        id: '',
        companyId: '',
        barcodeValue: state.barcode || '',
        entityType: state.entityType,
        entityId: state.entityId,
        barcodeLabel: null,
        entityLabel: state.entityLabel,
        entityCode: state.entityCode,
        status: 'ACTIVE' as any,
        isPrimary: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setResult(fakeResult);
    }
  }, [location.state]);

  const lookupBarcode = async (barcodeValue: string) => {
    if (!barcodeValue || !barcodeValue.trim()) return;
    let cleanCode = barcodeValue.trim();

    // 1. If scanned a full URL or URL with query params
    if (cleanCode.includes('://') || cleanCode.includes('?')) {
      try {
        const urlStr = cleanCode.includes('://') ? cleanCode : `http://dummy.com${cleanCode.startsWith('/') ? '' : '/'}${cleanCode}`;
        const parsed = new URL(urlStr);
        const qCode = parsed.searchParams.get('code') || parsed.searchParams.get('gatePass') || parsed.searchParams.get('barcode');
        const qEntityId = parsed.searchParams.get('entityId') || parsed.searchParams.get('id');
        if (qCode) cleanCode = decodeURIComponent(qCode);
        else if (qEntityId) cleanCode = qEntityId;
      } catch {
        const match = cleanCode.match(/[?&](?:code|barcode|gatePass|entityId)=([^&]+)/);
        if (match) cleanCode = decodeURIComponent(match[1]);
      }
    }

    // 2. Check if this is a direct machine route like /production/machines/<uuid> or /machines/<uuid>
    const machineRouteMatch = cleanCode.match(/(?:\/production\/machines\/|\/machines\/)([0-9a-fA-F-]{36})/i);
    if (machineRouteMatch) {
      const machineId = machineRouteMatch[1];
      try {
        setLoading(true);
        setError(null);
        setResult(null);
        setGatePassRecord(null);

        const mRes = await apiService.get<any>(`/production/machines/${machineId}`);
        const mData = mRes?.data || mRes;
        if (mData && (mData.id || mData.machineCode)) {
          setResult({
            id: mData.id,
            companyId: mData.companyId || '',
            barcodeValue: mData.barcode || cleanCode,
            entityType: BarcodeEntityType.MACHINE,
            entityId: mData.id,
            barcodeLabel: 'Machine',
            entityLabel: mData.name || mData.machineName || mData.machineCode,
            entityCode: mData.machineCode || mData.code,
            status: 'ACTIVE' as any,
            isPrimary: true,
            createdAt: mData.createdAt || new Date().toISOString(),
            updatedAt: mData.updatedAt || new Date().toISOString(),
          });
          setMachineModalOpen(true);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to general lookup
      }
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setItemRecord(null);
      setGatePassRecord(null);
      setProductionUnitRecord(null);
      setDispatchPackageRecord(null);

      // Check if this is a Production Unit (Coil / Unit Serial)
      const isProdUnitCode =
        cleanCode.startsWith('PWI-PU-') ||
        cleanCode.startsWith('PU-') ||
        cleanCode.startsWith('CN-');

      if (isProdUnitCode) {
        try {
          const uRes = await productionUnitService.scanLookup(cleanCode);
          const uData = (uRes as any)?.data || uRes;
          if (uData && (uData.id || uData.unitSerialNo)) {
            setProductionUnitRecord(uData);
            setResult({
              id: uData.id,
              companyId: uData.companyId || '',
              barcodeValue: uData.unitSerialNo || cleanCode,
              entityType: BarcodeEntityType.PRODUCTION_UNIT,
              entityId: uData.id,
              barcodeLabel: `Coil ${uData.coilNo}`,
              entityLabel: `Production Unit: ${uData.unitSerialNo} (${uData.coilNo})`,
              entityCode: uData.unitSerialNo,
              status: (uData.status === 'CANCELLED' || uData.status === 'VOID') ? BarcodeStatus.INACTIVE : BarcodeStatus.ACTIVE,
              isPrimary: true,
              createdAt: uData.createdAt || new Date().toISOString(),
              updatedAt: uData.updatedAt || new Date().toISOString(),
            });
            return;
          }
        } catch {
          // fall through to general lookup
        }
      }

      // Check if this is a Dispatch Package
      const isPackageCode = cleanCode.startsWith('PKG-') || cleanCode.startsWith('PWI-PKG-');
      if (isPackageCode) {
        try {
          const pkgRes = await dispatchPackageService.traceLookup(cleanCode);
          const pkgData = (pkgRes as any)?.data?.package || (pkgRes as any)?.data || pkgRes;
          if (pkgData && (pkgData.id || pkgData.packageNo)) {
            setDispatchPackageRecord(pkgData);
            setResult({
              id: pkgData.id,
              companyId: pkgData.companyId || '',
              barcodeValue: pkgData.packageNo || cleanCode,
              entityType: BarcodeEntityType.DISPATCH_PACKAGE,
              entityId: pkgData.id,
              barcodeLabel: 'Dispatch Package',
              entityLabel: `Package: ${pkgData.packageNo}`,
              entityCode: pkgData.packageNo,
              status: pkgData.status === 'CANCELLED' ? BarcodeStatus.INACTIVE : BarcodeStatus.ACTIVE,
              isPrimary: true,
              createdAt: pkgData.createdAt || new Date().toISOString(),
              updatedAt: pkgData.updatedAt || new Date().toISOString(),
            });
            return;
          }
        } catch {
          // fall through to general lookup
        }
      }

      // Check if this is an Outward Gate Pass / Delivery Note
      const isGatePassCode =
        cleanCode.startsWith('GP-') ||
        cleanCode.startsWith('DN-') ||
        cleanCode.toUpperCase().includes('GATE') ||
        cleanCode.toUpperCase().includes('DRAFTDN');

      if (isGatePassCode) {
        const cleanRef = cleanCode.replace(/^GP-OUT-|^GP-IN-/, '');
        try {
          const delRes = await apiService.get<any>('/sales/deliveries', { search: cleanRef, limit: 1 });
          const delList = Array.isArray(delRes) ? delRes : delRes?.data || [];
          if (delList.length > 0) {
            const delSummary = delList[0];
            let fullDel = delSummary;
            try {
              const fullRes = await apiService.get<any>(`/sales/deliveries/${delSummary.id}`);
              fullDel = fullRes?.data || fullRes || delSummary;
            } catch {
              // fallback to summary
            }

            setGatePassRecord(fullDel);
            setResult({
              id: fullDel.id,
              companyId: fullDel.companyId,
              barcodeValue: cleanCode,
              entityType: BarcodeEntityType.GATE_PASS,
              entityId: fullDel.id,
              barcodeLabel: 'Outward Gate Pass',
              entityLabel: `Gate Pass: ${fullDel.deliveryNumber}`,
              entityCode: fullDel.deliveryNumber,
              status: 'ACTIVE' as any,
              isPrimary: true,
              createdAt: fullDel.createdAt || new Date().toISOString(),
              updatedAt: fullDel.updatedAt || new Date().toISOString(),
            });
            return;
          }
        } catch {
          // fall through to general lookup
        }
      }

      // General Barcode / QR Lookup
      const res = await apiService.get<{ success: boolean; data: BarcodeRecord }>(
        `/barcode-management/lookup/${encodeURIComponent(cleanCode)}`
      );
      if (res && (res.success || res.data)) {
        const data = res.data || (res as any);
        setResult(data);
        if (data.entityType === BarcodeEntityType.MACHINE || (data.entityType as any) === 'MACHINE') {
          setMachineModalOpen(true);
        } else if (data.entityType === BarcodeEntityType.ITEM || (data.entityType as any) === 'ITEM' || (data.entityType as any) === 'PRODUCT') {
          try {
            const itemRes = await apiService.get<any>(`/master-data/items/${data.entityId}`);
            const itemData = itemRes?.data || itemRes;
            if (itemData && itemData.id) {
              setItemRecord(itemData);
            }
          } catch {}
        } else if (data.entityType === BarcodeEntityType.PRODUCTION_UNIT || (data.entityType as any) === 'PRODUCTION_UNIT') {
          try {
            const puRes = await productionUnitService.scanLookup(data.entityCode || data.barcodeValue || data.entityId);
            const puData = (puRes as any)?.data || puRes;
            if (puData && (puData.id || puData.unitSerialNo)) {
              setProductionUnitRecord(puData);
            }
          } catch {}
        } else if (data.entityType === BarcodeEntityType.DISPATCH_PACKAGE || (data.entityType as any) === 'DISPATCH_PACKAGE') {
          try {
            const dpRes = await dispatchPackageService.traceLookup(data.entityCode || data.barcodeValue || data.entityId);
            const dpData = (dpRes as any)?.data?.package || (dpRes as any)?.data || dpRes;
            if (dpData && (dpData.id || dpData.packageNo)) {
              setDispatchPackageRecord(dpData);
            }
          } catch {}
        }
      } else {
        setError(`Barcode / QR Code "${cleanCode}" not found`);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        setError(`Barcode / QR Code "${cleanCode}" not found in the system`);
      } else {
        setError('Failed to look up barcode. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (barcode: string) => {
    setSearchValue(barcode);
    lookupBarcode(barcode);
  };

  const handleSearch = () => {
    lookupBarcode(searchValue);
  };

  const handleNavigateToEntity = (openHistoryMode = true) => {
    if (!result) return;
    const route = ENTITY_TYPE_ROUTES[result.entityType];
    if (route) {
      navigate(route, {
        state: {
          entityId: result.entityId,
          machineId: result.entityId,
          customerId: result.entityId,
          itemId: result.entityId,
          entityLabel: result.entityLabel,
          entityCode: result.entityCode,
          openBarcode: true,
          openHistory: openHistoryMode,
        },
      });
    }
  };

  // Helper to trigger Gate Pass Print from scanned data
  const handlePrintScannedGatePass = () => {
    if (!gatePassRecord) return;
    const record = gatePassRecord;
    const lines = record.lines || [];

    const uniqueSocs = Array.from(
      new Set(
        [
          record.salesOrderNumber,
          record.salesOrder?.orderNumber,
          ...lines.map((l: any) => l.salesOrderNumber || l.salesOrder?.orderNumber).filter(Boolean),
        ].filter(Boolean)
      )
    );
    const socDisplay = uniqueSocs.length === 1 ? String(uniqueSocs[0]) : uniqueSocs.length > 1 ? uniqueSocs.join(', ') : (record.salesOrderId ? `SOC-${record.salesOrderId.slice(0, 8)}` : '-');

    const uniquePos = Array.from(
      new Set(
        [
          record.customerPo,
          record.salesOrder?.customerPo,
          record.poNumber,
          ...lines.map((l: any) => l.customerPo).filter(Boolean),
        ].filter(Boolean)
      )
    );
    const poDisplay = uniquePos.length > 0 ? uniquePos.join(', ') : (record.customerPo || '-');

    printGatePassDocument({
      passType: 'OUTWARD',
      gatePassNo: `GP-OUT-${record.deliveryNumber?.replace(/[^a-zA-Z0-9]/g, '') || Date.now().toString().slice(-6)}`,
      referenceNo: record.deliveryNumber,
      customerPo: poDisplay,
      socNumber: socDisplay,
      dispatchSequence: record.dispatchSequence || '1st Dispatch (First Time)',
      date: record.deliveryDate ? new Date(record.deliveryDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      partyName: record.companyName || record.customer?.companyName || record.customer?.name || 'Valued Customer',
      vehicleNumber: record.vehicleNo || record.vehicleNumber || record.trackingNumber || 'Company Vehicle Fleet',
      driverName: record.driverName || record.driver || 'Driver on Duty',
      driverCnic: record.driverCnic || record.cnic,
      transporter: record.carrier || record.transporter || 'PWI Logistics Dispatch',
      remarks: record.notes || 'Outward customer delivery dispatch under security authorization',
      items: lines.map((it: any, idx: number) => {
        const orderQty = it.orderQuantity != null ? Number(it.orderQuantity) : (it.orderedQuantity != null ? Number(it.orderedQuantity) : undefined);
        const currentQty = Number(it.quantity) || 1;
        const bal = orderQty != null ? Math.max(0, orderQty - currentQty) : it.balanceQuantity;
        const pkgUnit = it.packagingUnit || 'Coils';
        const pkgQty = it.packageQuantity != null ? Number(it.packageQuantity) : undefined;
        return {
          itemCode: it.itemCode || `SKU-00${idx + 1}`,
          itemName: it.itemName || it.description || `Delivered Product ${idx + 1}`,
          socNumber: it.salesOrderNumber || (uniqueSocs.length === 1 ? String(uniqueSocs[0]) : undefined),
          customerPo: it.customerPo || (uniquePos.length === 1 ? String(uniquePos[0]) : undefined),
          orderQuantity: orderQty,
          quantity: currentQty,
          balanceQuantity: bal,
          uom: it.uomCode || it.uom || 'M',
          packageQuantity: pkgQty,
          packagingUnit: pkgUnit,
          packaging: pkgQty != null && pkgQty > 0 ? `${pkgQty} ${pkgUnit}` : (it.packaging || 'Pallets / Bundles'),
          remarks: it.remarks || it.notes || '-',
        };
      }),
    });
  };

  const isMachine = result?.entityType === BarcodeEntityType.MACHINE || (result?.entityType as any) === 'MACHINE';
  const isGatePass = result?.entityType === BarcodeEntityType.GATE_PASS || gatePassRecord != null;
  const isProdUnit = (result?.entityType === BarcodeEntityType.PRODUCTION_UNIT || (result?.entityType as any) === 'PRODUCTION_UNIT') && productionUnitRecord != null;
  const isPackage = (result?.entityType === BarcodeEntityType.DISPATCH_PACKAGE || (result?.entityType as any) === 'DISPATCH_PACKAGE') && dispatchPackageRecord != null;
  const isItem = result?.entityType === BarcodeEntityType.ITEM || (result?.entityType as any) === 'ITEM' || (result?.entityType as any) === 'PRODUCT';
  const isCustomer = result?.entityType === BarcodeEntityType.CUSTOMER || (result?.entityType as any) === 'CUSTOMER';

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ScanOutlined style={{ marginRight: 8 }} />
          Scan Barcode & QR Code
        </Title>
        <Text type="secondary">
          Scan or enter any Barcode / QR Code to verify Outward Gate Passes, Machines, Items, or ERP records
        </Text>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              size="large"
              placeholder="Enter or paste Barcode / QR code value (or scan Gate Pass QR)..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined />}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              size="large"
              onClick={handleSearch}
              loading={loading}
              icon={<SearchOutlined />}
            >
              Lookup
            </Button>
            <Button
              size="large"
              onClick={() => setScannerOpen(true)}
              icon={<ScanOutlined />}
            >
              Scan with Camera
            </Button>
          </div>
        </Space>
      </Card>

      {error && (
        <Alert
          type="warning"
          showIcon
          message="Code Not Found"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* Special Outward Gate Pass Scanned Details Card */}
      {isGatePass && gatePassRecord && (
        <Card
          style={{
            marginBottom: 16,
            background: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,
            borderTop: '4px solid #b45309',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div>
              <Space>
                <Tag color="#b45309" style={{ fontSize: 13, padding: '3px 8px', fontWeight: 800 }}>
                  OUTWARD GATE PASS
                </Tag>
                <Tag color="green" icon={<CheckCircleOutlined />}>
                  OFFICIAL SECURITY PERMIT VERIFIED
                </Tag>
              </Space>
              <div style={{ fontSize: 18, fontWeight: 800, color: token.colorTextHeading, marginTop: 4 }}>
                Gate Pass #: {`GP-OUT-${gatePassRecord.deliveryNumber?.replace(/[^a-zA-Z0-9]/g, '')}`}
              </div>
            </div>

            <Space wrap>
              <Button
                type="primary"
                size="large"
                icon={<PrinterOutlined />}
                style={{ background: '#b45309', borderColor: '#b45309', fontWeight: 700 }}
                onClick={handlePrintScannedGatePass}
              >
                View & Print Official Gate Pass
              </Button>
              <Button
                size="large"
                icon={<FileTextOutlined />}
                onClick={() => navigate('/sales/deliveries')}
              >
                Open in Sales Deliveries
              </Button>
              <Button
                size="large"
                onClick={() => {
                  setResult(null);
                  setGatePassRecord(null);
                  setSearchValue('');
                }}
              >
                Scan Another
              </Button>
            </Space>
          </div>

          {/* Gate Pass Header Grid */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <div style={{ background: token.colorFillAlter, padding: 14, borderRadius: 6, border: `1px solid ${token.colorBorderSecondary}` }}>
                <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorTextSecondary }}>
                  GATE PASS & ORDER IDENTIFICATION
                </Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div><Text strong>Delivery Note #:</Text> <Text strong>{gatePassRecord.deliveryNumber || '-'}</Text></div>
                  <div><Text strong>Customer PO #:</Text> <Tag color="gold" style={{ fontWeight: 700 }}>{gatePassRecord.customerPo || gatePassRecord.poNumber || '-'}</Tag></div>
                  <div><Text strong>Primary SOC #:</Text> <Tag color="blue" style={{ fontWeight: 700 }}>{gatePassRecord.salesOrderNumber || gatePassRecord.salesOrder?.orderNumber || (gatePassRecord.salesOrderId ? `SOC-${gatePassRecord.salesOrderId.slice(0, 8)}` : '-')}</Tag></div>
                  <div><Text strong>Dispatch Sequence:</Text> <Tag color="purple">{gatePassRecord.dispatchSequence || '1st Dispatch (First Time)'}</Tag></div>
                  <div><Text strong>Date & Time:</Text> <Text>{gatePassRecord.deliveryDate ? new Date(gatePassRecord.deliveryDate).toLocaleDateString() : new Date().toLocaleDateString()}</Text></div>
                </Space>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <div style={{ background: token.colorFillAlter, padding: 14, borderRadius: 6, border: `1px solid ${token.colorBorderSecondary}` }}>
                <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorTextSecondary }}>
                  VEHICLE & TRANSPORTER DETAILS
                </Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div><Text strong>Customer / Consignee:</Text> <Text strong>{gatePassRecord.companyName || gatePassRecord.customer?.companyName || gatePassRecord.customer?.name || '-'}</Text></div>
                  <div><Text strong>Vehicle / Truck #:</Text> <Text strong>{gatePassRecord.vehicleNo || gatePassRecord.vehicleNumber || gatePassRecord.trackingNumber || '-'}</Text></div>
                  <div><Text strong>Driver Name & CNIC:</Text> <Text>{gatePassRecord.driverName || gatePassRecord.driver || 'Driver on Duty'} {gatePassRecord.driverCnic ? `(${gatePassRecord.driverCnic})` : ''}</Text></div>
                  <div><Text strong>Transporter / Carrier:</Text> <Text>{gatePassRecord.carrier || gatePassRecord.transporter || 'PWI Logistics Dispatch'}</Text></div>
                  <div><Text strong>Remarks:</Text> <Text>{gatePassRecord.notes || 'Outward customer delivery dispatch under security authorization'}</Text></div>
                </Space>
              </div>
            </Col>
          </Row>

          {/* Line Items Table with Coils, Packaging, and Balances */}
          <div>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: 14 }}>
                Dispatched Line Items, Coils / Packaging & SOC Balances
              </Text>
            </div>
            <Table
              size="small"
              dataSource={gatePassRecord.lines || []}
              rowKey={(r: any) => r.id || r.itemCode}
              pagination={false}
              columns={[
                { title: '#', width: 45, render: (_: any, __: any, idx: number) => idx + 1 },
                {
                  title: 'Material / Product & SOC',
                  render: (_: any, r: any) => (
                    <div>
                      <Text strong>{r.itemName || r.description || 'Delivered Item'}</Text>
                      <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>[{r.itemCode || '-'}]</span>
                      {r.salesOrderNumber && <Tag color="blue" style={{ marginLeft: 6 }}>📋 SOC: {r.salesOrderNumber}</Tag>}
                      {r.customerPo && <Tag color="gold" style={{ marginLeft: 4 }}>🔖 PO: {r.customerPo}</Tag>}
                      {r.orderQuantity != null && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          SOC Order: <strong>{r.orderQuantity} {r.uomCode || r.uom || ''}</strong> &nbsp;|&nbsp;
                          Remaining Balance: <strong style={{ color: (r.orderQuantity - r.quantity) > 0 ? '#ea580c' : '#16a34a' }}>
                            {Math.max(0, r.orderQuantity - r.quantity)} {r.uomCode || r.uom || ''}
                          </strong>
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  title: 'Physical Qty',
                  dataIndex: 'quantity',
                  width: 140,
                  render: (val: number, r: any) => (
                    <Text strong style={{ color: token.colorTextHeading }}>{val || 1} {r.uomCode || r.uom || 'M'}</Text>
                  ),
                },
                {
                  title: 'Packaging (Coils / Boxes)',
                  width: 180,
                  render: (_: any, r: any) => (
                    <Tag color="cyan" style={{ fontWeight: 600 }}>
                      {r.packageQuantity ? `${r.packageQuantity} ${r.packagingUnit || 'Coils'}` : r.packaging || 'Standard Packaging'}
                    </Tag>
                  ),
                },
              ]}
            />
          </div>
        </Card>
      )}

      {/* Production Unit / Physical Coil Scanned Details Card */}
      {isProdUnit && productionUnitRecord && (
        <Card
          style={{
            marginBottom: 16,
            background: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,
            borderTop: '4px solid #0284c7',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div>
              <Space wrap>
                <Tag color="#0284c7" style={{ fontSize: 13, padding: '3px 8px', fontWeight: 800 }}>
                  PRODUCTION UNIT / COIL
                </Tag>
                <Tag color="green" icon={<CheckCircleOutlined />}>
                  PHYSICAL COIL VERIFIED
                </Tag>
                <Tag
                  color={
                    productionUnitRecord.status === 'PRODUCED' || productionUnitRecord.status === 'GENERATED'
                      ? 'blue'
                      : productionUnitRecord.status === 'IN_PACKAGE'
                      ? 'purple'
                      : productionUnitRecord.status === 'DISPATCHED'
                      ? 'green'
                      : 'default'
                  }
                  style={{ fontWeight: 700 }}
                >
                  {productionUnitRecord.status || 'ACTIVE'}
                </Tag>
              </Space>
              <div style={{ fontSize: 20, fontWeight: 800, color: token.colorTextHeading, marginTop: 6 }}>
                Coil #: {productionUnitRecord.coilNo} &nbsp;·&nbsp;{' '}
                <span style={{ fontSize: 16, color: '#64748b' }}>Serial: {productionUnitRecord.unitSerialNo}</span>
              </div>
            </div>

            <Space wrap>
              <Button
                type="primary"
                size="large"
                icon={<PrinterOutlined />}
                style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 700 }}
                onClick={() => {
                  printProductionUnitLabels({
                    units: [productionUnitRecord],
                    template: productionUnitRecord.labelTemplate || 'PVC_COIL',
                    presetKey: 'ROLL_100x50',
                  });
                }}
              >
                Print Coil Label
              </Button>
              <Button
                size="large"
                icon={<PlusCircleOutlined />}
                style={{ background: '#059669', borderColor: '#059669', color: '#fff', fontWeight: 600 }}
                onClick={() => {
                  navigate('/sales/packages', {
                    state: { addSerial: productionUnitRecord.unitSerialNo },
                  });
                }}
              >
                Add to Dispatch Package
              </Button>
              <Button
                size="large"
                icon={<FileTextOutlined />}
                onClick={() => navigate('/production/units')}
              >
                Open in Production Units
              </Button>
              <Button
                size="large"
                onClick={() => {
                  setResult(null);
                  setProductionUnitRecord(null);
                  setSearchValue('');
                }}
              >
                Scan Another
              </Button>
            </Space>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div
                style={{
                  background: token.colorFillAlter,
                  padding: 14,
                  borderRadius: 6,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  height: '100%',
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorTextSecondary }}>
                  COIL & PRODUCT SPECIFICATION
                </Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div>
                    <Text strong>Product / Item:</Text>{' '}
                    <Text strong>
                      {productionUnitRecord.item?.name || productionUnitRecord.itemName || 'Industrial Wire Product'}
                    </Text>
                  </div>
                  <div>
                    <Text strong>Item Code / SKU:</Text>{' '}
                    <Tag color="blue">{productionUnitRecord.item?.itemCode || productionUnitRecord.itemCode || '-'}</Tag>
                  </div>
                  <div>
                    <Text strong>Batch / Lot #:</Text> <Text>{productionUnitRecord.batchNo || '-'}</Text>
                  </div>
                  {productionUnitRecord.pvcBatchNo && (
                    <div>
                      <Text strong>PVC Compound Batch:</Text> <Text>{productionUnitRecord.pvcBatchNo}</Text>
                    </div>
                  )}
                  <div>
                    <Text strong>Length (Meters):</Text>{' '}
                    <Text strong style={{ color: '#0284c7' }}>
                      {productionUnitRecord.lengthMeters != null
                        ? Number(productionUnitRecord.lengthMeters).toLocaleString()
                        : '-'}{' '}
                      m
                    </Text>
                  </div>
                  <div>
                    <Text strong>Weight:</Text>{' '}
                    <Text strong>
                      {productionUnitRecord.netWeightKg || productionUnitRecord.weightKg || '-'} kg (Net)
                    </Text>
                    {productionUnitRecord.grossWeightKg && (
                      <span> / {productionUnitRecord.grossWeightKg} kg (Gross)</span>
                    )}
                  </div>
                </Space>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <div
                style={{
                  background: token.colorFillAlter,
                  padding: 14,
                  borderRadius: 6,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  height: '100%',
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorTextSecondary }}>
                  PRODUCTION & TRACEABILITY AUDIT
                </Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div>
                    <Text strong>Machine #:</Text>{' '}
                    <Text>
                      {productionUnitRecord.machineNo ||
                        productionUnitRecord.machine?.machineName ||
                        productionUnitRecord.machine?.machineCode ||
                        '-'}
                    </Text>
                  </div>
                  <div>
                    <Text strong>Shift / Department:</Text>{' '}
                    <Text>
                      {productionUnitRecord.shiftName || '-'}{' '}
                      {productionUnitRecord.departmentName ? `(${productionUnitRecord.departmentName})` : ''}
                    </Text>
                  </div>
                  <div>
                    <Text strong>Operator Name:</Text> <Text>{productionUnitRecord.operatorName || '-'}</Text>
                  </div>
                  <div>
                    <Text strong>Production Date:</Text>{' '}
                    <Text>
                      {productionUnitRecord.productionDate
                        ? new Date(productionUnitRecord.productionDate).toLocaleDateString()
                        : '-'}
                    </Text>
                  </div>
                  <div>
                    <Text strong>Print Count:</Text>{' '}
                    <Tag color="orange">{productionUnitRecord.printCount || 0} times printed</Tag>
                  </div>
                  {productionUnitRecord.packageNo && (
                    <div>
                      <Text strong>Assigned Package:</Text>{' '}
                      <Tag color="purple">📦 {productionUnitRecord.packageNo}</Tag>
                    </div>
                  )}
                </Space>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* Dispatch Package Scanned Details Card */}
      {isPackage && dispatchPackageRecord && (
        <Card
          style={{
            marginBottom: 16,
            background: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,
            borderTop: '4px solid #059669',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div>
              <Space wrap>
                <Tag color="#059669" style={{ fontSize: 13, padding: '3px 8px', fontWeight: 800 }}>
                  DISPATCH PACKAGE
                </Tag>
                <Tag color="green" icon={<CheckCircleOutlined />}>
                  PACKAGE VERIFIED
                </Tag>
                <Tag
                  color={
                    dispatchPackageRecord.status === 'FINALIZED'
                      ? 'purple'
                      : dispatchPackageRecord.status === 'DISPATCHED'
                      ? 'green'
                      : 'blue'
                  }
                >
                  {dispatchPackageRecord.status || 'OPEN'}
                </Tag>
              </Space>
              <div style={{ fontSize: 20, fontWeight: 800, color: token.colorTextHeading, marginTop: 6 }}>
                Package #: {dispatchPackageRecord.packageNo}
              </div>
            </div>

            <Space wrap>
              <Button
                type="primary"
                size="large"
                icon={<InboxOutlined />}
                style={{ background: '#059669', borderColor: '#059669', fontWeight: 700 }}
                onClick={() => navigate('/sales/packages')}
              >
                Open in Dispatch Packages
              </Button>
              <Button
                size="large"
                onClick={() => {
                  setResult(null);
                  setDispatchPackageRecord(null);
                  setSearchValue('');
                }}
              >
                Scan Another
              </Button>
            </Space>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div
                style={{
                  background: token.colorFillAlter,
                  padding: 14,
                  borderRadius: 6,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  height: '100%',
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorTextSecondary }}>
                  PACKAGE & DISPATCH SUMMARY
                </Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div>
                    <Text strong>Customer:</Text> <Text strong>{dispatchPackageRecord.customerName || '-'}</Text>
                  </div>
                  <div>
                    <Text strong>Sales Order #:</Text> <Text>{dispatchPackageRecord.salesOrderNo || '-'}</Text>
                  </div>
                  <div>
                    <Text strong>Gate Pass #:</Text> <Tag color="gold">{dispatchPackageRecord.gatePassNo || '-'}</Tag>
                  </div>
                  <div>
                    <Text strong>Total Packed Coils:</Text>{' '}
                    <Tag color="cyan" style={{ fontWeight: 700 }}>
                      {dispatchPackageRecord.totalUnits || dispatchPackageRecord.units?.length || 0} Units
                    </Tag>
                  </div>
                  <div>
                    <Text strong>Total Weight:</Text>{' '}
                    <Text strong>{dispatchPackageRecord.totalWeightKg || 0} kg</Text>
                  </div>
                </Space>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <div
                style={{
                  background: token.colorFillAlter,
                  padding: 14,
                  borderRadius: 6,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  height: '100%',
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorTextSecondary }}>
                  LOGISTICS & VEHICLE DETAILS
                </Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div>
                    <Text strong>Vehicle / Truck #:</Text>{' '}
                    <Text strong>{dispatchPackageRecord.vehicleNo || '-'}</Text>
                  </div>
                  <div>
                    <Text strong>Driver Name & Phone:</Text>{' '}
                    <Text>
                      {dispatchPackageRecord.driverName || '-'}{' '}
                      {dispatchPackageRecord.driverPhone ? `(${dispatchPackageRecord.driverPhone})` : ''}
                    </Text>
                  </div>
                  <div>
                    <Text strong>Dispatch Location:</Text>{' '}
                    <Text>{dispatchPackageRecord.dispatchLocation || '-'}</Text>
                  </div>
                  <div>
                    <Text strong>Date:</Text>{' '}
                    <Text>
                      {dispatchPackageRecord.packageDate
                        ? new Date(dispatchPackageRecord.packageDate).toLocaleDateString()
                        : '-'}
                    </Text>
                  </div>
                </Space>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* General Resolved Card (for Items, Machines, Customers, etc.) */}
      {result && !isGatePass && !isProdUnit && !isPackage && (
        <Card style={{ background: token.colorBgContainer, borderColor: token.colorBorderSecondary }}>
          <Result
            status="success"
            title="Barcode / QR Code Resolved"
            subTitle={`Found ${ENTITY_TYPE_LABELS[result.entityType] || result.entityType}: ${result.entityCode || result.entityLabel || result.barcodeValue}`}
            extra={[
              isItem && (
                <Button
                  type="primary"
                  key="item-history"
                  icon={<HistoryOutlined />}
                  style={{ background: '#059669', borderColor: '#059669', fontWeight: 700 }}
                  onClick={() => handleNavigateToEntity(true)}
                >
                  View Complete Item History (ہسٹری)
                </Button>
              ),
              isMachine && (
                <Button
                  type="primary"
                  key="machine-history"
                  icon={<ToolOutlined />}
                  style={{ background: '#722ed1', borderColor: '#722ed1', fontWeight: 700 }}
                  onClick={() => setMachineModalOpen(true)}
                >
                  View Machine Lifecycle History (ہسٹری)
                </Button>
              ),
              isCustomer && (
                <Button
                  type="primary"
                  key="customer-history"
                  icon={<HistoryOutlined />}
                  style={{ background: '#1d4ed8', borderColor: '#1d4ed8', fontWeight: 700 }}
                  onClick={() => handleNavigateToEntity(true)}
                >
                  View Customer 360 & Ledger History (ہسٹری)
                </Button>
              ),
              <Button type="default" key="print" icon={<PrinterOutlined />} onClick={() => setPrintOpen(true)}>
                Print Label
              </Button>,
              <Button type="default" key="navigate" onClick={() => handleNavigateToEntity(false)}>
                Open {ENTITY_TYPE_LABELS[result.entityType] || result.entityType} Master <ArrowRightOutlined />
              </Button>,
              <Button
                key="scan-another"
                onClick={() => {
                  setResult(null);
                  setItemRecord(null);
                  setSearchValue('');
                }}
              >
                Scan Another
              </Button>,
            ].filter(Boolean)}
          >
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} md={16}>
                <div
                  style={{
                    textAlign: 'left',
                    background: token.colorFillAlter,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: 16,
                    borderRadius: 8,
                    height: '100%',
                  }}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <div><Text strong>Scanned Code:</Text> <Text code style={{ fontSize: 13 }}>{result.barcodeValue}</Text></div>
                    <div><Text strong>Entity Type:</Text> <Tag color="blue">{ENTITY_TYPE_LABELS[result.entityType] || result.entityType}</Tag></div>
                    {result.entityCode && <div><Text strong>Entity Code:</Text> <Text strong>{result.entityCode}</Text></div>}
                    {result.entityLabel && <div><Text strong>Name / Label:</Text> <Text>{result.entityLabel}</Text></div>}
                    <div><Text strong>Status:</Text> <Tag color={result.status === 'ACTIVE' ? 'green' : 'red'}>{result.status}</Tag></div>

                    {isItem && (
                      <>
                        {itemRecord?.category && (
                          <div>
                            <Text strong>Category:</Text> <Tag color="cyan">{itemRecord.category?.name || itemRecord.category}</Tag>
                          </div>
                        )}
                        {itemRecord?.unitOfMeasure && (
                          <div>
                            <Text strong>Unit of Measure:</Text> <Text>{itemRecord.uom?.name || itemRecord.unitOfMeasure}</Text>
                          </div>
                        )}
                        {itemRecord?.currentStock != null && (
                          <div>
                            <Text strong>Current Stock:</Text>{' '}
                            <Tag color="green" style={{ fontWeight: 700 }}>
                              {itemRecord.currentStock} {itemRecord.uom?.code || itemRecord.unitOfMeasure || ''}
                            </Tag>
                          </div>
                        )}
                        <Alert
                          type="success"
                          showIcon
                          icon={<HistoryOutlined />}
                          message="Direct Item History Available"
                          description="Click 'View Complete Item History' to instantly open this item's full movement history, stock ledger, production consumption, and batch adjustments."
                          style={{ marginTop: 12 }}
                        />
                      </>
                    )}

                    {isMachine && (
                      <Alert
                        type="info"
                        showIcon
                        message="Machine History Available"
                        description="Click 'View Machine Lifecycle History' to inspect all maintenance job cards, replaced parts/tooling, and daily production entries."
                        style={{ marginTop: 12 }}
                      />
                    )}

                    {isCustomer && (
                      <Alert
                        type="info"
                        showIcon
                        message="Customer 360 & Statement Available"
                        description="Click 'View Customer 360 & Ledger History' to inspect outstanding balance, order history, deliveries, and payment ledger."
                        style={{ marginTop: 12 }}
                      />
                    )}
                  </Space>
                </div>
              </Col>

              <Col xs={24} md={8}>
                <div
                  style={{
                    textAlign: 'center',
                    background: 'var(--theme-bg-secondary, #fafafa)',
                    padding: 16,
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    height: '100%',
                  }}
                >
                  <Text strong style={{ fontSize: 12 }}>
                    <QrcodeOutlined style={{ marginRight: 6 }} />
                    QR Code Preview
                  </Text>
                  <div style={{ background: '#ffffff', padding: 10, borderRadius: 8, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <QRCode
                      value={result.barcodeValue}
                      size={120}
                      type="svg"
                      color="#000000"
                      bgColor="#ffffff"
                      bordered={false}
                    />
                  </div>
                  <Text code style={{ fontSize: 11 }}>{result.barcodeValue}</Text>
                </div>
              </Col>
            </Row>
          </Result>
        </Card>
      )}

      {/* Embedded Complete Machine History (Renders right on page for instant view) */}
      {isMachine && result && (
        <MachineLifecycleContent
          machineId={result.entityId}
          machineCode={result.entityCode || undefined}
          barcodeValue={result.barcodeValue}
          inModal={false}
        />
      )}

      {!result && !error && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <ScanOutlined style={{ fontSize: 48, color: 'var(--theme-text-tertiary, #d9d9d9)', marginBottom: 16 }} />
            <div>
              <Text type="secondary">
                Scan a barcode or QR code with your camera (or upload an image) to verify Gate Passes, Machines, or Products.
              </Text>
            </div>
            <Divider />
            <div style={{ textAlign: 'left', maxWidth: 450, margin: '0 auto' }}>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Supported Entities:</Text>
              <Space wrap size={[8, 4]}>
                {Object.values(BarcodeEntityType).map((type) => (
                  <Tag key={type} style={{ margin: 0 }}>{ENTITY_TYPE_LABELS[type]}</Tag>
                ))}
              </Space>
            </div>
          </div>
        </Card>
      )}

      {/* Camera / Photo Scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Scan ERP Barcode / QR Code"
      />

      {/* Machine Lifecycle History Modal */}
      {isMachine && result && (
        <ScannedMachineHistoryModal
          open={machineModalOpen}
          onClose={() => setMachineModalOpen(false)}
          machineId={result.entityId}
          machineCode={result.entityCode || undefined}
          barcodeValue={result.barcodeValue}
        />
      )}

      {/* Print Modal */}
      {result && !isGatePass && (
        <BarcodePrint
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          itemCode={result.entityCode || result.entityId}
          itemName={result.entityLabel || ENTITY_TYPE_LABELS[result.entityType]}
          barcode={result.barcodeValue}
          initialFormat="BOTH"
        />
      )}
    </div>
  );
};

export default ScanBarcode;
