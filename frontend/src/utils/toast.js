// Toast utility to replace antd message
// This is a simple implementation that can be replaced with react-hot-toast or sonner later

class Toast {
  constructor() {
    this.container = null;
    this.toasts = new Map();
    this.counter = 0;
  }

  ensureContainer() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 9999;
        pointer-events: none;
      `;
      document.body.appendChild(this.container);
    }
  }

  show(message, type = 'info', duration = 3000) {
    this.ensureContainer();

    const id = ++this.counter;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const colors = {
      success: 'bg-green-50 border-green-200 text-green-800',
      error: 'bg-red-50 border-red-200 text-red-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      info: 'bg-blue-50 border-blue-200 text-blue-800',
    };

    toast.style.cssText = `
      margin-bottom: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 400px;
      pointer-events: auto;
      animation: slideIn 0.3s ease-out;
      font-size: 14px;
      line-height: 1.5;
    `;

    toast.className = `${colors[type] || colors.info}`;
    toast.textContent = message;

    // Add animation keyframes if not already added
    if (!document.getElementById('toast-animations')) {
      const style = document.createElement('style');
      style.id = 'toast-animations';
      style.textContent = `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    this.container.appendChild(toast);
    this.toasts.set(id, toast);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return () => this.remove(id);
  }

  remove(id) {
    const toast = this.toasts.get(id);
    if (toast) {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
        this.toasts.delete(id);
      }, 300);
    }
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  loading(message, duration = 0) {
    const id = ++this.counter;
    this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = 'bg-blue-50 border-blue-200 text-blue-800';
    toast.style.cssText = `
      margin-bottom: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 400px;
      pointer-events: auto;
      animation: slideIn 0.3s ease-out;
      font-size: 14px;
      line-height: 1.5;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    `;

    if (!document.getElementById('spinner-animation')) {
      const style = document.createElement('style');
      style.id = 'spinner-animation';
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    toast.appendChild(spinner);
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    this.container.appendChild(toast);
    this.toasts.set(id, toast);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return () => this.remove(id);
  }
}

const toast = new Toast();

// Export as default and named
export default toast;
export const message = toast;
