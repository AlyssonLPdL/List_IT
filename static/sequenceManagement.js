// ---------------------------- GERENCIAMENTO DE SEQUÊNCIAS ----------------------------
async function refreshSequenceDisplay(itemId = null) {
    const sequenceModal = document.getElementById('modal-sequence');

    if (!itemId) {
        sequenceModal.innerHTML = "";
        sequenceModal.style.height = "0";
        return;
    }

    try {
        // Buscar sequências associadas ao item
        const sequencesRes = await fetch(`/linhas/${itemId}/sequencias`);
        const sequencesData = await sequencesRes.json();
        const sequenceId = sequencesData.sequencias[0]?.id;

        if (!sequenceId) {
            sequenceModal.innerHTML = "";
            sequenceModal.style.height = "0";
            return;
        }

        // Buscar detalhes da sequência
        const response = await fetch(`/sequencias/${sequenceId}`);
        const sequence = await response.json();

        // Atualizar HTML do modal
        sequenceModal.innerHTML = `
            <div class="sequence-display" id="sequenceDisplay">
                <div class="sequence-list" id="sequenceList">
                    ${sequence.itens.map(item => `
                        <div class="sequence-card">
                            <div class="order">${item.ordem}</div>
                            <button class="remove-sequence-item" data-id="${item.id}">&times;</button>
                            <img src="${item.imagem_url}" alt="${item.nome}">
                            <p class="sequence-text">${item.nome}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        sequenceModal.style.height = "auto";

        // Adicionar event listeners
        document.querySelectorAll('.remove-sequence-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                await fetch(`/sequencias/${sequenceId}/itens/${e.target.dataset.id}`, {
                    method: 'DELETE'
                });
                refreshSequenceDisplay(itemId);
            });
        });

        // Evento de clique nos itens da sequência
        // Evento de clique nos itens da sequência
        const sequenceList = document.getElementById('sequenceList');
        sequenceList.addEventListener('click', (e) => {
            // evita que outros handlers globais (delegados) também respondam a este clique
            e.stopPropagation();

            // se clicou no botão de remover, ignore: esse botão tem comportamento próprio
            if (e.target.closest('.remove-sequence-item')) return;

            const card = e.target.closest('.sequence-card');
            if (!card) return;

            const index = Array.from(sequenceList.children).indexOf(card);
            const item = sequence.itens[index];
            if (item) {
                // dispara evento global (mantemos isso — é útil se você quiser desacoplar módulos)
                const event = new CustomEvent('showItemDetails', { detail: { item, navList: sequence.itens } });
                document.dispatchEvent(event);
            }
        });

    } catch (error) {
        console.error("Erro ao carregar sequência:", error);
        sequenceModal.innerHTML = `<p class="error">Erro ao carregar sequência</p>`;
    }
}

