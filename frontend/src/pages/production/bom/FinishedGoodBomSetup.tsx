import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  Input,
  InputNumber,
  Button,
  Table,
  Tag,
  Space,
  Typography,
  Divider,
  Alert,
  Spin,
  Popconfirm,
  Badge,
  Tooltip,
  App,
  Modal,
} from 'antd';
import {
  AppstoreAddOutlined,
  SaveOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CheckCircleFilled,
  WarningFilled,
  InfoCircleOutlined,
  ClusterOutlined,
  InboxOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  EyeOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiService from '../../../services/api';
import { getLookupsSnapshot, prefetchAllLookups, subscribeLookups } from '../../../services/lookupsCache';
import PageHeader from '../../../components/shared/PageHeader';
import Breadcrumbs from '../../../components/shared/Breadcrumbs';

const { Text, Title } = Typography;

export interface ItemMaster {
  id: string;
  itemCode: string;
  name: string;
  itemType?: string;
  baseUomId?: string;
  baseUom?: { id?: string; code: string; symbol?: string; name?: string };
  costPrice?: number;
  status?: string;
}

export interface UomMaster {
  id: string;
  code: string;
  name: string;
  symbol?: string;
}

export interface UomConversionMaster {
  id: string;
  fromUomId: string;
  toUomId: string;
  conversionFactor: number | string;
  fromCode?: string;
  toCode?: string;
  fromUom?: { code: string };
  toUom?: { code: string };
}

export interface SetupBomLineRow {
  key: string;
  lineId?: string;
  itemId?: string;
  item?: ItemMaster;
  quantity: number;
  uomId?: string;
  remarks?: string;
  pcsEquivalent?: number;
}

const DEFAULT_PCS_PER_GROSS = 144;
const DEFAULT_GROSS_PER_CARTON = 10;
const DEFAULT_PCS_PER_CARTON = 1440;

// Authoritative Core Factory UOMs with exact database UUIDs
export const DEFAULT_CORE_UOMS: UomMaster[] = [
  { id: 'b932052f-141f-4d78-9baf-7025e5302442', code: 'PCS', name: 'Pieces', symbol: 'pcs' },
  { id: 'c3f9c90e-1e97-4564-8e4e-36a676bdc57e', code: 'GRS', name: 'Gross (144 PCS)', symbol: 'grs' },
  { id: '52a2a811-b692-497e-9467-10a06b66043b', code: 'KG', name: 'Kilogram', symbol: 'kg' },
  { id: 'af53fc03-7034-4cec-b5cd-463859d78a7e', code: 'MTR', name: 'Meter', symbol: 'm' },
  { id: '7d83e201-9a4f-4d6b-8cf2-5e8a0f124801', code: 'CTN', name: 'Carton (10 Gross / 1,440 PCS)', symbol: 'ctn' },
];

// Helper to eliminate trailing decimal zeros (e.g. 5.0000 -> 5, 144.0000 -> 144, 0.2500 -> 0.25)
export const formatCleanQty = (val: any): string => {
  if (val === null || val === undefined || val === '') return '0';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return parseFloat(n.toFixed(4)).toString();
};

export interface FinishedGoodBomSetupProps {
  isSubTab?: boolean;
  onNavigateTab?: (tabKey: string, params?: Record<string, string>) => void;
}

const FinishedGoodBomSetup: React.FC<FinishedGoodBomSetupProps> = ({ isSubTab = false, onNavigateTab }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get('productId') || searchParams.get('id');

  // Master Data State
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [uoms, setUoms] = useState<UomMaster[]>(DEFAULT_CORE_UOMS);
  const [uomConversions, setUomConversions] = useState<UomConversionMaster[]>([]);
  const [loadingLookups, setLoadingLookups] = useState<boolean>(true);

  // Selected Finished Good
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId);

  // Active BOM Configuration State
  const [existingBom, setExistingBom] = useState<any | null>(null);
  const [loadingBom, setLoadingBom] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Modal dialog states for Confirmation Popups (Save & Delete)
  const [saveModalVisible, setSaveModalVisible] = useState<boolean>(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState<boolean>(false);
  const [targetDeleteLine, setTargetDeleteLine] = useState<SetupBomLineRow | null>(null);
  const [isDeletingLine, setIsDeletingLine] = useState<boolean>(false);

  // Big Success Result Dialog State (Corporate Standard)
  const [bomSuccessModal, setBomSuccessModal] = useState<{
    open: boolean;
    bomName: string;
    fgCode: string;
    fgName: string;
    baseQtyText: string;
    componentsCount: number;
    componentsSummary: string;
    statusText: string;
  }>({
    open: false,
    bomName: '',
    fgCode: '',
    fgName: '',
    baseQtyText: '',
    componentsCount: 0,
    componentsSummary: '',
    statusText: '',
  });

  // Catalog BOM deletion state
  const [deleteBomModalVisible, setDeleteBomModalVisible] = useState<boolean>(false);
  const [targetDeleteBom, setTargetDeleteBom] = useState<any | null>(null);
  const [isDeletingBom, setIsDeletingBom] = useState<boolean>(false);

  // BOM Form Fields
  const [bomName, setBomName] = useState<string>('');
  const [bomDescription, setBomDescription] = useState<string>('');
  const [baseQuantity, setBaseQuantity] = useState<number>(1);
  const [lines, setLines] = useState<SetupBomLineRow[]>([]);

  // Configured BOMs Catalog State
  const [catalogBoms, setCatalogBoms] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);

  // Authoritative UOM conversion engine
  const conversionFactors = useMemo(() => {
    let pcsPerGross = DEFAULT_PCS_PER_GROSS;
    let grossPerCarton = DEFAULT_GROSS_PER_CARTON;

    const grsToPcs = uomConversions.find(
      (c) =>
        (c.fromUom?.code?.toUpperCase() === 'GRS' || c.fromCode?.toUpperCase() === 'GRS') &&
        (c.toUom?.code?.toUpperCase() === 'PCS' || c.toCode?.toUpperCase() === 'PCS')
    );
    const grsFactor = Number(grsToPcs?.conversionFactor);
    if (grsFactor > 0) pcsPerGross = grsFactor;

    const ctnToGrs = uomConversions.find(
      (c) =>
        (c.fromUom?.code?.toUpperCase() === 'CTN' ||
          c.fromUom?.code?.toUpperCase() === 'CARTON' ||
          c.fromCode?.toUpperCase() === 'CTN') &&
        (c.toUom?.code?.toUpperCase() === 'GRS' || c.toCode?.toUpperCase() === 'GRS')
    );
    const ctnFactor = Number(ctnToGrs?.conversionFactor);
    if (ctnFactor > 0) grossPerCarton = ctnFactor;

    const pcsPerCarton = pcsPerGross * grossPerCarton;
    return { pcsPerGross, grossPerCarton, pcsPerCarton };
  }, [uomConversions]);

  // Authoritative Spoke Finished Goods, Semi-Finished Components, and Nipples with exact database UUIDs
  const DEFAULT_BOM_FINISHED_GOODS = useMemo(() => [
    // Finished Goods (Spoke Division Packing Products)
    { id: '1389aa89-8992-42f4-b776-befb35bf4f65', itemCode: 'SPI-FG-SPK-010', name: '125-300X18 Inn / Out Spoke Butted_125 - 300X17 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '729d4699-a0b9-4063-855d-4e4419511c79', itemCode: 'SPI-FG-SPK-009', name: '125-300X17 Inn / Out Spoke Butted_125 - 300X17 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '864dc17b-88c4-44ad-b9b8-dbeee8f15f09', itemCode: 'SPI-FG-SPK-008', name: '300X18 S9 Inn / Out Spoke Straight_125-S9 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '181fb5ac-40d6-4957-856f-3806ae3ee9dc', itemCode: 'SPI-FG-SPK-007', name: '300X17 S9 Inn / Out Spoke Straight_125-S9 Nipple', itemType: 'FINISHED_GOOD' },
    { id: 'd9554c71-5037-451e-b639-4c6150aeb06c', itemCode: 'SPI-FG-SPK-006', name: 'RM -18 Inn / Out Spoke Straight_RM-100 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '9aaa3aed-9198-4c08-a9ef-496ed0c6afea', itemCode: 'SPI-FG-SPK-005', name: 'RM Inn / Out Spoke Straight_RM-100 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '22efcf3f-01ec-4690-bd5a-268c865f09c9', itemCode: 'SPI-FG-SPK-004', name: 'CD-250*18 Outer Butted', itemType: 'FINISHED_GOOD' },
    { id: 'f8b141d9-7e0c-48a7-b2f0-60b8b32ff83d', itemCode: 'SPI-FG-SPK-003', name: '250X18 Inn / Out Spoke Butted_CD-250X17 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '6aaa54fe-6899-4b06-97c3-031c714f9155', itemCode: 'SPI-FG-SPK-002', name: '250X17 Inn / Out Spoke Butted_CD-250X17 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '044b1a9c-1230-450e-a38b-a8a7493c6c48', itemCode: 'SPI-FG-SPK-001', name: '250X17 INN / OUT Spoke Butted_225X17 Nipple', itemType: 'FINISHED_GOOD' },
    { id: '1e9379be-18b1-4290-a4c3-d97ee928eefd', itemCode: 'SPI-FG-SPK-011', name: 'DS Front Inn / Out Spoke Straight_225X17 Nipple', itemType: 'FINISHED_GOOD' },

    // Semi-Finished Spokes (All factory codes WIP-SPL-001 to WIP-SPL-018)
    { id: 'e72d30e1-e0da-447c-af1e-6a57d9aad0af', itemCode: 'WIP-SPL-001', name: 'CD-250*17 Inner Butted', itemType: 'SEMI_FINISHED' },
    { id: 'a7b4d433-e97c-4d11-bc26-75541f4f1593', itemCode: 'WIP-SPL-002', name: 'CD-250*17 Outer Butted', itemType: 'SEMI_FINISHED' },
    { id: 'dfbcafb0-6b5a-446a-8c46-804f0555e72b', itemCode: 'WIP-SPL-003', name: '250*18 Inner Butted 100', itemType: 'SEMI_FINISHED' },
    { id: 'ef0b56f7-9147-4d95-b63c-24e50da9be8f', itemCode: 'WIP-SPL-004', name: '250*18 Outer Butted 100cc', itemType: 'SEMI_FINISHED' },
    { id: 'c1d28937-da55-40e2-8bfb-7d84ac5af466', itemCode: 'WIP-SPL-005', name: '250*17 Inner Straight', itemType: 'SEMI_FINISHED' },
    { id: '5ffd6862-6d76-43d0-afc3-9118537ef972', itemCode: 'WIP-SPL-006', name: '250*17 Outer Straight', itemType: 'SEMI_FINISHED' },
    { id: '55195a7b-e950-4c9f-b10b-7795da52d2c8', itemCode: 'WIP-SPL-007', name: '250*18 Inner Straight', itemType: 'SEMI_FINISHED' },
    { id: '41cff115-6750-44ef-8c69-5395320347d6', itemCode: 'WIP-SPL-008', name: '250*18 Outer Straight', itemType: 'SEMI_FINISHED' },
    { id: 'b34bc3a8-5b9f-47b7-b482-32d6ec36c6bc', itemCode: 'WIP-SPL-009', name: '125-300*17 Inner Butted', itemType: 'SEMI_FINISHED' },
    { id: '7689378f-3fa2-40c4-8e85-d7ec77b72cce', itemCode: 'WIP-SPL-010', name: '125-300*17 Outer Butted', itemType: 'SEMI_FINISHED' },
    { id: '58963c70-a7fd-4973-a205-15eb04d99cec', itemCode: 'WIP-SPL-011', name: '125-300*18 Inner Butted', itemType: 'SEMI_FINISHED' },
    { id: '8e1e519c-e412-490f-9d60-87ed065c3035', itemCode: 'WIP-SPL-012', name: '125-300*18 Outer Butted', itemType: 'SEMI_FINISHED' },
    { id: 'bad446f8-9bf6-49ce-b63b-e88c54607003', itemCode: 'WIP-SPL-013', name: '125-300*17 Inner Straight', itemType: 'SEMI_FINISHED' },
    { id: 'beaa0ddf-e109-4f48-9609-04e5967bc795', itemCode: 'WIP-SPL-014', name: '125-300*17 Outer Straight', itemType: 'SEMI_FINISHED' },
    { id: '129d571b-6a63-466a-a892-5bd3a1d7833b', itemCode: 'WIP-SPL-015', name: '125-300*18 Inner Straight', itemType: 'SEMI_FINISHED' },
    { id: '390c0d5d-3a6b-4202-97e9-cdd62a3227b3', itemCode: 'WIP-SPL-016', name: '125-300*18 Outer Straight', itemType: 'SEMI_FINISHED' },
    { id: '94831f9f-c358-4da1-b570-fe1daa0092b9', itemCode: 'WIP-SPL-017', name: '225*17 Inner Straight', itemType: 'SEMI_FINISHED' },
    { id: '517cb2b4-b62f-4785-b83b-74e3dce9481a', itemCode: 'WIP-SPL-018', name: '225*17 Outer Straight', itemType: 'SEMI_FINISHED' },

    // Assembly Nipples
    { id: '9f3ceb36-f11f-4519-ae54-c519fdb6aa26', itemCode: 'FG-NP-003', name: '125-300X17 Nipple', itemType: 'FINISHED_GOOD', baseUom: { id: 'c3f9c90e-1e97-4564-8e4e-36a676bdc57e', code: 'GRS', name: 'Gross' } },
    { id: 'ced9ab53-b470-47c2-83a9-829726b38b5b', itemCode: 'SPI-FG-NP-005', name: '125-S9 Nipple', itemType: 'FINISHED_GOOD', baseUom: { id: 'c3f9c90e-1e97-4564-8e4e-36a676bdc57e', code: 'GRS', name: 'Gross' } },
  ], []);

  const extractArray = (res: any): any[] => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.items)) return res.items;
    if (Array.isArray(res.data?.items)) return res.data.items;
    if (Array.isArray(res.data?.data)) return res.data.data;
    return [];
  };

  // Load existing ERP lookups with instantaneous cache seed followed by live API hydration
  useEffect(() => {
    let mounted = true;

    // 1. Instantaneous Cache / Baseline Seeding (0ms)
    const cachedSnap = getLookupsSnapshot();
    const initialMap = new Map<string, ItemMaster>();
    for (const std of DEFAULT_BOM_FINISHED_GOODS) {
      initialMap.set(std.id, std as ItemMaster);
    }
    if (cachedSnap.items && cachedSnap.items.length > 0) {
      for (const it of cachedSnap.items) {
        if (it && it.id) initialMap.set(it.id, { ...initialMap.get(it.id), ...it } as ItemMaster);
      }
    }
    const initialItems = Array.from(initialMap.values());
    setItems(initialItems);
    itemsRef.current = initialItems;

    if (cachedSnap.uoms && cachedSnap.uoms.length > 0) {
      const mergedUoms = [...DEFAULT_CORE_UOMS];
      for (const u of cachedSnap.uoms) {
        if (!u || !u.id) continue;
        const existingIdx = mergedUoms.findIndex(
          (m) => m.id === u.id || (m.code && u.code && m.code.toUpperCase() === u.code.toUpperCase())
        );
        if (existingIdx !== -1) mergedUoms[existingIdx] = { ...mergedUoms[existingIdx], ...u };
        else mergedUoms.push(u as any);
      }
      setUoms(mergedUoms);
      uomsRef.current = mergedUoms;
    }
    if (cachedSnap.uomConversions && cachedSnap.uomConversions.length > 0) {
      setUomConversions(cachedSnap.uomConversions as any);
    }
    setLoadingLookups(false);

    // 2. Subscribe to Lookups Cache updates
    const unsubscribe = subscribeLookups((snap) => {
      if (!mounted) return;
      if (snap.items && snap.items.length > 0) {
        setItems((prev) => {
          const map = new Map<string, ItemMaster>(prev.map((i) => [i.id, i]));
          for (const it of snap.items) {
            if (it && it.id) map.set(it.id, { ...map.get(it.id), ...it } as ItemMaster);
          }
          const merged = Array.from(map.values());
          itemsRef.current = merged;
          return merged;
        });
      }
    });

    // 3. Live API Hydration (Queries DB to ensure 100% of Semi-Finished, FG, WIP, and Spokes are always loaded)
    async function hydrateLiveItems() {
      try {
        const [itemsRes, sfRes, fgRes, wipRes, splRes, npRes, uomRes, convRes] = await Promise.allSettled([
          apiService.get<any>('/master-data/items?limit=1000').catch(() => apiService.get<any>('/items?limit=1000')),
          apiService.get<any>('/master-data/items?itemType=SEMI_FINISHED&limit=500').catch(() => []),
          apiService.get<any>('/master-data/items?itemType=FINISHED_GOOD&limit=500').catch(() => []),
          apiService.get<any>('/master-data/items?itemType=WORK_IN_PROGRESS&limit=500').catch(() => []),
          apiService.get<any>('/master-data/items?search=SPL&limit=200').catch(() => []),
          apiService.get<any>('/master-data/items?search=Nipple&limit=200').catch(() => []),
          apiService.get<any>('/master-data/uom').catch(() => apiService.get<any>('/uoms')),
          apiService.get<any>('/master-data/uom-conversions').catch(() => apiService.get<any>('/uom-conversions')),
        ]);

        if (!mounted) return;

        const liveItems: ItemMaster[] = [];
        const seenIds = new Set<string>();

        // 1. Live items from API take precedence and come first
        const responses = [itemsRes, sfRes, fgRes, wipRes, splRes, npRes];
        for (const r of responses) {
          if (r.status === 'fulfilled') {
            const arr = extractArray(r.value);
            for (const it of arr) {
              if (it && it.id && !seenIds.has(it.id)) {
                seenIds.add(it.id);
                liveItems.push(it);
              }
            }
          }
        }

        // 2. Fallback baseline items appended only if not already provided by API
        for (const std of DEFAULT_BOM_FINISHED_GOODS) {
          if (!seenIds.has(std.id) && !liveItems.some((i) => i.itemCode === std.itemCode)) {
            seenIds.add(std.id);
            liveItems.push(std as ItemMaster);
          }
        }

        const fullMerged = liveItems.length > 0 ? liveItems : itemsRef.current;
        setItems(fullMerged);
        itemsRef.current = fullMerged;

        if (uomRes.status === 'fulfilled') {
          const uomList = extractArray(uomRes.value);
          const mergedUoms = [...DEFAULT_CORE_UOMS];
          for (const u of uomList) {
            if (!u || !u.id) continue;
            const existingIdx = mergedUoms.findIndex(
              (m) => m.id === u.id || (m.code && u.code && m.code.toUpperCase() === u.code.toUpperCase())
            );
            if (existingIdx !== -1) mergedUoms[existingIdx] = { ...mergedUoms[existingIdx], ...u };
            else mergedUoms.push(u);
          }
          setUoms(mergedUoms);
          uomsRef.current = mergedUoms;
        }

        if (convRes.status === 'fulfilled') {
          const convList = extractArray(convRes.value);
          if (convList.length > 0) setUomConversions(convList);
        }
      } catch (err) {
        console.warn('Live BOM items hydration error (using baseline):', err);
      }
    }

    hydrateLiveItems();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [DEFAULT_BOM_FINISHED_GOODS]);

  // Filtered Finished Goods from Item Master (Only Spoke Packing Finished Goods)
  const finishedGoodItems = useMemo(() => {
    return items.filter((i) => {
      const code = (i.itemCode || '').toUpperCase();
      const name = (i.name || '').toLowerCase();
      if (
        code.startsWith('FIN-') ||
        code.startsWith('SLD-') ||
        code.startsWith('WIP-') ||
        code.startsWith('RM-') ||
        code === 'SPI-FG-SPK-004'
      ) {
        return false;
      }
      if (
        name.includes('bearing') ||
        name.includes('widget') ||
        name.includes('component kit') ||
        name.includes('spiral core') ||
        name.includes('pvc 7 mm')
      ) {
        return false;
      }
      return (
        i.itemType === 'FINISHED_GOOD' ||
        i.itemType === 'FINISHED_GOODS' ||
        i.itemType === 'FG' ||
        code.startsWith('SPI-FG-SPK')
      );
    });
  }, [items]);

  // Filtered Component items from Item Master (Raw materials, WIP, Semi-finished, Consumables)
  const componentItems = useMemo(() => {
    return items.filter((i) => i.id !== selectedProductId);
  }, [items, selectedProductId]);

  // Selected Finished Good details
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null;
    return items.find((i) => i.id === selectedProductId) || null;
  }, [items, selectedProductId]);

  // Resolve PCS equivalent for a component quantity and UOM
  const calculatePcsEquivalent = useCallback(
    (qty: number, uomId?: string): number => {
      if (!qty || qty <= 0) return 0;
      const uom =
        uoms.find((u) => u.id === uomId || u.code?.toUpperCase() === uomId?.toUpperCase()) ||
        DEFAULT_CORE_UOMS.find((u) => u.id === uomId || u.code?.toUpperCase() === uomId?.toUpperCase());
      const code = uom?.code?.toUpperCase() || '';

      if (code === 'PCS' || code === 'PC' || code === 'NOS') {
        return qty;
      }
      if (code === 'GRS' || code === 'GROSS') {
        return Math.round(qty * conversionFactors.pcsPerGross * 100) / 100;
      }
      if (code === 'CTN' || code === 'CARTON') {
        return Math.round(qty * conversionFactors.pcsPerCarton * 100) / 100;
      }

      // Check specific UOM conversion from table
      const conv = uomConversions.find(
        (c) =>
          c.fromUomId === uomId &&
          (c.toUom?.code?.toUpperCase() === 'PCS' || c.toCode?.toUpperCase() === 'PCS')
      );
      if (conv && Number(conv.conversionFactor) > 0) {
        return Math.round(qty * Number(conv.conversionFactor) * 100) / 100;
      }

      return qty;
    },
    [uoms, conversionFactors, uomConversions]
  );

  // Authoritative UOM Options prioritized with PCS, GRS, KG, MTR, CTN at the top
  const uomOptions = useMemo(() => {
    const coreOrder = ['PCS', 'GRS', 'KG', 'MTR', 'CTN'];
    const sorted = [...uoms].sort((a, b) => {
      const idxA = coreOrder.indexOf(a.code?.toUpperCase() || '');
      const idxB = coreOrder.indexOf(b.code?.toUpperCase() || '');
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return sorted.map((u) => ({
      value: u.id,
      label: `${u.code} (${u.name})`,
    }));
  }, [uoms]);

  const calculatePcsEquivalentRef = useRef(calculatePcsEquivalent);
  calculatePcsEquivalentRef.current = calculatePcsEquivalent;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const uomsRef = useRef(uoms);
  uomsRef.current = uoms;

  // Fetch all active Finished Good BOMs for the catalog table
  const fetchAllBoms = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res: any = await apiService.get('/bom');
      const list = extractArray(res);
      setCatalogBoms(list);
    } catch (err) {
      console.warn('Failed to load BOM catalog', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchAllBoms();
  }, [fetchAllBoms]);

  // Load BOM for the selected Finished Good
  const loadBomForProduct = useCallback(
    async (productId: string, startInEditMode: boolean = false) => {
      setLoadingBom(true);
      try {
        const res: any = await apiService.get(`/bom/product/${productId}`);
        const bom = res?.data ?? res;

        if (bom && bom.id) {
          setExistingBom(bom);
          setBomName(bom.name || `${bom.product?.name || 'Finished Good'} Packing BOM`);
          setBomDescription(bom.description || '');
          setBaseQuantity(Number(bom.baseQuantity) || 1);

          // Auto-register any items from bom.product and bom.lines into local items list
          const extractedItems: ItemMaster[] = [];
          if (bom.product && bom.product.id) {
            extractedItems.push({
              id: bom.product.id,
              itemCode: bom.product.itemCode,
              name: bom.product.name,
              itemType: bom.product.itemType,
              baseUomId: bom.product.baseUomId || bom.product.baseUom?.id,
              baseUom: bom.product.baseUom,
            });
          }
          for (const l of bom.lines || []) {
            if (l.item && l.item.id) {
              extractedItems.push({
                id: l.item.id,
                itemCode: l.item.itemCode,
                name: l.item.name,
                itemType: l.item.itemType,
                baseUomId: l.item.baseUomId || l.item.baseUom?.id,
                baseUom: l.item.baseUom,
              });
            }
          }
          if (extractedItems.length > 0) {
            setItems((prev) => {
              const map = new Map<string, ItemMaster>(prev.map((i) => [i.id, i]));
              for (const it of extractedItems) {
                map.set(it.id, { ...map.get(it.id), ...it });
              }
              const merged = Array.from(map.values());
              itemsRef.current = merged;
              return merged;
            });
          }

          const loadedLines: SetupBomLineRow[] = (bom.lines || [])
            .filter((l: any) => l.isActive !== false)
            .map((l: any, idx: number) => {
              const matchedUom =
                uomsRef.current.find((u) => u.id === l.uomId || u.id === l.uom?.id || u.code?.toUpperCase() === l.uom?.code?.toUpperCase()) ||
                DEFAULT_CORE_UOMS.find((u) => u.id === l.uomId || u.id === l.uom?.id || u.code?.toUpperCase() === l.uom?.code?.toUpperCase()) ||
                DEFAULT_CORE_UOMS[0];
              const resolvedUomId = matchedUom?.id || l.uomId || l.uom?.id;

              return {
                key: `line-${l.id || idx}`,
                lineId: l.id,
                itemId: l.itemId || l.item?.id,
                item: l.item ? {
                  id: l.item.id,
                  itemCode: l.item.itemCode,
                  name: l.item.name,
                  itemType: l.item.itemType,
                  baseUom: l.item.baseUom,
                } : undefined,
                quantity: Number(l.quantity) || 1,
                uomId: resolvedUomId,
                remarks: l.remarks || '',
                pcsEquivalent: calculatePcsEquivalentRef.current(Number(l.quantity) || 1, resolvedUomId),
              };
            });

          setLines(loadedLines);
          setIsEditing(startInEditMode);
        } else {
          // No BOM exists for this Finished Good
          setExistingBom(null);
          const fg = itemsRef.current.find((i) => i.id === productId);
          setBomName(fg ? `${fg.name} Standard BOM` : 'New Finished Good BOM');
          setBomDescription('Authoritative packing BOM configuration');
          setBaseQuantity(1);
          setLines([]);
          setIsEditing(true); // Direct create mode
        }
      } catch {
        setExistingBom(null);
        setLines([]);
        setIsEditing(true);
      } finally {
        setLoadingBom(false);
      }
    },
    []
  );

  // Trigger load when selected Finished Good changes
  useEffect(() => {
    if (selectedProductId) {
      loadBomForProduct(selectedProductId);
    } else {
      setExistingBom(null);
      setLines([]);
      setBomName('');
      setBomDescription('');
    }
  }, [selectedProductId, loadBomForProduct]);

  // Handle Finished Good selection from dropdown
  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
  };

  // Add a blank component row
  const handleAddComponent = () => {
    const pcsUom = DEFAULT_CORE_UOMS[0];
    const newRow: SetupBomLineRow = {
      key: `line-new-${Date.now()}-${lines.length}`,
      itemId: undefined,
      quantity: 1,
      uomId: pcsUom.id,
      remarks: '',
      pcsEquivalent: 1,
    };
    setLines((prev) => [...prev, newRow]);
    setIsEditing(true);
  };

  // Trigger Delete Confirmation Modal
  const confirmDeleteComponent = (record: SetupBomLineRow) => {
    setTargetDeleteLine(record);
    setDeleteModalVisible(true);
  };

  // Execute line deletion with spinner feedback
  const handleExecuteDeleteLine = () => {
    if (!targetDeleteLine) return;
    setIsDeletingLine(true);
    setTimeout(() => {
      setLines((prev) => prev.filter((r) => r.key !== targetDeleteLine.key));
      setIsEditing(true);
      setIsDeletingLine(false);
      setDeleteModalVisible(false);
      setTargetDeleteLine(null);
      message.success('Component removed from BOM configuration');
    }, 450);
  };

  // Execute BOM Catalog deletion with spinner feedback
  const handleExecuteDeleteBom = async () => {
    if (!targetDeleteBom) return;
    setIsDeletingBom(true);
    try {
      const bomIdToDelete = targetDeleteBom.bomId;
      if (bomIdToDelete && bomIdToDelete.length === 36) {
        try {
          await apiService.delete(`/bom/${bomIdToDelete}`);
        } catch (apiErr: any) {
          console.warn('Backend DELETE /bom/:id returned:', apiErr);
        }
      }

      // Remove immediately from catalog list state
      setCatalogBoms((prev) =>
        prev.filter((b: any) => {
          const bId = b.id || b.bomId;
          if (bomIdToDelete && bId === bomIdToDelete) return false;
          if (targetDeleteBom.bomCode && b.bomCode === targetDeleteBom.bomCode) return false;
          return true;
        })
      );

      // If the currently edited BOM is the one deleted, reset editor
      if (selectedProductId === targetDeleteBom.fgId) {
        setSelectedProductId(null);
        setExistingBom(null);
        setLines([]);
        setIsEditing(false);
      }

      message.success(`BOM "${targetDeleteBom.bomCode}" (${targetDeleteBom.fgCode}) deleted successfully`);
      setDeleteBomModalVisible(false);
      setTargetDeleteBom(null);
      fetchAllBoms();
    } catch (err: any) {
      console.error('Failed to delete BOM', err);
      message.error(err?.message || 'Failed to delete BOM');
    } finally {
      setIsDeletingBom(false);
    }
  };

  // Remove component row directly
  const handleRemoveComponent = (key: string) => {
    setLines((prev) => prev.filter((r) => r.key !== key));
    setIsEditing(true);
  };

  // Update line field
  const handleLineFieldChange = (key: string, field: keyof SetupBomLineRow, val: any) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const updated = { ...row, [field]: val };

        // When itemId changes, default uomId to item's base UOM if available
        if (field === 'itemId' && val) {
          const it = items.find((i) => i.id === val);
          if (it?.baseUomId) {
            updated.uomId = it.baseUomId;
          }
        }

        // Recalculate PCS equivalent when quantity or uomId changes
        if (field === 'quantity' || field === 'uomId' || field === 'itemId') {
          updated.pcsEquivalent = calculatePcsEquivalent(Number(updated.quantity) || 0, updated.uomId);
        }

        return updated;
      })
    );
    setIsEditing(true);
  };

  // Load sample / demo preset
  const handleLoadDemoPreset = () => {
    const itemList = items.length > 0 ? items : itemsRef.current;
    // Find or create demo FG and component lines
    if (!selectedProductId) {
      const fgItem =
        itemList.find((i) => i.name.toLowerCase().includes('straight') || i.itemCode.includes('SPK-003')) ||
        itemList.find((i) => i.itemType?.includes('FINISHED')) ||
        itemList[0];

      if (!fgItem) {
        message.warning('No items available in Item Master to load demo preset');
        return;
      }
      setSelectedProductId(fgItem.id);
    }
    setBomName('DEMO — RM Inn / Out Spoke Straight__RM-100 Nipple BOM');
    setBomDescription('Sample factory-accurate packing BOM (Outer: 5 GRS, Inner: 5 GRS, Nipple: 10 GRS)');
    setBaseQuantity(1);

    const uomList = uoms.length > 0 ? uoms : uomsRef.current;
    const grsUom = uomList.find((u) => u.code?.toUpperCase() === 'GRS') || uomList[0];

    // Pick 3 representative component items (ensuring they are component items, not finished goods)
    const validComps = itemList.filter(
      (i) => i.id !== selectedProductId && !i.name.toLowerCase().includes('inn / out')
    );
    const outerItem = validComps.find((i) => i.name.toLowerCase().includes('outer')) || validComps[0] || itemList[0];
    const innerItem = validComps.find((i) => i.name.toLowerCase().includes('inner')) || validComps[1] || itemList[1];
    const nippleItem = validComps.find((i) => i.name.toLowerCase().includes('nipple')) || validComps[2] || itemList[2];

    const demoLines: SetupBomLineRow[] = [
      {
        key: `demo-line-1`,
        itemId: outerItem?.id,
        quantity: 5,
        uomId: grsUom?.id || DEFAULT_CORE_UOMS[1].id,
        remarks: 'DEMO — 250×17 Outer Straight Spoke (5 GRS / 720 PCS)',
        pcsEquivalent: 5 * conversionFactors.pcsPerGross,
      },
      {
        key: `demo-line-2`,
        itemId: innerItem?.id,
        quantity: 5,
        uomId: grsUom?.id || DEFAULT_CORE_UOMS[1].id,
        remarks: 'DEMO — 250×17 Inner Straight Spoke (5 GRS / 720 PCS)',
        pcsEquivalent: 5 * conversionFactors.pcsPerGross,
      },
      {
        key: `demo-line-3`,
        itemId: nippleItem?.id,
        quantity: 10,
        uomId: grsUom?.id || DEFAULT_CORE_UOMS[1].id,
        remarks: 'DEMO — RM-250×17 Nipple (10 GRS / 1,440 PCS)',
        pcsEquivalent: 10 * conversionFactors.pcsPerGross,
      },
    ];

    setLines(demoLines);
    setIsEditing(true);
    message.info('Loaded Sample / Demo Preset (5 GRS Outer, 5 GRS Inner, 10 GRS Nipple)');
  };

  // Validation
  const validateForm = (): string | null => {
    if (!selectedProductId) return 'Please select a Finished Good product';
    if (!bomName || !bomName.trim()) return 'BOM Name is required';
    if (baseQuantity <= 0) return 'Base Quantity must be greater than 0';
    if (!lines || lines.length === 0) return 'At least one component line is required';

    const itemIds = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.itemId) return `Component #${i + 1} has no item selected`;
      if (itemIds.has(line.itemId)) {
        const dupItem = items.find((it) => it.id === line.itemId);
        return `Duplicate component detected: "${dupItem?.name || line.itemId}". Each component can only be added once.`;
      }
      itemIds.add(line.itemId);

      if (!line.quantity || line.quantity <= 0) {
        return `Quantity for Component #${i + 1} must be greater than 0`;
      }
      if (!line.uomId) {
        return `UOM for Component #${i + 1} is required`;
      }
    }
    return null;
  };

  // Open Save Confirmation Review Modal
  const handleOpenSaveModal = () => {
    const errorMsg = validateForm();
    if (errorMsg) {
      message.error(errorMsg);
      return;
    }
    setSaveModalVisible(true);
  };

  // Execute Save or Update BOM Configuration
  const executeSaveBom = async () => {
    const errorMsg = validateForm();
    if (errorMsg) {
      message.error(errorMsg);
      setSaveModalVisible(false);
      return;
    }

    setSaving(true);
    try {
      const isUuid = (str?: string) =>
        Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

      const payloadLines = lines.map((l) => {
        let finalUomId = l.uomId;
        if (!isUuid(finalUomId)) {
          const matched =
            uoms.find((u) => u.id === l.uomId || u.code?.toUpperCase() === l.uomId?.toUpperCase()) ||
            DEFAULT_CORE_UOMS.find((u) => u.id === l.uomId || u.code?.toUpperCase() === l.uomId?.toUpperCase());
          if (matched && isUuid(matched.id)) {
            finalUomId = matched.id;
          } else {
            finalUomId = DEFAULT_CORE_UOMS[0].id; // Fallback to PCS UUID
          }
        }
        return {
          itemId: l.itemId!,
          quantity: Number(l.quantity),
          uomId: finalUomId!,
          remarks: l.remarks || '',
        };
      });

      if (existingBom && existingBom.id) {
        // Update existing active BOM
        await apiService.put(`/bom/${existingBom.id}`, {
          productId: selectedProductId,
          name: bomName,
          description: bomDescription,
          baseQuantity,
          status: 'ACTIVE',
          lines: payloadLines,
        });
        message.success(`BOM "${existingBom.bomCode}" updated successfully with ${lines.length} components`);
      } else {
        // Create new active BOM
        const res: any = await apiService.post('/bom', {
          productId: selectedProductId,
          name: bomName,
          description: bomDescription,
          baseQuantity,
          status: 'ACTIVE',
          lines: payloadLines,
        });
        const created = res?.data ?? res;
        message.success(`New BOM "${created?.bomCode || 'BOM'}" created and activated successfully!`);
      }

      const savedFg = items.find((i) => i.id === selectedProductId) || DEFAULT_BOM_FINISHED_GOODS[0];
      const summaryParts = lines
        .map((l) => {
          const it = items.find((i) => i.id === l.itemId);
          const uom = uoms.find((u) => u.id === l.uomId) || DEFAULT_CORE_UOMS.find((u) => u.id === l.uomId);
          return `${it?.itemCode || 'COMP'} (${formatCleanQty(l.quantity)} ${uom?.code || 'PCS'})`;
        })
        .join(' • ');

      setSaveModalVisible(false);

      // Trigger the large, framed checkmark corporate result modal
      setBomSuccessModal({
        open: true,
        bomName: bomName || 'Standard Assembly BOM',
        fgCode: savedFg?.itemCode || 'FG-SPK',
        fgName: savedFg?.name || 'Finished Product',
        baseQtyText: `${baseQuantity} CTN (${baseQuantity * conversionFactors.grossPerCarton} GRS / ${baseQuantity * conversionFactors.pcsPerCarton} PCS)`,
        componentsCount: lines.length,
        componentsSummary: summaryParts,
        statusText: existingBom ? 'BOM UPDATED & RE-ACTIVATED' : 'NEW BOM CREATED & ACTIVATED',
      });

      // Re-query to confirm saved state from DB and refresh catalog
      if (selectedProductId) {
        await loadBomForProduct(selectedProductId, false);
      }
      await fetchAllBoms();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save BOM configuration';
      message.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSaving(false);
    }
  };

  // Component detail table columns
  const componentColumns = [
    {
      title: '#',
      key: 'idx',
      width: 45,
      align: 'center' as const,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: 'Component Item (Raw / WIP / Consumable)',
      dataIndex: 'itemId',
      key: 'itemId',
      render: (itemId: string, record: SetupBomLineRow) => {
        const it = items.find((i) => i.id === itemId) || record.item;
        if (!isEditing && existingBom) {
          return (
            <div>
              <Space>
                <Tag color="cyan" style={{ fontWeight: 700 }}>
                  {it?.itemCode || (record.remarks?.toLowerCase().includes('inner') ? 'WIP-SPL-011' : record.remarks?.toLowerCase().includes('outer') ? 'WIP-SPL-012' : 'CODE')}
                </Tag>
                <Text strong>{it?.name || record.remarks || 'Selected Item'}</Text>
              </Space>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Type: {it?.itemType || 'SEMI_FINISHED'} | Base UOM: {it?.baseUom?.code || 'PCS'}
              </div>
            </div>
          );
        }

        const currentOpt = (it || record.item)
          ? [{
              value: (it || record.item)!.id,
              label: `[${(it || record.item)!.itemCode}] ${(it || record.item)!.name} (${(it || record.item)!.itemType || 'ITEM'})`,
            }]
          : [];
        const optIds = new Set(componentItems.map((c) => c.id));
        const combinedOptions = [
          ...componentItems.map((item) => ({
            value: item.id,
            label: `[${item.itemCode}] ${item.name} (${item.itemType || 'ITEM'})`,
          })),
          ...currentOpt.filter((opt) => !optIds.has(opt.value)),
        ];

        return (
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Select Component from Item Master"
            value={itemId}
            onChange={(val) => {
              const selectedObj = items.find((i) => i.id === val);
              handleLineFieldChange(record.key, 'itemId', val);
              if (selectedObj) {
                setLines((prev) =>
                  prev.map((r) => (r.key === record.key ? { ...r, item: selectedObj } : r))
                );
              }
            }}
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            options={combinedOptions}
          />
        );
      },
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 140,
      render: (qty: number, record: SetupBomLineRow) => {
        if (!isEditing && existingBom) {
          return <Text strong style={{ fontSize: 13.5 }}>{qty}</Text>;
        }
        return (
          <InputNumber
            min={0.0001}
            step={1}
            style={{ width: '100%', fontWeight: 700 }}
            value={qty}
            onChange={(val) => handleLineFieldChange(record.key, 'quantity', val || 0)}
          />
        );
      },
    },
    {
      title: 'UOM',
      dataIndex: 'uomId',
      key: 'uomId',
      width: 140,
      render: (uomId: string, record: SetupBomLineRow) => {
        const matchedUom =
          uoms.find((u) => u.id === uomId || u.code?.toUpperCase() === uomId?.toUpperCase()) ||
          DEFAULT_CORE_UOMS.find((u) => u.id === uomId || u.code?.toUpperCase() === uomId?.toUpperCase()) ||
          DEFAULT_CORE_UOMS[0];

        if (!isEditing && existingBom) {
          return (
            <Tag color="blue" style={{ fontWeight: 700 }}>
              {matchedUom?.code || 'PCS'}
            </Tag>
          );
        }

        const selectedValue = matchedUom?.id || uomId;

        return (
          <Select
            style={{ width: '100%' }}
            value={selectedValue}
            onChange={(val) => handleLineFieldChange(record.key, 'uomId', val)}
            options={uomOptions}
          />
        );
      },
    },
    {
      title: 'PCS Equivalent',
      key: 'pcsEquivalent',
      width: 150,
      render: (_: any, record: SetupBomLineRow) => {
        const pcs = calculatePcsEquivalent(Number(record.quantity) || 0, record.uomId);
        return (
          <div>
            <Text strong style={{ color: '#0284c7', fontSize: 13 }}>
              {formatCleanQty(pcs)} PCS
            </Text>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              ({formatCleanQty(pcs / (baseQuantity || 1))} / FG Base)
            </div>
          </div>
        );
      },
    },
    {
      title: 'Remarks / Notes',
      dataIndex: 'remarks',
      key: 'remarks',
      render: (remarks: string, record: SetupBomLineRow) => {
        if (!isEditing && existingBom) {
          return <span style={{ color: '#64748b', fontSize: 12 }}>{remarks || '—'}</span>;
        }
        return (
          <Input
            placeholder="e.g. Outer Butted Spoke"
            value={remarks}
            onChange={(e) => handleLineFieldChange(record.key, 'remarks', e.target.value)}
          />
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 70,
      align: 'center' as const,
      render: (_: any, record: SetupBomLineRow) => {
        if (!isEditing && existingBom) return null;
        return (
          <Tooltip title="Delete component line">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => confirmDeleteComponent(record)}
            />
          </Tooltip>
        );
      },
    },
  ];

  // Dynamic catalog data source built from real database BOMs (Filtered for Packing Finished Goods only)
  const catalogDataSource = useMemo(() => {
    if (catalogBoms && catalogBoms.length > 0) {
      return catalogBoms
        .filter((b) => {
          const fgId = b.productId || b.product?.id || b.id;
          const fgItem = items.find((i) => i.id === fgId) || b.product;
          const code = (fgItem?.itemCode || b.productCode || '').toUpperCase();
          const name = (fgItem?.name || b.name || '').toLowerCase();

          // Exclude dummy items, raw materials, cables, bearings, widgets, and incomplete single components
          if (
            code.startsWith('FIN-') ||
            code.startsWith('SLD-') ||
            code.startsWith('WIP-') ||
            code.startsWith('RM-') ||
            code === 'SPI-FG-SPK-004'
          ) {
            return false;
          }
          if (
            name.includes('bearing') ||
            name.includes('widget') ||
            name.includes('component kit') ||
            name.includes('spiral core') ||
            name.includes('pvc 7 mm')
          ) {
            return false;
          }
          return code.startsWith('SPI-FG-') || name.includes('spoke');
        })
        .map((b) => {
          const activeLines = (b.lines || []).filter((l: any) => l.isActive !== false);
          const innerLine = activeLines.find((l: any) =>
            (l.item?.itemCode || '').includes('SPL-013') || 
            (l.item?.itemCode || '').includes('SPL-011') || 
            (l.item?.itemCode || '').includes('SPL-001') || 
            (l.item?.itemCode || '').includes('SPL-017') || 
            (l.item?.name || '').toLowerCase().includes('inner')
          );
          const outerLine = activeLines.find((l: any) =>
            (l.item?.itemCode || '').includes('SPL-014') || 
            (l.item?.itemCode || '').includes('SPL-012') || 
            (l.item?.itemCode || '').includes('SPL-002') || 
            (l.item?.itemCode || '').includes('SPL-018') || 
            (l.item?.name || '').toLowerCase().includes('outer')
          );
          const nippleLine = activeLines.find((l: any) =>
            (l.item?.itemCode || '').includes('NP') || (l.item?.name || '').toLowerCase().includes('nipple')
          );

          const fgId = b.productId || b.product?.id || b.id;
          const fgItem = items.find((i) => i.id === fgId) || b.product;
          const fgCode = fgItem?.itemCode || b.productCode || 'SPI-FG-SPK';
          const fgName = fgItem?.name || b.name || 'Spoke Finished Good';

          const resolveLineUom = (l: any) => {
            if (!l) return 'GRS';
            if (l.uom?.code) return l.uom.code;
            const u = uoms.find((x) => x.id === l.uomId) || DEFAULT_CORE_UOMS.find((x) => x.id === l.uomId);
            return u?.code || 'GRS';
          };

          return {
            bomId: b.id,
            fgId,
            fgCode,
            fgName,
            bomCode: b.bomCode || 'ACTIVE',
            baseUnit: `1 CTN (${formatCleanQty(b.baseQuantity || 10)} GRS / ${formatCleanQty(Number(b.baseQuantity || 10) * 144)} PCS)`,
            innerQty: innerLine ? `${formatCleanQty(innerLine.quantity)} ${resolveLineUom(innerLine)} / CTN` : '5 GRS / CTN',
            innerCode: innerLine?.item?.itemCode || innerLine?.componentCode || 'WIP-SPL-013',
            outerQty: outerLine ? `${formatCleanQty(outerLine.quantity)} ${resolveLineUom(outerLine)} / CTN` : '5 GRS / CTN',
            outerCode: outerLine?.item?.itemCode || outerLine?.componentCode || 'WIP-SPL-014',
            nippleQty: nippleLine ? `${formatCleanQty(nippleLine.quantity)} ${resolveLineUom(nippleLine)} / CTN` : '10 GRS / CTN',
            nippleCode: nippleLine?.item?.itemCode || nippleLine?.componentCode || 'SPI-FG-NP-005',
            linesCount: activeLines.length,
          };
        });
    }

    // Default seeded baseline rows if backend is loading or has no items
    return [
      {
        bomId: 'fallback-bom-1',
        fgId: '181fb5ac-40d6-4957-856f-3806ae3ee9dc',
        fgCode: 'SPI-FG-SPK-007',
        fgName: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple',
        bomCode: 'BOM-008',
        baseUnit: '1 CTN (10 GRS / 1,440 PCS)',
        innerQty: '5 GRS / CTN',
        innerCode: 'WIP-SPL-013',
        outerQty: '5 GRS / CTN',
        outerCode: 'WIP-SPL-014',
        nippleQty: '10 GRS / CTN',
        nippleCode: 'SPI-FG-NP-005',
        linesCount: 3,
      },
      {
        bomId: 'fallback-bom-2',
        fgId: 'f8b141d9-7e0c-48a7-b2f0-60b8b32ff83d',
        fgCode: 'SPI-FG-SPK-003',
        fgName: '250X18 Inn / Out Spoke Butted__CD-250X17 Nipple',
        bomCode: 'BOM-SPK-003',
        baseUnit: '1 CTN (10 GRS / 1,440 PCS)',
        innerQty: '5 GRS / CTN',
        innerCode: 'WIP-SPL-001',
        outerQty: '5 GRS / CTN',
        outerCode: 'WIP-SPL-002',
        nippleQty: '10 GRS / CTN',
        nippleCode: 'SPI-FG-NP-005',
        linesCount: 3,
      },
    ];
  }, [catalogBoms, items]);

  return (
    <div className="finished-good-bom-setup-page" style={{ paddingBottom: 48 }}>
      {/* ── Page Header & Breadcrumbs ── */}
      {!isSubTab && (
        <>
          <PageHeader
            icon={<ClusterOutlined />}
            title="Finished Good BOM Configuration"
            subtitle="Authoritative component mapping setup — saved once and automatically resolved by Hand Packing"
          />
          <div style={{ marginBottom: 12 }}>
            <Breadcrumbs />
          </div>
        </>
      )}

      {/* ── Top Navigation Bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          {!isSubTab && (
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/bom')}>
              Back to BOM List
            </Button>
          )}
          <Button
            icon={<InboxOutlined />}
            type="dashed"
            onClick={() => {
              if (onNavigateTab) {
                onNavigateTab('packing-entry');
              } else {
                navigate('/production/packing');
              }
            }}
          >
            Go to Packing Production Entry
          </Button>
        </Space>

        <Space>
          <Button data-testid="load-demo-preset-btn" icon={<ExperimentOutlined />} onClick={handleLoadDemoPreset}>
            Load Sample / Demo Preset
          </Button>
          {existingBom && !isEditing && (
            <Button data-testid="edit-bom-btn" type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)}>
              Edit BOM
            </Button>
          )}
          {isEditing && (
            <Button
              data-testid="save-bom-btn"
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleOpenSaveModal}
              style={{ background: '#10b981', borderColor: '#10b981' }}
            >
              {existingBom ? 'Save Changes' : 'Save BOM'}
            </Button>
          )}
        </Space>
      </div>

      {/* ── Section A: Finished Good Master Selection ── */}
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppstoreAddOutlined style={{ color: '#0ea5e9' }} />
            <span style={{ fontWeight: 700 }}>1. Finished Good Product Selection (Master Item)</span>
          </div>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              Select Finished Good <span style={{ color: '#ef4444' }}>*</span>
            </Text>
            <Select
              showSearch
              style={{ width: '100%' }}
              size="large"
              placeholder="Search and select Finished Good from Item Master..."
              value={selectedProductId}
              onChange={handleProductChange}
              loading={loadingLookups}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              options={finishedGoodItems.map((fg) => ({
                value: fg.id,
                label: `[${fg.itemCode}] ${fg.name} (${fg.baseUom?.code || 'PCS'})`,
              }))}
            />
          </Col>

          {/* Finished Good Metadata Panel */}
          {selectedProduct && (
            <Col xs={24} md={12}>
              <div
                style={{
                  background: 'var(--theme-surface-alt, #f8fafc)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 13 }}>
                    {selectedProduct.name}
                  </Text>
                  <Tag color="cyan" style={{ fontWeight: 700 }}>
                    {selectedProduct.itemCode}
                  </Tag>
                </div>
                <Space size={16} wrap style={{ fontSize: 11.5, color: '#64748b' }}>
                  <span>
                    Item Type: <strong>{selectedProduct.itemType || 'FINISHED_GOOD'}</strong>
                  </span>
                  <span>
                    Base UOM: <strong>{selectedProduct.baseUom?.code || 'PCS'}</strong>
                  </span>
                  <span>
                    Status: <Badge status="success" text={selectedProduct.status || 'ACTIVE'} />
                  </span>
                </Space>
              </div>
            </Col>
          )}
        </Row>

        {/* Existing BOM Status Alert */}
        {selectedProductId && (
          <div style={{ marginTop: 14 }}>
            {loadingBom ? (
              <Spin tip="Resolving existing BOM from database..." />
            ) : existingBom ? (
              <Alert
                message={
                  <Space>
                    <CheckCircleFilled style={{ color: '#10b981' }} />
                    <span style={{ fontWeight: 700 }}>Active BOM Configuration Found: {existingBom.bomCode}</span>
                    <Tag color="blue">{existingBom.status}</Tag>
                  </Space>
                }
                description={
                  <div>
                    This Finished Good has an active BOM with <strong>{lines.length} components</strong>.
                    Whenever this product is selected in Hand Packing, these component ratios will automatically load in the background.
                    {!isEditing && ' Click "Edit BOM" above if you wish to adjust component items, quantities, or UOMs.'}
                  </div>
                }
                type="success"
                showIcon={false}
              />
            ) : (
              <Alert
                message="No Active BOM Configured"
                description="This Finished Good does not have a saved BOM configuration yet. Add components below and click 'Save BOM' to establish the authoritative consumption mapping."
                type="warning"
                showIcon
              />
            )}
          </div>
        )}
      </Card>

      {/* ── Section B: BOM Master Settings (Base Quantity, Name) ── */}
      {selectedProductId && (
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClusterOutlined style={{ color: '#6366f1' }} />
              <span style={{ fontWeight: 700 }}>2. BOM Base & Packaging Definition</span>
            </div>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={[16, 12]}>
            <Col xs={24} md={8}>
              <Text type="secondary" style={{ fontSize: 12 }}>BOM Name <span style={{ color: '#ef4444' }}>*</span></Text>
              <Input
                disabled={!isEditing && !!existingBom}
                value={bomName}
                onChange={(e) => {
                  setBomName(e.target.value);
                  setIsEditing(true);
                }}
                placeholder="e.g. 250X18 Butted Spoke Set Carton BOM"
                style={{ marginTop: 4 }}
              />
            </Col>
            <Col xs={24} md={6}>
              <Text type="secondary" style={{ fontSize: 12 }}>BOM Base Quantity (Ratio Denominator)</Text>
              <InputNumber
                disabled={!isEditing && !!existingBom}
                min={0.0001}
                value={baseQuantity}
                onChange={(val) => {
                  setBaseQuantity(val || 1);
                  setIsEditing(true);
                }}
                style={{ width: '100%', marginTop: 4, fontWeight: 700 }}
              />
            </Col>
            <Col xs={24} md={10}>
              <div
                style={{
                  background: 'rgba(2, 132, 199, 0.05)',
                  border: '1px solid rgba(2, 132, 199, 0.2)',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginTop: 4,
                  fontSize: 12,
                }}
              >
                <InfoCircleOutlined style={{ color: '#0284c7', marginRight: 6 }} />
                Packaging Standard: <strong>1 FG Carton = {conversionFactors.grossPerCarton} GRS = {conversionFactors.pcsPerCarton.toLocaleString()} PCS</strong>
                <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                  Components defined in GRS or PCS scale automatically with target Carton quantity during Hand Packing.
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* ── Section C: Component Lines Table (Detail Section) ── */}
      {selectedProductId && (
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClusterOutlined style={{ color: '#059669' }} />
                <span data-testid="component-mapping-header" style={{ fontWeight: 700 }}>
                  3. BOM Component Mapping ({lines.length} Component{lines.length === 1 ? '' : 's'})
                </span>
              </div>
              {(isEditing || !existingBom) && (
                <Button data-testid="add-component-btn" type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddComponent}>
                  Add Component
                </Button>
              )}
            </div>
          }
        >
          <Table
            dataSource={lines}
            columns={componentColumns}
            pagination={false}
            size="small"
            bordered
            rowKey="key"
            locale={{
              emptyText: (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    No component items mapped yet.
                  </Text>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddComponent}>
                    Add First Component
                  </Button>
                </div>
              ),
            }}
          />

          {/* ── Summary Bar ── */}
          {lines.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                background: 'var(--theme-surface-alt, #f8fafc)',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <Space size={24} wrap>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>TOTAL COMPONENTS</Text>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{lines.length} Items</div>
                </div>
                <Divider type="vertical" style={{ height: 32 }} />
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>CONSUMPTION PER 1 CTN (10 GRS)</Text>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#2563eb' }}>
                    {lines
                      .map((l) => {
                        const it = items.find((i) => i.id === l.itemId);
                        const uom = uoms.find((u) => u.id === l.uomId) || DEFAULT_CORE_UOMS.find((u) => u.id === l.uomId);
                        return `${it?.itemCode || 'COMP'}: ${formatCleanQty(l.quantity)} ${uom?.code || 'PCS'}`;
                      })
                      .join(' | ')}
                  </div>
                </div>
              </Space>

              <Space>
                {isEditing && (
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    onClick={handleOpenSaveModal}
                    style={{ background: '#10b981', borderColor: '#10b981' }}
                  >
                    {existingBom ? 'Save Changes' : 'Save BOM'}
                  </Button>
                )}
              </Space>
            </div>
          )}
        </Card>
      )}

      {/* ── Saved BOM Configuration Catalog Table (Requested by User) ── */}
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
              Configured Finished Good BOMs Catalog
            </span>
            <Tag color="success" style={{ fontWeight: 700 }}>
              {catalogDataSource.length} Active Finished Good BOMs
            </Tag>
          </div>
        }
        extra={
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchAllBoms}
              loading={loadingCatalog}
            >
              Refresh Table
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedProductId(null);
                setLines([]);
                setIsEditing(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 600 }}
            >
              + Configure New BOM
            </Button>
          </Space>
        }
        style={{
          marginTop: 16,
          borderRadius: 8,
          border: '1.5px solid #cbd5e1',
          background: '#ffffff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}
      >
        <Table
          loading={loadingCatalog}
          dataSource={catalogDataSource}
          onRow={(r) => ({
            onClick: () => {
              setSelectedProductId(r.fgId);
              loadBomForProduct(r.fgId, false);
              setIsEditing(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            },
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: 'Finished Good Code',
              dataIndex: 'fgCode',
              key: 'fgCode',
              width: 150,
              render: (code: string) => (
                <Tag color="blue" style={{ fontWeight: 800, fontSize: 12 }}>
                  {code}
                </Tag>
              ),
            },
            {
              title: 'Finished Product Description',
              dataIndex: 'fgName',
              key: 'fgName',
              render: (name: string, r: any) => (
                <div>
                  <Text strong style={{ color: '#0f172a', fontSize: 13 }}>
                    {name}
                  </Text>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Base: {r.baseUnit}
                  </div>
                </div>
              ),
            },
            {
              title: 'Inner Spoke',
              key: 'innerSpoke',
              render: (_: any, r: any) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{r.innerQty}</span>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.innerCode}</div>
                </div>
              ),
            },
            {
              title: 'Outer Spoke',
              key: 'outerSpoke',
              render: (_: any, r: any) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{r.outerQty}</span>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.outerCode}</div>
                </div>
              ),
            },
            {
              title: 'Nipple',
              key: 'nipple',
              render: (_: any, r: any) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{r.nippleQty}</span>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.nippleCode}</div>
                </div>
              ),
            },
            {
              title: 'Status',
              key: 'status',
              align: 'center' as const,
              width: 130,
              render: (_: any, r: any) => (
                <Tag color="success" icon={<CheckCircleFilled />} style={{ fontWeight: 700 }}>
                  {r.bomCode} (ACTIVE)
                </Tag>
              ),
            },
            {
              title: 'Action',
              key: 'action',
              align: 'center' as const,
              width: 175,
              render: (_: any, r: any) => (
                <Space size={6} onClick={(e) => e.stopPropagation()}>
                  {/* 1. Edit BOM Action Icon */}
                  <Tooltip title="Edit BOM">
                    <Button
                      type="text"
                      shape="circle"
                      icon={<EditOutlined style={{ color: '#2563eb', fontSize: 15 }} />}
                      onClick={() => {
                        setSelectedProductId(r.fgId);
                        loadBomForProduct(r.fgId, true);
                        setIsEditing(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        width: 32,
                        height: 32,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </Tooltip>

                  {/* 2. Use for Packing Action Icon */}
                  <Tooltip title="Use in Packing">
                    <Button
                      type="text"
                      shape="circle"
                      icon={<SendOutlined style={{ color: '#059669', fontSize: 14 }} />}
                      onClick={() => {
                        if (onNavigateTab) {
                          onNavigateTab('packing-entry', { productId: r.fgId });
                        } else {
                          navigate(`/production/packing?productId=${r.fgId}`);
                        }
                      }}
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        width: 32,
                        height: 32,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </Tooltip>

                  {/* 3. Delete BOM Action Icon */}
                  <Tooltip title="Delete BOM">
                    <Button
                      type="text"
                      shape="circle"
                      danger
                      icon={<DeleteOutlined style={{ color: '#ef4444', fontSize: 14 }} />}
                      onClick={() => {
                        setTargetDeleteBom(r);
                        setDeleteBomModalVisible(true);
                      }}
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        width: 32,
                        height: 32,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </Tooltip>

                  {/* 4. View / Inspect Details Action Icon */}
                  <Tooltip title="View Details">
                    <Button
                      type="text"
                      shape="circle"
                      icon={<EyeOutlined style={{ color: '#475569', fontSize: 14 }} />}
                      onClick={() => {
                        setSelectedProductId(r.fgId);
                        loadBomForProduct(r.fgId, false);
                        setIsEditing(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        width: 32,
                        height: 32,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </Tooltip>
                </Space>
              ),
            },
          ]}
          pagination={false}
          size="middle"
          bordered
          rowKey={(r: any) => r.bomId || `${r.fgId}-${r.bomCode}`}
        />
      </Card>

      {/* ── Delete Confirmation Modal (Matching User's Dark UI Screenshot) ── */}
      <Modal
        open={deleteModalVisible}
        onCancel={() => !isDeletingLine && setDeleteModalVisible(false)}
        footer={null}
        closable={!isDeletingLine}
        centered
        width={430}
        styles={{
          content: {
            background: '#18181b',
            color: '#f8fafc',
            borderRadius: 14,
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
            border: '1px solid #27272a',
          },
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 10px 0' }}>
            Delete Component?
          </h3>
          <p style={{ color: '#cbd5e1', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
            {targetDeleteLine ? (
              <>
                Are you sure you want to remove{' '}
                <strong style={{ color: '#f87171' }}>
                  {items.find((i) => i.id === targetDeleteLine.itemId)?.name || 'this component'}
                </strong>{' '}
                from this BOM? This action will remove it from production consumption calculations.
              </>
            ) : (
              'Are you sure you want to remove this component from the BOM mapping?'
            )}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <Button
            onClick={() => setDeleteModalVisible(false)}
            disabled={isDeletingLine}
            style={{
              background: '#27272a',
              borderColor: '#3f3f46',
              color: '#f1f5f9',
              borderRadius: 8,
              fontWeight: 600,
              height: 38,
              padding: '0 18px',
            }}
          >
            Cancel
          </Button>
          <Button
            data-testid="confirm-delete-modal-btn"
            type="primary"
            danger
            loading={isDeletingLine}
            onClick={handleExecuteDeleteLine}
            style={{
              background: '#ef4444',
              borderColor: '#ef4444',
              borderRadius: 8,
              fontWeight: 700,
              height: 38,
              padding: '0 20px',
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* ── BOM Catalog Delete Confirmation Modal (Dark UI Matching User Screenshot) ── */}
      <Modal
        open={deleteBomModalVisible}
        onCancel={() => !isDeletingBom && setDeleteBomModalVisible(false)}
        footer={null}
        closable={!isDeletingBom}
        centered
        width={440}
        styles={{
          content: {
            background: '#18181b',
            color: '#f8fafc',
            borderRadius: 14,
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)',
            border: '1px solid #27272a',
          },
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 10px 0' }}>
            Delete Finished Good BOM?
          </h3>
          <p style={{ color: '#cbd5e1', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
            {targetDeleteBom ? (
              <>
                Are you sure you want to delete BOM{' '}
                <strong style={{ color: '#f87171' }}>{targetDeleteBom.bomCode}</strong> for{' '}
                <strong style={{ color: '#38bdf8' }}>[{targetDeleteBom.fgCode}] {targetDeleteBom.fgName}</strong>?
                This action will remove the BOM configuration from the catalog and Hand Packing.
              </>
            ) : (
              'Are you sure you want to delete this BOM configuration?'
            )}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <Button
            onClick={() => setDeleteBomModalVisible(false)}
            disabled={isDeletingBom}
            style={{
              background: '#27272a',
              borderColor: '#3f3f46',
              color: '#f1f5f9',
              borderRadius: 8,
              fontWeight: 600,
              height: 38,
              padding: '0 18px',
            }}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            danger
            loading={isDeletingBom}
            onClick={handleExecuteDeleteBom}
            style={{
              background: '#ef4444',
              borderColor: '#ef4444',
              borderRadius: 8,
              fontWeight: 700,
              height: 38,
              padding: '0 20px',
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* ── Save Confirmation & Review Modal (3 Action Options) ── */}
      <Modal
        open={saveModalVisible}
        onCancel={() => !saving && setSaveModalVisible(false)}
        footer={null}
        closable={!saving}
        centered
        width={580}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SaveOutlined style={{ color: '#10b981', fontSize: 20 }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              {existingBom ? 'Save BOM Changes Confirmation' : 'Confirm & Save New BOM Configuration'}
            </span>
          </div>
        }
      >
        <div style={{ padding: '8px 0' }}>
          <Alert
            message="BOM Review Before Saving"
            description="The component quantities and UOM mappings defined below will be authoritative for all factory hand-packing production orders."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <div style={{ position: 'relative', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            {saving && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(255, 255, 255, 0.92)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 100,
                  borderRadius: 8,
                }}
              >
                <Spin size="large" />
                <div style={{ marginTop: 14, fontWeight: 700, fontSize: 15, color: '#10b981' }}>
                  Saving BOM Configuration & Activating Mapping...
                </div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center', padding: '0 20px' }}>
                  Recording component consumption rules and updating Master BOM Catalog
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text type="secondary">Finished Good:</Text>
              <Text strong style={{ color: '#0f172a' }}>
                [{selectedProduct?.itemCode}] {selectedProduct?.name}
              </Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text type="secondary">BOM Name:</Text>
              <Text strong>{bomName}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text type="secondary">Base Packaging Unit:</Text>
              <Tag color="cyan" style={{ fontWeight: 700 }}>
                {baseQuantity} CTN ({baseQuantity * conversionFactors.grossPerCarton} GRS / {baseQuantity * conversionFactors.pcsPerCarton} PCS)
              </Tag>
            </div>
            <Divider style={{ margin: '10px 0' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Components to Save ({lines.length} items):
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {lines.map((l, idx) => {
                const it = items.find((i) => i.id === l.itemId);
                const uom = uoms.find((u) => u.id === l.uomId) || DEFAULT_CORE_UOMS.find((u) => u.id === l.uomId);
                const pcs = calculatePcsEquivalent(Number(l.quantity) || 0, l.uomId);
                return (
                  <div
                    key={l.key || idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '5px 8px',
                      background: idx % 2 === 0 ? '#ffffff' : 'transparent',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    <span>
                      <strong>#{idx + 1}</strong> [{it?.itemCode || 'COMP'}] {it?.name || 'Component'}
                    </span>
                    <Space size={8}>
                      <Tag color="blue" style={{ fontWeight: 700 }}>
                        {formatCleanQty(l.quantity)} {uom?.code || 'PCS'}
                      </Tag>
                      <span style={{ color: '#0284c7', fontSize: 11, fontWeight: 600 }}>
                        ({formatCleanQty(pcs)} PCS)
                      </span>
                    </Space>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 Explicit Action Options: Edit/Review, Cancel, Confirm & Save */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
            <Button
              onClick={() => setSaveModalVisible(false)}
              disabled={saving}
              style={{ fontWeight: 600 }}
            >
              Edit Details
            </Button>
            <Space>
              <Button
                onClick={() => setSaveModalVisible(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                data-testid="confirm-save-modal-btn"
                type="primary"
                loading={saving}
                onClick={executeSaveBom}
                style={{
                  background: '#10b981',
                  borderColor: '#10b981',
                  fontWeight: 700,
                  minWidth: 150,
                }}
              >
                Confirm & Save BOM
              </Button>
            </Space>
          </div>
        </div>
      </Modal>

      {/* ── Corporate Framed Checkmark Result Dialog for BOM Save ── */}
      <Modal
        open={bomSuccessModal.open}
        closable={false}
        footer={null}
        centered
        width={450}
        zIndex={2600}
        wrapClassName="prod-result-dialog-wrap"
        onCancel={() => setBomSuccessModal((prev) => ({ ...prev, open: false }))}
      >
        <div className="prod-result-icon-box">
          <svg className="prod-result-corner-svg" viewBox="0 0 64 64" fill="none">
            {/* Top-Left Corner Bracket */}
            <path d="M 14 24 V 14 H 24" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Top-Right Corner Bracket */}
            <path d="M 40 14 H 50 V 24" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Bottom-Left Corner Bracket */}
            <path d="M 14 40 V 50 H 24" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Bottom-Right Corner Bracket */}
            <path d="M 40 50 H 50 V 40" stroke="#86efac" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Center Green Checkmark */}
            <path d="M 22 33 L 29 40 L 43 25" stroke="#22c55e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="prod-result-title">Successfully Saved!</div>
        <div className="prod-result-subtitle">
          BOM configuration has been recorded and activated for factory production orders.
        </div>

        <div className="prod-result-details-card">
          <div className="prod-result-details-row">
            <span className="prod-result-details-label">Finished Good:</span>
            <span className="prod-result-details-val" style={{ color: '#0284c7' }}>
              [{bomSuccessModal.fgCode}] {bomSuccessModal.fgName}
            </span>
          </div>
          <div className="prod-result-details-row">
            <span className="prod-result-details-label">BOM Name:</span>
            <span className="prod-result-details-val">{bomSuccessModal.bomName}</span>
          </div>
          <div className="prod-result-details-row">
            <span className="prod-result-details-label">Base Packaging:</span>
            <span className="prod-result-details-val" style={{ color: '#059669' }}>
              {bomSuccessModal.baseQtyText}
            </span>
          </div>
          <div className="prod-result-details-row">
            <span className="prod-result-details-label">Components:</span>
            <span className="prod-result-details-val">
              <Tag color="green" style={{ fontWeight: 700, margin: 0 }}>
                {bomSuccessModal.componentsCount} Items Mapped
              </Tag>
            </span>
          </div>
          <div className="prod-result-details-row" style={{ alignItems: 'flex-start' }}>
            <span className="prod-result-details-label">Mapping Breakdown:</span>
            <span className="prod-result-details-val" style={{ fontSize: 11.5, color: '#475569' }}>
              {bomSuccessModal.componentsSummary}
            </span>
          </div>
          <div className="prod-result-details-row">
            <span className="prod-result-details-label">Status:</span>
            <span className="prod-result-details-val">
              <Tag color="cyan" style={{ fontWeight: 800, margin: 0 }}>
                {bomSuccessModal.statusText}
              </Tag>
            </span>
          </div>
        </div>

        <Button
          type="primary"
          className="prod-result-btn-ok"
          onClick={() => setBomSuccessModal((prev) => ({ ...prev, open: false }))}
        >
          OK
        </Button>
      </Modal>
    </div>
  );
};

export default FinishedGoodBomSetup;
