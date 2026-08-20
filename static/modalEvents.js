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

// ---------------------------- MODAL DE TESTE DE IMAGEM ----------------------------
let imageTestModal, closeImageTestModal, imageTestForm, testImageName, testImageType, testImageResult;
let isImageTestInitialized = false;

function initImageTestModal() {
    if (isImageTestInitialized) return;
    imageTestModal = document.getElementById('image-test-modal');
    closeImageTestModal = document.getElementById('close-image-test-modal');
    imageTestForm = document.getElementById('image-test-form');
    testImageName = document.getElementById('test-image-name');
    testImageType = document.getElementById('test-image-type');
    testImageResult = document.getElementById('test-image-result');

    if (!imageTestModal || !closeImageTestModal || !imageTestForm) {
        console.warn('Elementos do modal de teste de imagem não encontrados.');
        return;
    }

    // Fechar com o "X"
    closeImageTestModal.addEventListener('click', closeImageTestModalHandler);

    // Fechar clicando fora do conteúdo
    imageTestModal.addEventListener('click', outsideClickHandler);

    // Submissão do formulário
    imageTestForm.addEventListener('submit', handleImageTestSubmit);

    isImageTestInitialized = true;
}

function closeImageTestModalHandler() {
    if (imageTestModal) {
        imageTestModal.classList.remove('show');
        imageTestModal.classList.add('hidden');
        if (testImageResult) testImageResult.innerHTML = '';
        if (testImageName) testImageName.value = '';
    }
}

function outsideClickHandler(e) {
    if (e.target === imageTestModal) {
        closeImageTestModalHandler();
    }
}

async function handleImageTestSubmit(e) {
    e.preventDefault();
    const nome = testImageName.value.trim();
    const tipo = testImageType.value;
    if (!nome) {
        testImageResult.innerHTML = `
            <div style="width: 100%; text-align: center; padding: 30px; color: #e74c3c;">
                <i class="fas fa-exclamation-circle" style="font-size: 30px; display: block; margin-bottom: 10px;"></i>
                <p style="font-weight: 600;">Digite um título para buscar.</p>
            </div>
        `;
        return;
    }
    
    // Mostra loader
    testImageResult.innerHTML = `
        <div style="width: 100%; text-align: center; padding: 40px;">
            <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #4a6fc5; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <p style="margin-top: 15px; color: #666;">Buscando imagens para "${nome}"...</p>
        </div>
    `;
    
    try {
        const url = `/search_images?q=${encodeURIComponent(nome)}&type=${encodeURIComponent(tipo)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            testImageResult.innerHTML = `
                <div style="width: 100%; text-align: center; padding: 30px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 30px; display: block; margin-bottom: 10px;"></i>
                    <p style="font-weight: 600;">Erro: ${data.error}</p>
                </div>
            `;
            return;
        }

        if (data.image_urls && data.image_urls.length > 0) {
            let html = `
                <div style="width: 100%; margin-bottom: 15px;">
                    <p style="font-weight: 600; color: var(--color-text, #333);">
                        <i class="fas fa-check-circle" style="color: #27ae60;"></i>
                        Encontradas ${data.image_urls.length} imagem${data.image_urls.length > 1 ? 'ens' : ''}:
                    </p>
                </div>
            `;
            html += `<div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; width: 100%;">`;
            
            data.image_urls.forEach((url, index) => {
                html += `
                    <div class="image-result-item" style="
                        border: 2px solid var(--color-border, #e0e0e0);
                        padding: 12px;
                        border-radius: 12px;
                        max-width: 200px;
                        background: var(--color-card-bg, #fff);
                        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                        transition: transform 0.3s, box-shadow 0.3s;
                        position: relative;
                        cursor: pointer;
                    " onclick="window.open('${url}', '_blank')">
                        <img src="${url}" alt="Resultado ${index + 1}" 
                             style="width: 100%; height: 250px; border-radius: 8px; object-fit: cover; display: block;">
                        <div style="
                            position: absolute;
                            top: 8px;
                            right: 8px;
                            background: rgba(0,0,0,0.7);
                            color: white;
                            padding: 4px 10px;
                            border-radius: 20px;
                            font-size: 11px;
                            font-weight: 600;
                        ">
                            #${index + 1}
                        </div>
                        <div style="
                            margin-top: 10px;
                            display: flex;
                            gap: 8px;
                            justify-content: center;
                        ">
                            <button onclick="event.stopPropagation(); window.open('${url}', '_blank')" style="
                                padding: 6px 12px;
                                background: #4a6fc5;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: background 0.3s;
                            ">
                                <i class="fas fa-external-link-alt"></i> Abrir
                            </button>
                            <button onclick="event.stopPropagation(); navigator.clipboard.writeText('${url}').then(() => { alert('URL copiada!'); })" style="
                                padding: 6px 12px;
                                background: #2ecc71;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                                transition: background 0.3s;
                            ">
                                <i class="fas fa-copy"></i> Copiar
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            testImageResult.innerHTML = html;
        } else {
            testImageResult.innerHTML = `
                <div style="width: 100%; text-align: center; padding: 40px; color: #f39c12;">
                    <i class="fas fa-frown" style="font-size: 40px; display: block; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p style="font-weight: 600;">Nenhuma imagem encontrada para "${nome}"</p>
                    <p style="font-size: 14px; color: #999;">Tente usar um nome diferente ou verificar o tipo selecionado.</p>
                </div>
            `;
        }
    } catch (error) {
        testImageResult.innerHTML = `
            <div style="width: 100%; text-align: center; padding: 30px; color: #e74c3c;">
                <i class="fas fa-exclamation-triangle" style="font-size: 30px; display: block; margin-bottom: 10px;"></i>
                <p style="font-weight: 600;">Erro na requisição: ${error.message}</p>
            </div>
        `;
    }
}

function showImageTestModal() {
    if (imageTestModal) {
        imageTestModal.classList.remove('hidden');
        imageTestModal.classList.add('show');
        // Limpa resultados anteriores
        if (testImageResult) testImageResult.innerHTML = '';
        if (testImageName) testImageName.value = '';
    }
}

// Exportar funções
export { initModalEvents, initImageTestModal, showImageTestModal };