async function showAddToSequenceModal(currentItem) {
    // Remove anterior se existir
    document.querySelector('.sequence-search-modal')?.remove();

    // ---- Coleta sequência do item atual ----
    let sequenceId = null;
    try {
        const seqRes = await fetch(`/linhas/${currentItem.id}/sequencias`);
        const seqData = await seqRes.json();
        sequenceId = seqData.sequencias[0]?.id ?? null;
    } catch (err) {
        console.error('Erro ao buscar sequência do item:', err);
    }

    if (!sequenceId) {
        alert('Sequência não encontrada!');
        return;
    }

    // ---- Busca todos os itens da lista ----
    let allItems = [];
    try {
        const response = await fetch(`/linhas/${currentItem.lista_id}`);
        allItems = await response.json();
    } catch (err) {
        console.error('Erro ao carregar itens:', err);
        return;
    }

    // ---- Busca IDs já presentes na sequência (para marcar/desabilitar) ----
    let alreadyInSequence = new Set();
    try {
        const seqDetailRes = await fetch(`/sequencias/${sequenceId}`);
        const seqDetail = await seqDetailRes.json();
        (seqDetail.itens || []).forEach(it => alreadyInSequence.add(String(it.id)));
    } catch (err) {
        console.warn('Não foi possível verificar itens da sequência:', err);
    }

    // ---- Monta o modal ----
    const modal = document.createElement('div');
    modal.className = 'sequence-search-modal';
    modal.innerHTML = `
        <div class="sequence-search-content">
            <button class="modal-close-btn" data-close aria-label="Fechar">
                <i class="fas fa-times"></i>
            </button>

            <header class="info-extra-header">
                <span class="info-extra-badge info-extra-badge-accent">
                    <i class="fas fa-project-diagram"></i> Adicionar à sequência
                </span>
                <h3>${escapeHtmlClient(currentItem.nome)}</h3>
            </header>

            <div class="sequence-search-body">
                <div class="sequence-search-input-wrap">
                    <i class="fas fa-search"></i>
                    <input
                        type="text"
                        id="sequenceSearchInput"
                        placeholder="Pesquisar itens da lista..."
                        autocomplete="off"
                    >
                </div>

                <div class="search-results" id="sequenceSearchResults">
                    <div class="sequence-search-empty">
                        <i class="fas fa-search"></i>
                        <p>Digite para buscar itens da lista</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector('#sequenceSearchInput');
    const resultsContainer = modal.querySelector('#sequenceSearchResults');

    // Foco automático na busca
    setTimeout(() => input.focus(), 50);

    // ---- Helpers ----
    const showEmpty = (icon, text) => {
        resultsContainer.innerHTML = `
            <div class="sequence-search-empty">
                <i class="fas ${icon}"></i>
                <p>${text}</p>
            </div>
        `;
    };

    const renderResults = (items) => {
        if (items.length === 0) {
            showEmpty('fa-inbox', 'Nenhum resultado');
            return;
        }

        resultsContainer.innerHTML = items.map(item => {
            const inSeq = alreadyInSequence.has(String(item.id));
            return `
                <div class="sequence-search-result ${inSeq ? 'in-sequence' : ''}"
                     data-id="${item.id}"
                     ${inSeq ? 'data-disabled="1"' : ''}>
                    <img src="${item.imagem_url || 'https://via.placeholder.com/60x90/1a1e28/6a7184?text=?'}"
                         alt="${escapeHtmlClient(item.nome)}" loading="lazy">
                    <div class="sequence-search-result-info">
                        <span class="sequence-search-result-name">${escapeHtmlClient(item.nome)}</span>
                        <div class="sequence-search-result-meta">
                            ${item.conteudo ? `<span class="info-type">${escapeHtmlClient(item.conteudo)}</span>` : ''}
                            ${item.episodio ? `<span class="info-ep"><i class="fas fa-hashtag"></i> ${escapeHtmlClient(String(item.episodio))}</span>` : ''}
                        </div>
                    </div>
                    <span class="sequence-search-result-action">
                        ${inSeq
                            ? '<i class="fas fa-check"></i>'
                            : '<i class="fas fa-plus"></i>'}
                    </span>
                </div>
            `;
        }).join('');

        // Listeners dos cards
        resultsContainer.querySelectorAll('.sequence-search-result').forEach(div => {
            div.addEventListener('click', async () => {
                if (div.dataset.disabled === '1') return;

                div.classList.add('loading');
                div.querySelector('.sequence-search-result-action').innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    // Descobre a próxima ordem
                    const seqDetailRes = await fetch(`/sequencias/${sequenceId}`);
                    const seqDetail = await seqDetailRes.json();
                    const ordem = (seqDetail.itens?.length || 0) + 1;

                    // Adiciona
                    await fetch(`/sequencias/${sequenceId}/itens`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ linha_id: parseInt(div.dataset.id), ordem })
                    });

                    // Marca como já adicionado
                    alreadyInSequence.add(String(div.dataset.id));
                    div.classList.add('in-sequence');
                    div.dataset.disabled = '1';
                    div.querySelector('.sequence-search-result-action').innerHTML =
                        '<i class="fas fa-check"></i>';

                    // Atualiza painel da sequência
                    await refreshSequenceDisplay(currentItem.id);
                } catch (err) {
                    console.error('Erro ao adicionar item:', err);
                    div.classList.remove('loading');
                    div.querySelector('.sequence-search-result-action').innerHTML =
                        '<i class="fas fa-plus"></i>';
                    alert('Erro ao adicionar item à sequência.');
                }
            });
        });
    };

    // ---- Busca ----
    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();

        if (!term) {
            showEmpty('fa-search', 'Digite para buscar itens da lista');
            return;
        }

        const filtered = allItems.filter(i =>
            i.id !== currentItem.id &&
            i.nome.toLowerCase().includes(term)
        );

        renderResults(filtered);
    });

    // ---- Fechar ----
    const close = () => document.body.removeChild(modal);
    modal.querySelector('[data-close]')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    // ESC fecha
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Helper local de escape (para evitar depender de exports)
function escapeHtmlClient(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

async function getSequenceButtons(itemId) {
    const response = await fetch(`/linhas/${itemId}/sequencias`);
    const data = await response.json();

    if (data.total_sequencias > 0) {
        return `
                <button class="sequence-action" id="addToSequence">Adicionar à Sequência</button>
                <button class="sequence-action" id="deleteSequence">Apagar Sequência</button>
            `;
    }
    return `
            <button class="sequence-action" id="createSequence">Criar Sequência</button>
        `;
}

export { refreshSequenceDisplay, showAddToSequenceModal, getSequenceButtons };