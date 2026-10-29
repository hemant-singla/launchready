// Transient confirmations with an optional action (e.g. Undo).
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { ToastContext, type Show, type Toast } from './useToast';

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<Show>((text, action) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <Check size={16} />
            <span>{t.text}</span>
            {t.action && (
              <button className="btn sm" onClick={() => { t.action?.run(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
