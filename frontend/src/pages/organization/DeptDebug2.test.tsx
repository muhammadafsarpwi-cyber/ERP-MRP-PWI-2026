import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import DepartmentManagement from './DepartmentManagement';
import apiService from '../../services/api';

jest.mock('../../services/api');
const apiMock = apiService as jest.Mocked<typeof apiService>;

const company = { id: 'comp-1', companyCode: 'C1', legalName: 'Acme Corp' };
const division = { id: 'div-1', divisionCode: 'D1', name: 'Wire Division' };
const sectionA = { id: 'sec-a', sectionCode: 'SA', name: 'Drawing Section' };
const sectionB = { id: 'sec-b', sectionCode: 'SB', name: 'Stranding Section' };
const departmentRecord: any = {
  id: 'dept-1', departmentCode: 'WRD', name: 'Wire Drawing', companyId: 'comp-1',
  divisionId: 'div-1', sectionId: 'sec-a', parentDepartmentId: null, status: 'ACTIVE',
  createdAt: '2026-09-01T08:00:00Z', createdBy: 'u1', company, division, section: sectionA, children: [],
};

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList;
});

beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

it('steps', async () => {
  apiMock.get.mockImplementation((url: string) => {
    if (url === '/departments') return Promise.resolve({ success: true, data: [departmentRecord], total: 1 });
    if (url === '/departments/hierarchy') return Promise.resolve({ success: true, data: [departmentRecord] });
    if (url === '/companies') return Promise.resolve({ success: true, data: [company] });
    if (url === '/divisions') return Promise.resolve({ success: true, data: [division] });
    if (url === '/sections') return Promise.resolve({ success: true, data: [sectionA, sectionB] });
    return Promise.resolve({ success: true, data: [] });
  });

  render(<MemoryRouter><App><DepartmentManagement /></App></MemoryRouter>);
  console.log('STEP1 rendered list');
  await screen.findByText('Department Management');
  fireEvent.click((await screen.findAllByTitle('Edit Department'))[0]);
  await screen.findByText('Edit Department');
  console.log('STEP2 edit modal open');

  const sectionSelect = screen.getByLabelText('Section');
  fireEvent.mouseDown(sectionSelect);
  console.log('STEP3 mouseDown section');
  await new Promise(r => setTimeout(r, 300));
  console.log('STEP4 waited 300ms, option texts:', Array.from(document.querySelectorAll('.ant-select-item-option')).map(o => o.textContent));
  const opt = await screen.findByText('SB - Stranding Section');
  console.log('STEP5 found option');
  fireEvent.click(opt);
  console.log('STEP6 clicked option');
  await new Promise(r => setTimeout(r, 300));
  console.log('STEP7 waited 300ms after click');
});