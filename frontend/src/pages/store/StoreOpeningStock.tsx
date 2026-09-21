import React from 'react';
import { OpeningStock } from '../inventory';

/**
 * Store Opening Stock — single entry point for posting initial stock balances.
 * Directly renders the OpeningStock component with store-department context.
 */
const StoreOpeningStock: React.FC = () => <OpeningStock />;

export default StoreOpeningStock;
