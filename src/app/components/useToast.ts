import { createContext, useContext } from 'react';

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
export type Show = (text: string, action?: Toast['action']) => void;

export const ToastContext = createContext<Show>(() => {});
/** Show a short confirmation, optionally with an action such as Undo. */
export const useToast = () => useContext(ToastContext);
