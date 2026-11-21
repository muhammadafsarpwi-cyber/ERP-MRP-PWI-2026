import { TextToSqlService } from './text-to-sql.service';

/**
 * Regression tests for the "machine-wise production" grouping bug: the LLM
 * used to produce an ITEM-grouped query for machine-wise questions, and the
 * UI received chart metadata pointing at product columns.
 *
 * The fix has two deterministic (non-probabilistic) parts tested here:
 *   1. assertKeyphraseShape()  — SQL whose GROUP BY contradicts the user's
 *      key-phrase is rejected and fed back into the LLM self-repair loop.
 *   2. buildChartMetadata()    — the UI payload always maps machine-wise
 *      results to Machine Names + target + average production.
 */
describe('TextToSqlService — machine-wise shape enforcement & chart payload', () => {
  let service: any;

  beforeEach(() => {
    // Minimal stubs: the methods under test are pure (no DI used).
    const fakeConfig = { get: (_key: string, fallback: unknown) => fallback };
    service = new TextToSqlService(
      fakeConfig as any,
      {} as any, // gemini
      {} as any, // catalogService
      {} as any, // guard
      {} as any, // db
      {} as any, // advisor
      {} as any, // activityLog
    );
  });

  const machineWiseSql = `SELECT pe.division_id, m.machine_name, m.machine_code,
         SUM(pe.actual_quantity) AS total_production,
         AVG(pe.actual_quantity) AS avg_production,
         SUM(pe.target_quantity)  AS target_quantity
    FROM production_entries pe
    JOIN machines m ON m.id = pe.machine_id
   GROUP BY pe.division_id, m.id, m.machine_name, m.machine_code
   ORDER BY total_production DESC`;

  const itemWiseSql = `SELECT pe.division_id, i.item_name, i.sku,
         SUM(pe.actual_quantity) AS total_production
    FROM production_entries pe
    JOIN items i ON i.id = pe.production_in_item_id
   GROUP BY pe.division_id, i.id, i.item_name, i.sku`;

  // ── 1. key-phrase → query shape ───────────────────────────────────────────

  it('accepts a correctly shaped machine-wise query', () => {
    expect(service.assertKeyphraseShape('Show machine-wise production for SPT', machineWiseSql)).toBeNull();
  });

  it('REJECTS an item-grouped query for a machine-wise question (the reported bug)', () => {
    const issue = service.assertKeyphraseShape('SPT ka machine-wise production dikhao', itemWiseSql);
    expect(issue).toMatch(/MACHINE-wise/);
    expect(issue).toMatch(/JOIN machines/);
  });

  it('rejects machine-wise SQL that forgot to join the machines table', () => {
    const sql = `SELECT pe.division_id, SUM(pe.actual_quantity) AS total_production
                   FROM production_entries pe GROUP BY pe.division_id`;
    expect(service.assertKeyphraseShape('machine-wise production', sql)).toMatch(/JOIN machines/);
  });

  it('accepts an item-wise question grouped by item (no false positive)', () => {
    expect(service.assertKeyphraseShape('item-wise production last month', itemWiseSql)).toBeNull();
  });

  it('leaves unrelated questions untouched', () => {
    expect(service.assertKeyphraseShape('total production last month', machineWiseSql)).toBeNull();
  });

  // ── 2. UI chart payload ───────────────────────────────────────────────────

  const machineColumns = [
    'division_id', 'machine_name', 'machine_code',
    'total_production', 'avg_production', 'target_quantity',
  ];

  it('maps machine-wise results to a BAR chart on Machine Names with target + average', () => {
    const chart = service.buildChartMetadata('Show machine-wise production', machineColumns, undefined);
    expect(chart.chartType).toBe('bar');
    expect(chart.dimension).toBe('machine');
    expect(chart.x).toEqual({ column: 'machine_name', label: 'Machine Names' });
    expect(chart.series.map((s: any) => s.column)).toEqual([
      'total_production', 'avg_production', 'target_quantity',
    ]);
    expect(chart.series.map((s: any) => s.label)).toEqual([
      'Total Production', 'Average Production', 'Target',
    ]);
  });

  it('never maps machine-wise to product columns, even when the LLM hint says so', () => {
    const chart = service.buildChartMetadata('machine-wise production', machineColumns, {
      chartType: 'bar',
      dimension: 'item',
      xColumn: 'item_name', // hostile/wrong hint from the model
      series: [{ column: 'item_name', label: 'Products' }],
    });
    expect(chart.x.column).toBe('machine_name');
    expect(chart.dimension).toBe('machine');
  });

  it('only advertises series columns that actually exist in the result', () => {
    const chart = service.buildChartMetadata('machine-wise production', ['division_id', 'machine_name'], undefined);
    expect(chart.series).toEqual([]); // no aggregate columns present → no phantom series
  });

  it('REJECTS a supplier query when the user asks for top customers by sales volume', () => {
    const supplierSql = `SELECT s.id, s.supplier_name, SUM(po.total_amount) AS total_amount
                           FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id GROUP BY s.id, s.supplier_name`;
    const issue = service.assertKeyphraseShape('Top Customers by sales volume', supplierSql);
    expect(issue).toMatch(/Customers and Suppliers/i);
  });

  it('accepts a sales_orders query for top customers', () => {
    const customerSql = `SELECT c.id, c.name AS customer_name, SUM(so.total_amount) AS total_sales
                           FROM sales_orders so JOIN customers c ON c.id = so.customer_id GROUP BY c.id, c.name`;
    expect(service.assertKeyphraseShape('Top Customers by sales volume', customerSql)).toBeNull();
  });

  it('REJECTS a production_entries query when the user asks for top customers by sales volume', () => {
    const prodSql = `SELECT c.name AS customer_name, SUM(pe.actual_quantity) AS total_sales
                       FROM production_entries pe JOIN customers c ON c.id = pe.customer_id GROUP BY c.name`;
    const issue = service.assertKeyphraseShape('Top Customers by sales volume', prodSql);
    expect(issue).toMatch(/NEVER query production_entries/);
  });

  it('REJECTS a static items master query when user asks for department production', () => {
    const itemMasterSql = `SELECT i.id, i.item_name FROM items i`;
    const issue = service.assertKeyphraseShape('Spoke Department production this week', itemMasterSql);
    expect(issue).toMatch(/operational production logs/);
  });

  it('maps customer questions to a BAR chart on customer names', () => {
    const chart = service.buildChartMetadata('Top customers by sales volume', ['customer_name', 'total_sales', 'order_count'], undefined);
    expect(chart.chartType).toBe('bar');
    expect(chart.x).toEqual({ column: 'customer_name', label: 'Customers' });
    expect(chart.series.map((s: any) => s.column)).toEqual(['total_sales', 'order_count']);
  });

  it('accepts department-wise last entry SQL and rejects undated machine summaries', () => {
    const validLastEntrySql = `SELECT d.division_id, d.name AS "DEPARTMENT / SECTION",
      COALESCE(TO_CHAR(latest.entry_date, 'YYYY-MM-DD'), 'No entries recorded') AS "LAST ENTRY DATE"
      FROM departments d
      LEFT JOIN LATERAL (
        SELECT pe.entry_date, pe.entry_number FROM production_entries pe WHERE pe.department_id = d.id ORDER BY pe.entry_date DESC LIMIT 1
      ) latest ON TRUE`;
    expect(service.assertKeyphraseShape('When was the last entry made?', validLastEntrySql)).toBeNull();

    const issue = service.assertKeyphraseShape('When was the last entry made?', machineWiseSql);
    expect(issue).toMatch(/LAST\/LATEST production entry/);

    const chart = service.buildChartMetadata(
      'When was the last entry made?',
      ['division_id', 'DEPARTMENT / SECTION', 'LAST ENTRY DATE'],
      undefined,
    );
    expect(chart.chartType).toBe('table');
  });

  it('routes item-wise raw material receiving to raw_material_receipts and rejects production_entries', () => {
    const validRmSql = `SELECT r.division_id, i.item_code AS "ITEM CODE", i.name AS "RAW MATERIAL ITEM NAME",
      COUNT(DISTINCT r.id) AS "RECEIPTS / GATE PASSES",
      ROUND(SUM(l.received_quantity)::numeric, 2) AS "TOTAL RECEIVED QTY / WEIGHT (KG)",
      TO_CHAR(MAX(r.receipt_date), 'YYYY-MM-DD') AS "LAST RECEIVED DATE"
      FROM raw_material_receipts r
      JOIN raw_material_receipt_lines l ON l.receipt_id = r.id
      JOIN items i ON i.id = l.item_id
      GROUP BY r.division_id, i.item_code, i.name`;

    expect(
      service.assertKeyphraseShape('Show item-wise raw material received this month in this division', validRmSql),
    ).toBeNull();

    const wrongProdIssue = service.assertKeyphraseShape(
      'Show item-wise raw material received this month in this division',
      itemWiseSql,
    );
    expect(wrongProdIssue).toMatch(/Raw Material Receiving/i);
  });

  it('returns a polite clarification response without executing SQL when LLM flags needs_clarification', async () => {
    const fakeConfig = { get: (_key: string, fallback: unknown) => fallback };
    const runSelect = jest.fn();
    const clarifyService = new TextToSqlService(
      fakeConfig as any,
      {
        getActiveProviderInfo: jest.fn().mockResolvedValue({ model: 'gemini-2.0-flash', source: 'database' }),
        generateJson: jest.fn().mockResolvedValue({
          needs_clarification: true,
          clarification_question: 'Would you like to see Raw Material Received this month or Current Closing Raw Material Stock?',
          clarification_options: [
            'Show item-wise raw material received this month in this division',
            'Show current raw material stock balance item-wise',
          ],
          sql: '',
        }),
      } as any,
      {
        getCatalog: jest.fn().mockResolvedValue({ tables: [], divisions: [], departments: [], schema: 'public', generatedAt: '' }),
        renderSchemaPrompt: jest.fn().mockReturnValue(''),
        renderDivisionsPrompt: jest.fn().mockReturnValue(''),
        renderDepartmentsPrompt: jest.fn().mockReturnValue(''),
      } as any,
      {} as any,
      { ensureReady: jest.fn().mockResolvedValue(undefined), runSelect } as any,
      {} as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const ans = await clarifyService.ask({
      question: 'raw material?',
      allowedDivisionIds: ['d1000000-0000-0000-0000-000000000001'],
      mode: 'text',
    });
    expect(ans.status).toBe('clarification');
    expect(ans.explanation.en).toContain('Raw Material Received');
    expect(ans.clarificationOptions).toHaveLength(2);
    expect(ans.meta.model).toBe('gemini-2.0-flash');
    expect(runSelect).not.toHaveBeenCalled();
  });
});
