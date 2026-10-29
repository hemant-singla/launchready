// Small presentational building blocks used across views.
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Status } from '../../engine/types';
import { STATUS_LABEL } from '../lib/format';

export function StatusText({ status }: { status: Status }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** Close on Escape and move focus into the panel; restore focus on close. */
function useModal(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus], input, button, [href], select, textarea');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panel) {
        const items = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const [a, z] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return ref;
}

export function Dialog({ title, onClose, children, footer, label }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; label?: string }) {
  const ref = useModal(onClose);
  return (
    <>
      <div className="scrim top" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} ref={ref}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <span style={{ flex: 1 }} />
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </>
  );
}

/** A bare modal panel (no chrome), used by the command palette. */
export function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useModal(onClose);
  return (
    <>
      <div className="scrim top" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        {children}
      </div>
    </>
  );
}

export function Drawer({ onClose, header, children, footer, label }: { onClose: () => void; header: ReactNode; children: ReactNode; footer?: ReactNode; label: string }) {
  const ref = useModal(onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close details">
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}
