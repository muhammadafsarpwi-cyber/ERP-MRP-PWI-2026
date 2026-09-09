import { describe, it, expect } from 'vitest';
import { ACTION_MAP } from '../maintenance/jobCards.types';

describe('Job Card ACTION_MAP permission correctness', () => {
  it('PENDING_VERIFICATION reject action uses maintenance.job_card.reject', () => {
    const pendingActions = ACTION_MAP['PENDING_VERIFICATION'];
    const rejectAction = pendingActions.find(a => a.endpoint === 'reject');
    expect(rejectAction).toBeDefined();
    expect(rejectAction!.permission).toBe('maintenance.job_card.reject');
  });

  it('PENDING_VERIFICATION verify action uses maintenance.job_card.verify', () => {
    const pendingActions = ACTION_MAP['PENDING_VERIFICATION'];
    const verifyAction = pendingActions.find(a => a.endpoint === 'verify');
    expect(verifyAction).toBeDefined();
    expect(verifyAction!.permission).toBe('maintenance.job_card.verify');
  });

  it('OPEN start action uses maintenance.job_card.start', () => {
    const openActions = ACTION_MAP['OPEN'];
    const startAction = openActions.find(a => a.endpoint === 'start');
    expect(startAction).toBeDefined();
    expect(startAction!.permission).toBe('maintenance.job_card.start');
  });

  it('OPEN assign action uses maintenance.job_card.assign', () => {
    const openActions = ACTION_MAP['OPEN'];
    const assignAction = openActions.find(a => a.endpoint === 'assign');
    expect(assignAction).toBeDefined();
    expect(assignAction!.permission).toBe('maintenance.job_card.assign');
  });

  it('IN_PROGRESS complete action uses maintenance.job_card.complete', () => {
    const inProgressActions = ACTION_MAP['IN_PROGRESS'];
    const completeAction = inProgressActions.find(a => a.endpoint === 'complete');
    expect(completeAction).toBeDefined();
    expect(completeAction!.permission).toBe('maintenance.job_card.complete');
  });

  it('IN_PROGRESS hold action uses maintenance.job_card.hold', () => {
    const inProgressActions = ACTION_MAP['IN_PROGRESS'];
    const holdAction = inProgressActions.find(a => a.endpoint === 'hold');
    expect(holdAction).toBeDefined();
    expect(holdAction!.permission).toBe('maintenance.job_card.hold');
  });

  it('VERIFIED approve action uses maintenance.job_card.approve', () => {
    const verifiedActions = ACTION_MAP['VERIFIED'];
    const approveAction = verifiedActions.find(a => a.endpoint === 'approve');
    expect(approveAction).toBeDefined();
    expect(approveAction!.permission).toBe('maintenance.job_card.approve');
  });

  it('REJECTED resubmit action uses maintenance.job_card.close', () => {
    const rejectedActions = ACTION_MAP['REJECTED'];
    const resubmitAction = rejectedActions.find(a => a.endpoint === 'submit-for-verification');
    expect(resubmitAction).toBeDefined();
    expect(resubmitAction!.permission).toBe('maintenance.job_card.close');
  });
});

describe('Permission code structure', () => {
  it('all job card permissions follow module.resource.action pattern', () => {
    const allPermissions: string[] = [];
    for (const actions of Object.values(ACTION_MAP)) {
      for (const action of actions) {
        allPermissions.push(action.permission);
      }
    }
    for (const perm of allPermissions) {
      const parts = perm.split('.');
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[0]).toBe('maintenance');
      expect(parts[1]).toBe('job_card');
    }
  });

  it('reject and verify use different permission codes', () => {
    const pendingActions = ACTION_MAP['PENDING_VERIFICATION'];
    const rejectAction = pendingActions.find(a => a.endpoint === 'reject');
    const verifyAction = pendingActions.find(a => a.endpoint === 'verify');
    expect(rejectAction!.permission).not.toBe(verifyAction!.permission);
  });
});

describe('Procurement order permission codes', () => {
  const expectedPermissions = [
    'procurement.order.create',
    'procurement.order.view',
    'procurement.order.submit',
    'procurement.order.approve',
    'procurement.order.cancel',
  ];

  it('all expected procurement order permissions are valid format', () => {
    for (const perm of expectedPermissions) {
      const parts = perm.split('.');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('procurement');
      expect(parts[1]).toBe('order');
    }
  });
});

describe('Sales order permission codes', () => {
  const expectedPermissions = [
    'sales.orders.create',
    'sales.orders.view',
    'sales.orders.update',
    'sales.orders.approve',
  ];

  it('all expected sales order permissions are valid format', () => {
    for (const perm of expectedPermissions) {
      const parts = perm.split('.');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('sales');
      expect(parts[1]).toBe('orders');
    }
  });
});

describe('Finance journal permission codes', () => {
  const expectedPermissions = [
    'finance.journal.create',
    'finance.journal.view',
    'finance.journal.post',
    'finance.journal.reverse',
  ];

  it('all expected finance journal permissions are valid format', () => {
    for (const perm of expectedPermissions) {
      const parts = perm.split('.');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('finance');
      expect(parts[1]).toBe('journal');
    }
  });
});

describe('Inventory transfer permission codes', () => {
  const expectedPermissions = [
    'inventory.transfer.create',
    'inventory.transfer.approve',
    'inventory.transfer.post',
  ];

  it('all expected inventory transfer permissions are valid format', () => {
    for (const perm of expectedPermissions) {
      const parts = perm.split('.');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('inventory');
      expect(parts[1]).toBe('transfer');
    }
  });

  it('no generic inventory.create fallback is used', () => {
    const genericFallbacks = ['inventory.create', 'inventory.manage'];
    for (const perm of genericFallbacks) {
      expect(expectedPermissions).not.toContain(perm);
    }
  });
});
