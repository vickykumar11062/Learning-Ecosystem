// Global loader for buttons
document.querySelectorAll("button[data-loading-text]").forEach((button) => {
  button.addEventListener("click", () => {
    const form = button.closest("form");

    if (form) {
      // Form submit button: show loading UI, but DO NOT disable the button
      button.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        ${button.getAttribute("data-loading-text") || "Processing..."}
      `;
    } else {
      // Non-form button (like payment or upload): disable button and show loader
      button.disabled = true;
      const originalText = button.innerHTML;
      button.setAttribute("data-original-text", originalText);

      button.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        ${button.getAttribute("data-loading-text") || "Processing..."}
      `;
    }
  });
});
