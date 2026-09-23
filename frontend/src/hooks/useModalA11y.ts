import { useEffect, useRef } from 'react';

/**
 * useModalA11y
 * Enforces WAI-ARIA accessibility requirements for modal dialogs:
 * 1. Closes on Escape key press (stopping event propagation)
 * 2. Saves previous activeElement on open and restores focus on close
 * 3. Focuses the modal or first focusable element inside the modal upon mounting
 */
export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  modalRef?: React.RefObject<HTMLElement | null>
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save previous focused element
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    // Shift focus into modal
    const timer = setTimeout(() => {
      if (modalRef?.current) {
        const focusable = modalRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && typeof focusable.focus === 'function') {
          focusable.focus();
        } else if (typeof modalRef.current.focus === 'function') {
          modalRef.current.focus();
        }
      }
    }, 40);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      clearTimeout(timer);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose, modalRef]);
}

export default useModalA11y;
