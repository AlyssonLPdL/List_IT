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
    // 1) Se já existir, remove‑o (ou simplesmente sai)
    const previous = document.querySelector('.sequence-search-modal');
    if (previous) {
        previous.remove();
        // ou: return;  // só não reabra se já estiver um modal aberto
    }
    // 1) Cria e anexa o modal
    const modal = document.createElement('div');
    modal.className = 'sequence-search-modal';
    modal.innerHTML = `
                <div class="sequence-search-content">
                <h3>Adicionar à Sequência</h3>
                <input type="text" placeholder="Pesquisar itens..." id="sequenceSearchInput">
                <div class="search-results" id="sequenceSearchResults"></div>
                </div>
            `;
    document.body.appendChild(modal);

    // 2) Busca todos os itens da lista
    const response = await fetch(`/linhas/${currentItem.lista_id}`);
    const allItems = await response.json();

    // 3) Capture o input e o container DE DENTRO do modal  
    const input = modal.querySelector('#sequenceSearchInput');
    const resultsContainer = modal.querySelector('#sequenceSearchResults');

    // 4) Limpa inicialmente
    resultsContainer.innerHTML = '';

    // 5) Adiciona o listener no input escopo-local
    input.addEventListener('input', e => {
        const term = e.target.value.toLowerCase().trim();
        console.log('Buscando termo:', term);               // agora vai logar
        if (!term) {
            resultsContainer.innerHTML = '';
            return;
        }
        const filtered = allItems.filter(i =>
            i.id !== currentItem.id &&
            i.nome.toLowerCase().includes(term)
        );
        console.log('Filtrados:', filtered);                // e aqui também
        displaySearchResults(filtered, currentItem, modal);
    });

    // 6) Fecha se clicar fora
    modal.addEventListener('click', e => {
        if (e.target === modal) document.body.removeChild(modal);
    });

    function displaySearchResults(items, currentItem, modal) {
        const resultsContainer = modal.querySelector('#sequenceSearchResults');
        resultsContainer.innerHTML = '';

        if (items.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">Nenhum resultado</div>';
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'search-result-item add-to-sequence-btn';
            div.dataset.id = item.id;
            div.innerHTML = `
                <img src="${item.imagem_url}" width="50" height="75" alt="${item.nome}">
                <span>${item.nome}</span>
            `;
            resultsContainer.appendChild(div);

            div.addEventListener('click', async () => {
                // 1. Buscar a sequência do currentItem
                const seqRes = await fetch(`/linhas/${currentItem.id}/sequencias`);
                const seqData = await seqRes.json();
                const sequenceId = seqData.sequencias[0]?.id;
                if (!sequenceId) {
                    alert("Sequência não encontrada!");
                    return;
                }

                // 2. Descobrir a ordem máxima atual
                const seqDetailRes = await fetch(`/sequencias/${sequenceId}`);
                const seqDetail = await seqDetailRes.json();
                const ordem = (seqDetail.itens?.length || 0) + 1;

                // 3. Adicionar o item selecionado à sequência
                await fetch(`/sequencias/${sequenceId}/itens`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ linha_id: item.id, ordem })
                });

                document.body.removeChild(modal);
                refreshSequenceDisplay(currentItem.id);
            });
        });
    }
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