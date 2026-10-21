const supabaseUrl = 'https://gnvobiwlzezostzjpqvu.supabase.co/rest/v1';
const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdudm9iaXdsemV6b3N0empwcXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNDM5NTksImV4cCI6MjA5NzcxOTk1OX0.QSpOod3kaSHGwIAILrD_nLxcmaU42-3iFXtoeBp50Uc';

async function query(path) {
  const res = await fetch(`${supabaseUrl}/${path}`, {
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

async function main() {
  console.log('Querying Supabase via native fetch...');

  // 1. Get PE-2026-00185 and PE-2026-00260
  const pes = await query('production_entries?select=id,entry_number,entry_date,actual_quantity,is_active,deleted_at,item_id,warehouse_id&entry_number=in.(PE-2026-00185,PE-2026-00260)');
  console.log('PEs:', JSON.stringify(pes, null, 2));

  // 2. Get items
  const items = await query('items?select=id,item_code,name,production_in_item_id&item_code=in.(WIP-ST-001,WIP-ST-014,WIP-SW-001,WIP-SW-002)');
  console.log('Items:', JSON.stringify(items, null, 2));

  // 3. Get production_entry_items
  if (pes && pes.length > 0) {
    const peIds = pes.map(p => p.id).join(',');
    const peItems = await query(`production_entry_items?select=id,production_entry_id,item_id,entry_kind,line_number,actual_quantity&production_entry_id=in.(${peIds})`);
    console.log('PE Items:', JSON.stringify(peItems, null, 2));
  }

  // 4. Get stock_ledger for WIP-ST-014
  const st014Item = items?.find(i => i.item_code === 'WIP-ST-014');
  if (st014Item) {
    const slRows = await query(`stock_ledger?select=id,item_id,warehouse_id,transaction_type,direction,quantity,reference_id,reference_type,notes,created_at,transaction_date&item_id=eq.${st014Item.id}&order=transaction_date.asc`);
    console.log(`Stock Ledger for WIP-ST-014 (${slRows?.length} rows):`, JSON.stringify(slRows, null, 2));
  }

  // 5. Check stock_ledger where notes contains PE-2026-00185 or PE-2026-00260
  const note185 = await query('stock_ledger?select=id,item_id,warehouse_id,transaction_type,direction,quantity,reference_id,reference_type,notes,created_at&notes=ilike.*PE-2026-00185*');
  console.log('Notes with PE-2026-00185:', JSON.stringify(note185, null, 2));

  const note260 = await query('stock_ledger?select=id,item_id,warehouse_id,transaction_type,direction,quantity,reference_id,reference_type,notes,created_at&notes=ilike.*PE-2026-00260*');
  console.log('Notes with PE-2026-00260:', JSON.stringify(note260, null, 2));
}

main().catch(console.error);
