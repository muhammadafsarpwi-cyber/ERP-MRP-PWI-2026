import React, { useEffect, useState } from 'react';
import { hasUnsavedChanges } from '../../store/unsavedChangesRegistry';
import './verticalStatusRail.css';

interface VerticalStatusRailProps {
  /** Canonical tab id whose status this rail reports (e.g. "/production/entries"). */
  tabId: string;
}

/** How often the rail re-reads the (non-reactive) unsaved-changes registry. */
const STATUS_POLL_MS = 800;

/**
 * VerticalStatusRail
 * -------------------
 * Rotated side label for the status text, anchored to the left border of the
 * active view pane (see verticalStatusRail.css for the writing-mode rules).
 *
 * Self-contained on purpose: it owns its own polling state so only this tiny
 * leaf node re-renders — the viewport subtree (the whole page) never does.
 * setState with an identical value bails out, so a quiet tab costs one boolean
 * comparison per tick.
 */
export const VerticalStatusRail: React.FC<VerticalStatusRailProps> = React.memo(
  ({ tabId }) => {
    const [unsaved, setUnsaved] = useState<boolean>(() => hasUnsavedChanges(tabId));

    useEffect(() => {
      let alive = true;
      const tick = () => {
        if (!alive) return;
        setUnsaved(hasUnsavedChanges(tabId));
      };
      tick();
      const id = window.setInterval(tick, STATUS_POLL_MS);
      return () => {
        alive = false;
        window.clearInterval(id);
      };
    }, [tabId]);

    const status = unsaved ? 'Unsaved' : 'Ready';

    return (
      <div
        className={`erp-view-status-rail${unsaved ? ' erp-view-status-rail--dirty' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={`View status: ${status}`}
        title={status}
        data-testid="view-status-rail"
      >
        {status}
      </div>
    );
  }
);

VerticalStatusRail.displayName = 'VerticalStatusRail';

export default VerticalStatusRail;
