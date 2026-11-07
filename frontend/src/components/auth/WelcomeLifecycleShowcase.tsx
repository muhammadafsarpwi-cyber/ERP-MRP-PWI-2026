import React, { useEffect, useMemo, useState } from 'react';
import {
  LeftOutlined,
  PauseOutlined,
  CaretRightOutlined,
  RightOutlined,
  ArrowRightOutlined,
  DeploymentUnitOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import { DivisionLifecycleConfig } from '../../config/companyWelcomeConfig';

interface Props {
  divisions: DivisionLifecycleConfig[];
  activeDivisionIndex: number;
  onDivisionChange: (index: number) => void;
  activeStage: number;
  onStageChange: (stageIndex: number) => void;
  autoCycle: boolean;
  divisionCycleIntervalMs: number;
  stagePulseIntervalMs: number;
  reducedMotion: boolean;
}

/**
 * Automated & interactive Division + Department Lifecycle Renderer.
 * Drives department-by-department progression in lockstep with WelcomeBackground
 * so every stage illuminates simultaneously with its corresponding 3D machine scene.
 */
const WelcomeLifecycleShowcase: React.FC<Props> = ({
  divisions,
  activeDivisionIndex,
  onDivisionChange,
  activeStage,
  onStageChange,
  autoCycle,
  stagePulseIntervalMs,
  reducedMotion,
}) => {
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const safeIndex =
    divisions.length > 0 ? activeDivisionIndex % divisions.length : 0;
  const currentDivision = divisions[safeIndex];

  // Compute total discrete stages in the current division's automated walkthrough
  const totalStages = useMemo(() => {
    if (!currentDivision) return 1;
    const seqCount =
      currentDivision.flowLayout === 'stranding'
        ? 0
        : currentDivision.departments.length;
    const strandingCount =
      (currentDivision.flowLayout === 'stranding' ||
        currentDivision.flowLayout === 'wire_and_stranding') &&
      currentDivision.stranding
        ? 4 // 0: Input Strands -> 1: Stranding Dept -> 2: Finished Inner Wire Bundles -> 3: Final Stage
        : 0;
    return Math.max(1, seqCount + strandingCount);
  }, [currentDivision]);

  const isPaused = userPaused || hovered || !autoCycle || reducedMotion;

  // Automated stage-by-stage progression & division auto-advance (synchronized with background)
  useEffect(() => {
    if (
      isPaused ||
      divisions.length === 0 ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }

    const stepInterval = Math.max(1200, stagePulseIntervalMs || 2600);
    const timer = window.setTimeout(() => {
      if (activeStage < totalStages - 1) {
        onStageChange(activeStage + 1);
      } else {
        onStageChange(0);
        if (divisions.length > 1) {
          onDivisionChange((safeIndex + 1) % divisions.length);
        }
      }
    }, stepInterval);

    return () => window.clearTimeout(timer);
  }, [
    activeStage,
    divisions.length,
    isPaused,
    onDivisionChange,
    onStageChange,
    safeIndex,
    stagePulseIntervalMs,
    totalStages,
  ]);

  if (!currentDivision) {
    return null;
  }

  const handleSelectDivision = (index: number) => {
    onStageChange(0);
    onDivisionChange(index);
  };

  const handlePrev = () => {
    onStageChange(0);
    onDivisionChange((safeIndex - 1 + divisions.length) % divisions.length);
  };

  const handleNext = () => {
    onStageChange(0);
    onDivisionChange((safeIndex + 1) % divisions.length);
  };

  const showSequential =
    (currentDivision.flowLayout === 'sequential' ||
      currentDivision.flowLayout === 'wire_and_stranding') &&
    currentDivision.departments.length > 0;

  const showStranding =
    (currentDivision.flowLayout === 'stranding' ||
      currentDivision.flowLayout === 'wire_and_stranding') &&
    Boolean(currentDivision.stranding);

  const seqOffset = showSequential ? currentDivision.departments.length : 0;
  const strandingStageIndex = activeStage - seqOffset;

  const flowBadgeLabel =
    currentDivision.flowLayout === 'wire_and_stranding'
      ? 'Wire Drawing + Stranding'
      : currentDivision.flowLayout === 'stranding'
        ? 'Stranding Convergence'
        : 'Sequential Flow';

  const progressPct =
    totalStages > 1
      ? Math.round(((activeStage + 1) / totalStages) * 100)
      : 100;

  return (
    <section
      className="erp-welcome-showcase-card erp-lifecycle-showcase"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Division Manufacturing Lifecycle Showcase"
      data-testid="welcome-lifecycle-showcase"
    >
      {/* Dynamic Division Selector Tabs — Scales automatically for 5th, 6th, Nth divisions */}
      <div
        className="erp-lifecycle-tabs"
        role="tablist"
        aria-label="Manufacturing Divisions"
      >
        {divisions.map((div, idx) => {
          const selected = idx === safeIndex;
          return (
            <button
              key={div.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`Division ${idx + 1}: ${div.name}`}
              className={`erp-lifecycle-tab${selected ? ' is-active' : ''}`}
              onClick={() => handleSelectDivision(idx)}
            >
              <span className="erp-lifecycle-tab-num">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="erp-lifecycle-tab-name">{div.name}</span>
            </button>
          );
        })}
      </div>

      {/* Active Division Header & Controls */}
      <div className="erp-welcome-showcase-nav erp-lifecycle-header">
        <button
          type="button"
          className="erp-welcome-nav-arrow prev"
          onClick={handlePrev}
          aria-label="Previous Slide"
          title="Previous Division (←)"
        >
          <LeftOutlined />
        </button>

        <div className="erp-welcome-showcase-content">
          <div className="erp-welcome-slide-badge">
            <span className="erp-welcome-slide-num">
              {String(safeIndex + 1).padStart(2, '0')}
            </span>
            <span className="erp-welcome-slide-total">
              / {String(divisions.length).padStart(2, '0')}
            </span>
            <span className="erp-welcome-slide-divider">•</span>
            <span className="erp-lifecycle-code-pill">{currentDivision.code}</span>
            <span className="erp-welcome-slide-caption-en">
              {currentDivision.name}
            </span>
            <span className="erp-lifecycle-mode-pill">{flowBadgeLabel}</span>
          </div>
          <p className="erp-welcome-slide-desc">{currentDivision.subtitle}</p>
        </div>

        <div className="erp-lifecycle-nav-right">
          <button
            type="button"
            className="erp-welcome-nav-arrow pause-toggle"
            onClick={() => setUserPaused((p) => !p)}
            aria-label={
              userPaused ? 'Resume lifecycle sequence' : 'Pause lifecycle sequence'
            }
            title={
              userPaused ? 'Resume automated sequence' : 'Pause automated sequence'
            }
          >
            {userPaused ? <CaretRightOutlined /> : <PauseOutlined />}
          </button>
          <button
            type="button"
            className="erp-welcome-nav-arrow next"
            onClick={handleNext}
            aria-label="Next Slide"
            title="Next Division (→)"
          >
            <RightOutlined />
          </button>
        </div>
      </div>

      {/* Track 1: Sequential Department Pipeline (Spoke, Control Cable, & Wire Drawing Cycle) */}
      {showSequential && (
        <div
          className="erp-lifecycle-track-box"
          data-testid={`sequential-flow-${currentDivision.id}`}
        >
          {showStranding && (
            <div className="erp-lifecycle-track-label">
              <NodeIndexOutlined />
              <span>Sequential Wire Drawing Manufacturing Cycle</span>
            </div>
          )}

          <ol
            className="erp-lifecycle-seq-chain"
            aria-label={`${currentDivision.name} department flow`}
          >
            {currentDivision.departments.map((dept, dIdx) => {
              const isCurrent = activeStage === dIdx;
              const isPassed = activeStage > dIdx;
              const isFirst = dIdx === 0;
              const isLast = dIdx === currentDivision.departments.length - 1;

              return (
                <React.Fragment key={dept.id}>
                  <li
                    className={[
                      'erp-lifecycle-stage-node',
                      isCurrent ? 'is-current' : '',
                      isPassed ? 'is-passed' : '',
                      isFirst ? 'is-origin' : '',
                      isLast ? 'is-terminal' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onStageChange(dIdx)}
                    title={`Stage ${dIdx + 1}: ${dept.name}`}
                  >
                    <span className="erp-stage-index">
                      {String(dIdx + 1).padStart(2, '0')}
                    </span>
                    <span className="erp-stage-title">{dept.name}</span>
                  </li>

                  {!isLast && (
                    <li
                      className={`erp-lifecycle-connector${isPassed || isCurrent ? ' is-lit' : ''}`}
                      aria-hidden="true"
                    >
                      <ArrowRightOutlined />
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ol>
        </div>
      )}

      {/* Track 2: Converging Multi-Strand Stranding Process Flow */}
      {showStranding && currentDivision.stranding && (
        <div
          className="erp-lifecycle-track-box erp-stranding-box"
          data-testid={`stranding-flow-${currentDivision.id}`}
        >
          <div className="erp-lifecycle-track-label">
            <DeploymentUnitOutlined />
            <span>
              Stranding Process Flow — Multi-Strand Inner Wire Bundle Convergence
            </span>
          </div>

          <div className="erp-stranding-diagram">
            {/* Multi-Strand Raw Wire Inputs */}
            <div
              className={`erp-stranding-inputs${strandingStageIndex === 0 ? ' is-current' : strandingStageIndex > 0 ? ' is-passed' : ''}`}
              onClick={() => onStageChange(seqOffset)}
            >
              {currentDivision.stranding.inputStrands.map((strand, sIdx) => (
                <div key={sIdx} className="erp-strand-pill">
                  <span className="erp-strand-dot" />
                  <span className="erp-strand-text">{strand}</span>
                </div>
              ))}
            </div>

            {/* Converging Wire Filaments SVG */}
            <div
              className={`erp-stranding-converge-svg${strandingStageIndex >= 1 ? ' is-lit' : ''}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 56 72" preserveAspectRatio="none">
                <path d="M 2 12 C 26 12, 30 36, 54 36" className="strand-wire-path" />
                <path d="M 2 36 L 54 36" className="strand-wire-path" />
                <path d="M 2 60 C 26 60, 30 36, 54 36" className="strand-wire-path" />
              </svg>
            </div>

            {/* Stranding Department Node */}
            <div
              className={`erp-stranding-node is-hub${strandingStageIndex === 1 ? ' is-current' : strandingStageIndex > 1 ? ' is-passed' : ''}`}
              onClick={() => onStageChange(seqOffset + 1)}
            >
              <span className="erp-stranding-node-tag">CONVERGE</span>
              <span className="erp-stranding-node-name">
                {currentDivision.stranding.strandingDepartment}
              </span>
            </div>

            <span
              className={`erp-lifecycle-connector${strandingStageIndex >= 2 ? ' is-lit' : ''}`}
              aria-hidden="true"
            >
              <ArrowRightOutlined />
            </span>

            {/* Combined Finished Inner Wire Bundles Node */}
            <div
              className={`erp-stranding-node is-bundle${strandingStageIndex === 2 ? ' is-current' : strandingStageIndex > 2 ? ' is-passed' : ''}`}
              onClick={() => onStageChange(seqOffset + 2)}
            >
              <span className="erp-stranding-node-tag">COMBINED BUNDLE</span>
              <span className="erp-stranding-node-name">
                {currentDivision.stranding.bundleOutput}
              </span>
            </div>

            <span
              className={`erp-lifecycle-connector${strandingStageIndex >= 3 ? ' is-lit' : ''}`}
              aria-hidden="true"
            >
              <ArrowRightOutlined />
            </span>

            {/* Final Stage / Dispatch */}
            <div
              className={`erp-stranding-node is-final${strandingStageIndex === 3 ? ' is-current' : ''}`}
              onClick={() => onStageChange(seqOffset + 3)}
            >
              <span className="erp-stranding-node-tag">FINAL STAGE</span>
              <span className="erp-stranding-node-name">
                {currentDivision.stranding.finalStage}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Automated Lifecycle Progress Bar */}
      <div className="erp-lifecycle-progress-rail" aria-hidden="true">
        <div
          className="erp-lifecycle-progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </section>
  );
};

export default WelcomeLifecycleShowcase;
