import React from 'react';

export function TableSkeleton({ rows = 6, columns = 5, label = 'Loading data...' }) {
  return (
    <div
      className="data-state-skeleton"
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{ '--skeleton-cols': columns }}
    >
      <div className="data-state-skeleton-table" aria-hidden="true">
        <div className="data-state-skeleton-row data-state-skeleton-row--header">
          {Array.from({ length: columns }).map((_, index) => (
            <span key={`head-${index}`} className="data-state-skeleton-cell" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="data-state-skeleton-row">
            {Array.from({ length: columns }).map((__, cellIndex) => (
              <span key={`cell-${rowIndex}-${cellIndex}`} className="data-state-skeleton-cell" />
            ))}
          </div>
        ))}
      </div>
      <span className="data-state-skeleton-label">{label}</span>
    </div>
  );
}

export function EmptyStateStandard({
  icon = 'inbox',
  title = 'Nothing to show',
  message = 'Try adjusting filters or check back later.',
}) {
  return (
    <div className="data-state-panel data-state-panel--empty" role="status" aria-live="polite">
      <span className="material-symbols-outlined data-state-panel-icon">{icon}</span>
      <h3 className="data-state-panel-title">{title}</h3>
      <p className="data-state-panel-text">{message}</p>
    </div>
  );
}

export function ErrorStateStandard({
  message = 'Unable to load data right now.',
  onRetry,
  retryLabel = 'Retry',
}) {
  return (
    <div className="data-state-panel data-state-panel--error" role="alert">
      <span className="material-symbols-outlined data-state-panel-icon">error</span>
      <div className="data-state-panel-body">
        <h3 className="data-state-panel-title">Something went wrong</h3>
        <p className="data-state-panel-text">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
