import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [snackbar, setSnackbar] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setSnackbar(null);
  }, []);

  const notify = useCallback((message, type = "info") => {
    if (!message) return;
    clearTimeout(timerRef.current);
    setSnackbar({ message, type });
    timerRef.current = setTimeout(() => setSnackbar(null), 4500);
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => {
    setConfirmation({
      title: options.title || "Are you sure?",
      message: options.message,
      confirmLabel: options.confirmLabel || "Confirm",
      danger: Boolean(options.danger),
      resolve,
    });
  }), []);

  function settleConfirmation(result) {
    confirmation?.resolve(result);
    setConfirmation(null);
  }

  return (
    <NotificationContext.Provider value={{ notify, confirm, dismiss }}>
      {children}
      <div className="snackbar-region" aria-live="polite" aria-atomic="true">
        {snackbar && (
          <div className={`snackbar snackbar-${snackbar.type}`} role="status">
            <span className="snackbar-indicator" />
            <span>{snackbar.message}</span>
            <button type="button" onClick={dismiss} aria-label="Dismiss notification">×</button>
          </div>
        )}
      </div>
      {confirmation && (
        <div className="confirm-backdrop" role="presentation" onMouseDown={() => settleConfirmation(false)}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="confirm-symbol">!</span>
            <h2 id="confirm-title">{confirmation.title}</h2>
            <p>{confirmation.message}</p>
            <div className="confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => settleConfirmation(false)}>Cancel</button>
              <button type="button" className={confirmation.danger ? "danger-btn" : "accent-btn"} onClick={() => settleConfirmation(true)}>{confirmation.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used inside NotificationProvider");
  return context;
}
