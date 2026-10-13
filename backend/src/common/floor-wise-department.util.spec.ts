import {
  FLOOR_WISE_DEPARTMENT_ORDER,
  floorWiseDepartmentRank,
  sortDepartmentsFloorWise,
} from './floor-wise-department.util';

describe('floor-wise department ordering', () => {
  it('exposes the canonical shop-floor sequence', () => {
    expect([...FLOOR_WISE_DEPARTMENT_ORDER]).toEqual([
      'Straightener',
      'Swaging',
      'Spoke',
      'Spoke Plating',
      'Packing',
      'Dispatch',
    ]);
  });

  it('ranks each canonical floor stage by its fixed index', () => {
    expect(floorWiseDepartmentRank('Straightener')).toBe(0);
    expect(floorWiseDepartmentRank('Swaging')).toBe(1);
    expect(floorWiseDepartmentRank('Spoke')).toBe(2);
    expect(floorWiseDepartmentRank('Spoke Plating')).toBe(3);
    expect(floorWiseDepartmentRank('Packing')).toBe(4);
    expect(floorWiseDepartmentRank('Dispatch')).toBe(5);
  });

  it('tolerates case, padding and the historic "Swagging" spelling', () => {
    expect(floorWiseDepartmentRank('  straightener ')).toBe(0);
    expect(floorWiseDepartmentRank('SPOKE PLATING')).toBe(3);
    expect(floorWiseDepartmentRank('Swagging')).toBe(1);
  });

  it('returns -1 for departments outside the floor line', () => {
    expect(floorWiseDepartmentRank('Header')).toBe(-1);
    expect(floorWiseDepartmentRank('PVC')).toBe(-1);
    expect(floorWiseDepartmentRank(null)).toBe(-1);
    expect(floorWiseDepartmentRank(undefined)).toBe(-1);
    expect(floorWiseDepartmentRank('')).toBe(-1);
  });

  it('sorts alphabetical input into the strict floor-wise sequence', () => {
    const rows = [
      { departmentName: 'Packing' },
      { departmentName: 'Dispatch' },
      { departmentName: 'Spoke Plating' },
      { departmentName: 'Spoke' },
      { departmentName: 'Swagging' },
      { departmentName: 'Straightener' },
    ];

    expect(sortDepartmentsFloorWise(rows).map((r) => r.departmentName)).toEqual([
      'Straightener',
      'Swagging',
      'Spoke',
      'Spoke Plating',
      'Packing',
      'Dispatch',
    ]);
  });

  it('appends non-floor departments alphabetically after the six floor stages', () => {
    const rows = [
      { departmentName: 'PVC' },
      { departmentName: 'Header' },
      { departmentName: 'Dispatch' },
      { departmentName: 'Straightener' },
    ];

    expect(sortDepartmentsFloorWise(rows).map((r) => r.departmentName)).toEqual([
      'Straightener',
      'Dispatch',
      'Header',
      'PVC',
    ]);
  });

  it('does not mutate the input array and supports a custom name accessor', () => {
    const rows = [{ name: 'Packing' }, { name: 'Straightener' }];
    const sorted = sortDepartmentsFloorWise(rows, (r) => r.name);

    expect(sorted.map((r) => r.name)).toEqual(['Straightener', 'Packing']);
    expect(rows.map((r) => r.name)).toEqual(['Packing', 'Straightener']);
  });
});
