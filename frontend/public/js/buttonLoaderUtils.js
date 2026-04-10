// Button Loader Utility (Improved)
class ButtonLoader {
  static show(button, loadingText = 'Processing...') {
    if (!button) return;

    const form = button.closest('form');

    // Save original state
    button.setAttribute('data-original-html', button.innerHTML);

    if (!form) {
      button.disabled = true; // Only disable if NOT inside a form
    }

    // Maintain width
    button.setAttribute('data-original-width', button.offsetWidth + 'px');
    button.style.width = button.offsetWidth + 'px';

    // Set loading state
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      ${loadingText}
    `;
  }

  static reset(button) {
    if (!button) return;

    const form = button.closest('form');
    const originalHtml = button.getAttribute('data-original-html');

    if (!form) {
      button.disabled = false; // Re-enable only if NOT from a form submission
    }

    // Restore content and width
    if (originalHtml) button.innerHTML = originalHtml;
    button.style.width = button.getAttribute('data-original-width') || 'auto';
  }

  static init() {
    document.addEventListener('click', (e) => {
      const button = e.target.closest('[data-loading-text]');
      if (!button) return;

      const loadingText = button.getAttribute('data-loading-text') || 'Processing...';
      ButtonLoader.show(button, loadingText);

      const form = button.closest('form');
      if (form) {
        // Reset for invalid form submissions
        form.addEventListener('invalid', () => {
          ButtonLoader.reset(button);
        }, { once: true });
      }
    });
  }
}

// Initialize loader on DOM load
document.addEventListener('DOMContentLoaded', ButtonLoader.init);

// Export (if needed for modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ButtonLoader;
}
