import React from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import './headerSearch.css';

const HeaderSearch: React.FC = () => (
  <div className="erp-header-search" data-testid="header-search">
    <Input
      prefix={<SearchOutlined style={{ fontSize: 13, color: 'var(--theme-text-muted, #6b7280)' }} />}
      placeholder="Search everything..."
      allowClear
      aria-label="Search everything"
      className="erp-header-search__input"
    />
  </div>
);

export default HeaderSearch;