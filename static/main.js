import { initTheme } from './utils.js';
import { initModalEvents } from './modalEvents.js';
import { loadLists } from './listManagement.js';
import { showAllTags } from './tagsSystem.js';

// ---------------------------- INICIALIZAÇÃO ----------------------------
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initModalEvents();
    loadLists();
    showAllTags();
});