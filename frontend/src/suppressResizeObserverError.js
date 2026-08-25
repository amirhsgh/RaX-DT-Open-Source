/**
 * Suppress ResizeObserver errors
 * This is a known benign error from Radix UI components used by shadcn/ui
 * It doesn't affect functionality but creates noise in the console
 */

// Store original error handler
const originalError = console.error;

// Override console.error to filter ResizeObserver errors
console.error = function(...args) {
  // Check if this is a ResizeObserver error
  if (
    args &&
    args[0] &&
    typeof args[0] === 'string' &&
    args[0].includes('ResizeObserver loop')
  ) {
    // Suppress this specific error
    return;
  }

  // Pass through all other errors
  originalError.apply(console, args);
};

// Suppress the error in React's error overlay
const suppressErrorOverlay = () => {
  // Store the original error handler
  const originalOnError = window.onerror;

  window.onerror = function(message, source, lineno, colno, error) {
    // Check if this is a ResizeObserver error
    if (typeof message === 'string' && message.includes('ResizeObserver loop')) {
      // Prevent React error overlay from showing
      return true;
    }

    // Call original handler for other errors
    if (originalOnError) {
      return originalOnError.apply(this, arguments);
    }
    return false;
  };

  // Also capture at the window level
  window.addEventListener('error', (event) => {
    if (
      event.message &&
      typeof event.message === 'string' &&
      event.message.includes('ResizeObserver loop')
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, true);
};

// NOTE: there used to be a ResizeObserver monkey-patch here that deferred
// every callback into requestAnimationFrame. That is what *produces* this
// warning rather than preventing it: moving the callback out of the browser's
// observation cycle means its layout changes land after delivery, so the
// browser reports the leftover notifications. Removed - observers now run
// normally.

// The remaining handlers stay because the warning itself is benign and
// spec-defined (the browser is telling us it needs another layout pass), but
// the dev-server overlay escalates it to a full-screen fatal error.
suppressErrorOverlay();

export default function initResizeObserverErrorSuppression() {
  // Already initialized above, this export is just for import side effects
}
