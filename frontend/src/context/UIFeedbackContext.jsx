import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const UIFeedbackContext = createContext(null);

let toastSeq = 1;

export function UIFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((type, message, options = {}) => {
    if (!message) return;

    const id = toastSeq++;
    const duration = options.duration ?? 4200;
    const toast = {
      id,
      type,
      message,
      title: options.title || null,
    };

    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, duration);
    }
  }, []);

  const api = useMemo(
    () => ({
      toasts,
      dismissToast,
      info: (message, options) => pushToast('info', message, options),
      success: (message, options) => pushToast('success', message, options),
      warning: (message, options) => pushToast('warning', message, options),
      error: (message, options) => pushToast('error', message, options),
    }),
    [toasts, dismissToast, pushToast],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__eraots_ui_feedback__ = api;
    return () => {
      if (window.__eraots_ui_feedback__ === api) {
        delete window.__eraots_ui_feedback__;
      }
    };
  }, [api]);

  return <UIFeedbackContext.Provider value={api}>{children}</UIFeedbackContext.Provider>;
}

export function useUIFeedback() {
  const ctx = useContext(UIFeedbackContext);
  if (!ctx) {
    throw new Error('useUIFeedback must be used within UIFeedbackProvider');
  }
  return ctx;
}
