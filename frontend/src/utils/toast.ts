type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;

let activeToasts: ToastMessage[] = [];
const toastListeners = new Set<ToastListener>();

export function showToast(
  message: string,
  type: ToastType = 'info',
  title?: string,
  duration: number = 4200
) {
  const id = Math.random().toString(36).substring(2, 9);
  const toast: ToastMessage = { id, type, title, message, duration };
  activeToasts = [...activeToasts, toast];
  toastListeners.forEach((fn) => fn(activeToasts));

  setTimeout(() => {
    removeToast(id);
  }, duration);
}

export function removeToast(id: string) {
  activeToasts = activeToasts.filter((t) => t.id !== id);
  toastListeners.forEach((fn) => fn(activeToasts));
}

export function subscribeToasts(listener: ToastListener) {
  toastListeners.add(listener);
  listener(activeToasts);
  return () => {
    toastListeners.delete(listener);
  };
}
