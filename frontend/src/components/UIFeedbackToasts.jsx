import { useUIFeedback } from '../context/UIFeedbackContext';

const ICONS = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  error: 'error',
};

export default function UIFeedbackToasts() {
  const { toasts, dismissToast } = useUIFeedback();

  if (!toasts.length) return null;

  return (
    <div className="ui-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`ui-toast ui-toast--${toast.type}`}>
          <span className="material-symbols-outlined ui-toast-icon">{ICONS[toast.type] || ICONS.info}</span>
          <div className="ui-toast-body">
            {toast.title && <strong className="ui-toast-title">{toast.title}</strong>}
            <span className="ui-toast-message">{toast.message}</span>
          </div>
          <button
            type="button"
            className="ui-toast-close"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
