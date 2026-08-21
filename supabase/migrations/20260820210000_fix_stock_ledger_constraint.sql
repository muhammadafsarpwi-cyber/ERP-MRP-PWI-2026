-- ERP-00008 FIX: Extend stock_ledger transaction_type check constraint
-- to include SALES_DELIVERY and SALES_RETURN for sales module integration

ALTER TABLE stock_ledger
    DROP CONSTRAINT IF EXISTS stock_ledger_transaction_type_check;

ALTER TABLE stock_ledger
    ADD CONSTRAINT stock_ledger_transaction_type_check
    CHECK (transaction_type IN (
        'RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN',
        'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING',
        'RETURN_IN', 'RETURN_OUT',
        'SALES_DELIVERY', 'SALES_RETURN'
    ));
