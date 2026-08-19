CREATE TABLE IF NOT EXISTS serial_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  is_active BOOLEAN DEFAULT true,
  company_id UUID NOT NULL REFERENCES companies(id),
  item_id UUID NOT NULL REFERENCES items(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  location_id UUID REFERENCES warehouse_locations(id),
  serial_number VARCHAR(100) NOT NULL,
  batch_id UUID REFERENCES batches(id),
  status VARCHAR(20) DEFAULT 'IN_STOCK',
  reference_type VARCHAR(50),
  reference_id UUID,
  notes TEXT,
  UNIQUE (company_id, item_id, serial_number)
);

DROP TRIGGER IF EXISTS update_serial_numbers_updated_at ON serial_numbers;

CREATE TRIGGER update_serial_numbers_updated_at
  BEFORE UPDATE ON serial_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
