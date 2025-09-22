import { modal, lineModal, state, createListBtn, closeModal, closeLineModal } from './constants.js';
import { updateSelectedTags } from './tagsSystem.js';

// ---------------------------- MODAL EVENTS ----------------------------
function initModalEvents() {
    // Abrir modal de criar lista
    createListBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        modal.classList.add('show');
    });
    
    // Fechar modal de criar lista
    closeModal.addEventListener('click', () => {
        modal.classList.remove('show');
        modal.classList.add('hidden');
    });

    // Fechar modal de adicionar linha
    function fecharModalLine() {
        lineModal.classList.remove('show');
        setTimeout(() => {
            lineModal.classList.add('hidden');
        }, 300);
    }

    closeLineModal.addEventListener('click', () => {
        state.selectedTags = [];
        updateSelectedTags();
        fecharModalLine();
    });

    lineModal.addEventListener('click', (e) => {
        if (e.target === lineModal) {
            state.selectedTags = [];
            updateSelectedTags();
            fecharModalLine();
        }
    });
}

export { initModalEvents };