'use strict';

// Entry point — runs after all scripts are loaded
document.addEventListener('DOMContentLoaded', () => {
  // Instantiate UI controller (it sets up all event listeners and renders page 1)
  window._ui = new UI();
});
