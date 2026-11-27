/**
 * Central Toast Notification Service
 * Broadcasts toast notifications globally across the application.
 */

export interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
}

type ToastListener = (toast: ToastMessage) => void;
const listeners: Set<ToastListener> = new Set();

export const toast = {
  error: (title: string, message: string, duration = 5000) => {
    emit({ id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, type: 'error', title, message, duration });
  },
  success: (title: string, message: string, duration = 4000) => {
    emit({ id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, type: 'success', title, message, duration });
  },
  warning: (title: string, message: string, duration = 4000) => {
    emit({ id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, type: 'warning', title, message, duration });
  },
  info: (title: string, message: string, duration = 4000) => {
    emit({ id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, type: 'info', title, message, duration });
  },
  subscribe: (listener: ToastListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

function emit(toastMsg: ToastMessage) {
  listeners.forEach(fn => fn(toastMsg));
}
