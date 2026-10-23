import {
    state, mainContent, itemInfoContent, mainInfoContent, lineForm, modalInfo, modalPhoto, sequenceModal, lineModal
} from './constants.js';
import { exportItemAsImage } from './exportFunctions.js';
import { initResizeObserver } from './utils.js';
import {
    extractBaseAndNumber, romanToDecimal, applyFilter, getEpisodeLabel,
    getClasseExtra, getStatusIcon, getOpiniaoIcon
} from './utils.js';
import { showHighlights } from './highlights.js';
import { getSequenceButtons, refreshSequenceDisplay, showAddToSequenceModal } from './sequenceManagement.js';
import { updateSelectedTags, showAllTags } from './tagsSystem.js';
import { generateTemplateHTML, showTemplatePreview } from './exportFunctions.js';
import { showImageTestModal, initImageTestModal } from './modalEvents.js';

// ---------------------------- GERENCIAMENTO DE LINHAS ----------------------------
/**
     * Corrige um único item:
     *  - Se faltar imagem, busca e dá PUT /linhas/:id/imagem
     *  - Se faltar sinopse ou menos de 3 sinônimos, GET /search_details e PUT /linhas/:id/details
     */

// ===== SORT STATE (module-level) =====
let currentOrder = 'az';

function sortLines(linhas, order) {
    if (order === 'az') {
        return [...linhas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    }
    if (order === 'za') {
        return [...linhas].sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR', { sensitivity: 'base' }));
    }
    if (order === 'ep') {
        return [...linhas].sort((a, b) => (parseInt(a.episodio) || 0) - (parseInt(b.episodio) || 0));
    }
    if (order === 'ep-desc') {
        return [...linhas].sort((a, b) => (parseInt(b.episodio) || 0) - (parseInt(a.episodio) || 0));
    }
    if (order === 'opinion') {
        return [...linhas].sort((a, b) => {
            function getPriority(item) {
                const classe = getClasseExtra(item);
                const opiniao = (item.opiniao || '').trim();
                if (classe === 'BestLove' && (item.tags || '').includes('Goat')) return 0;
                if (classe === 'BestLove') return 1;
                if (classe === 'Goat') return 2;
                if (classe === 'Love' && opiniao === "Favorito") return 3;
                const opiniaoOrder = ["Favorito","Muito Bom","Recomendo","Bom","Mediano","Ruim","Horrivel","Não vi"];
                const idx = opiniaoOrder.indexOf(opiniao);
                return idx === -1 ? 99 : (4 + idx);
            }
            return getPriority(a) - getPriority(b);
        });
    }
    return linhas;
}

// ===== TAGS SEARCH (module-level) =====
function setupTagsSearch() {
    const input = document.getElementById('tags-search-input');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';

    input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        document.querySelectorAll('#tags-accordion-container .accordion-item').forEach(item => {
            let visible = 0;
            item.querySelectorAll('.tag').forEach(tagEl => {
                const show = !q || tagEl.textContent.toLowerCase().includes(q);
                tagEl.style.display = show ? '' : 'none';
                if (show) visible++;
            });
            if (q) {
                if (visible === 0) {
                    item.style.display = 'none';
                } else {
                    item.style.display = '';
                    item.classList.remove('hidden');
                    item.querySelector('.accordion-content')?.classList.remove('hidden');
                    item.querySelector('.accordion-header')?.classList.add('expanded');
                }
            } else {
                item.style.display = '';
                item.querySelector('.accordion-content')?.classList.add('hidden');
                item.querySelector('.accordion-header')?.classList.remove('expanded');
                item.querySelectorAll('.tag').forEach(t => t.style.display = '');
            }
        });
    });
}

async function corrigirItem(item) {
    const tipo = ["Anime", "Filme"].includes(item.conteudo) ? "anime" : "manga";

    // 1) Primeiro verifica se precisa de imagem
    if (!item.imagem_url || item.imagem_url.includes("placeholder")) {
        try {
            const imgUrl = await fetchImageUrl(item.nome, tipo);
            if (imgUrl && !imgUrl.includes("placeholder")) {
                await fetch(`/linhas/${item.id}/imagem`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imagem_url: imgUrl })
                });
                console.log(`🖼️ Imagem salva para ${item.nome}`);
                item.imagem_url = imgUrl; // Atualiza localmente
            }
        } catch (e) {
            console.warn(`Erro ao salvar imagem de ${item.nome}:`, e);
        }
    }

    // 2) Verifica se precisa de detalhes (sinopse ou sinônimos)
    const needsDetails = !item.sinopse || !Array.isArray(item.sinonimos) || item.sinonimos.length < 3;

    if (needsDetails) {
        try {
            const resp = await fetch(
                `/search_details?q=${encodeURIComponent(item.nome)}&type=${tipo}`
            );

            if (!resp.ok) {
                console.warn(`Nenhum detalhe para ${item.nome}: status ${resp.status}`);
                return;
            }

            const det = await resp.json();

            // Só atualiza se vierem dados válidos
            if (det.sinopse && Array.isArray(det.sinonimos)) {
                await fetch(`/linhas/${item.id}/details`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sinopse: det.sinopse,
                        sinonimos: det.sinonimos
                    })
                });
                console.log(`📘 Detalhes salvos para ${item.nome}`);

                // Atualiza localmente
                item.sinopse = det.sinopse;
                item.sinonimos = det.sinonimos;
            }
        } catch (e) {
            console.warn(`Erro ao buscar detalhes de ${item.nome}:`, e);
        }
    } else {
        console.log(`✅ ${item.nome} já possui detalhes completos, pulando`);
    }
}

/**
 * Recebe um array de itens e processa um por um, com delay entre eles
 */
async function processarFilaItens(itens) {
    for (const item of itens) {
        await corrigirItem(item);
        // aguarda 800 ms para não estourar rate-limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Função para exibir detalhes da lista e suas linhas
async function showListDetails(lista) {
    initImageTestModal();
    state.currentList = lista;

    const response = await fetch(`/linhas/${lista.id}`);
    const linhas = await response.json();
    window.__linhasAtuais = linhas;

    // Ordena as linhas utilizando funções utilitárias
    linhas.sort((a, b) => {
        const aInfo = extractBaseAndNumber(a.nome);
        const bInfo = extractBaseAndNumber(b.nome);

        const baseCompare = aInfo.nomeBase.localeCompare(bInfo.nomeBase);
        if (baseCompare !== 0) return baseCompare;

        const aNumero = romanToDecimal(aInfo.numeroRomano);
        const bNumero = romanToDecimal(bInfo.numeroRomano);

        return aNumero - bNumero;
    });


    mainContent.innerHTML = `
        <div class="list-view">
            <!-- HERO HEADER -->
            <header class="list-header">
                <div class="list-header-inner">
                    <div class="list-header-info">
                        <span class="list-badge"><i class="fas fa-layer-group"></i> Lista</span>
                        <div class="list-title-row">
                            <h1 class="list-title">${lista.nome}</h1>
                        </div>
                        <div class="list-header-meta">
                            <span class="meta-chip"><i class="fas fa-film"></i> <strong>${linhas.length}</strong> títulos</span>
                            <label class="censure-toggle">
                                <span class="switch">
                                    <input type="checkbox" id="toggle-censure">
                                    <span class="slider"></span>
                                </span>
                                <span class="censure-label">Conteúdo adulto</span>
                            </label>
                        </div>
                    </div>
                </div>
            </header>

            <!-- TOOLBAR -->
            <div class="search-section">
                <div class="search-toolbar">
                    <div class="search-filter">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" id="search-name" placeholder="Buscar por nome ou sinônimo...">
                    </div>
                    <button class="toolbar-btn" id="filter-toggle" type="button">
                        <i class="fas fa-sliders-h"></i>
                        <span>Filtros</span>
                    </button>
                    <div class="toolbar-divider"></div>
                    <button class="toolbar-btn toolbar-btn-primary" id="add-line-btn" type="button">
                        <i class="fas fa-plus"></i>
                        <span>Adicionar</span>
                    </button>
                    <button class="toolbar-btn" id="export-btn" type="button">
                        <i class="fas fa-file-export"></i>
                        <span>Exportar</span>
                    </button>
                </div>

                <!-- FILTER PANEL -->
                <div id="filter-panel" class="hidden">
                    <div class="filter-panel-inner">
                        <div class="filter-block">
                            <h4 class="filter-block-title"><i class="fas fa-circle-dot"></i> Status</h4>
                            <div class="filter-section" data-type="status"></div>
                        </div>
                        <div class="filter-block">
                            <h4 class="filter-block-title"><i class="fas fa-tag"></i> Conteúdo</h4>
                            <div class="filter-section" data-type="conteudo"></div>
                        </div>
                        <div class="filter-block">
                            <h4 class="filter-block-title"><i class="fas fa-star"></i> Opinião</h4>
                            <div class="filter-section" data-type="opiniao"></div>
                        </div>
                        <div class="filter-block">
                            <h4 class="filter-block-title"><i class="fas fa-hashtag"></i> Tags</h4>
                            <div class="filter-section" data-type="tags"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SORT + COUNT -->
            <div class="list-toolbar-row">
                <span class="results-count"><i class="fas fa-list-ul"></i> <span id="results-count-value">${linhas.length}</span> títulos</span>
                <div class="order-buttons">
                    <span class="order-label">Ordenar:</span>
                    <button id="order-az" title="Nome A-Z" type="button"><i class="fas fa-arrow-down-a-z"></i></button>
                    <button id="order-za" title="Nome Z-A" type="button"><i class="fas fa-arrow-up-a-z"></i></button>
                    <button id="order-ep" title="Episódio crescente" type="button"><i class="fas fa-arrow-down-1-9"></i></button>
                    <button id="order-ep-desc" title="Episódio decrescente" type="button"><i class="fas fa-arrow-up-1-9"></i></button>
                    <button id="order-opinion" title="Opinião" type="button"><i class="fas fa-star"></i></button>
                </div>
            </div>

            <!-- ITENS + HIGHLIGHTS -->
            <div class="items-container">
                <div class="items-grid">
                    ${linhas.length > 0 ? linhas.map(item => `
                    <div class="item-card ${getClasseExtra(item)}" data-item-id="${item.id}">
                        <div class="item-card-cover">
                            <img src="${item.imagem_url || 'https://via.placeholder.com/300x450/1a1e28/6a7184?text=Sem+Capa'}" alt="${item.nome}" loading="lazy">
                            <div class="item-card-overlay"></div>
                            <div class="status-indicator">${getStatusIcon(item.status)}</div>
                            <div class="opinion-indicator">${getOpiniaoIcon(item.opiniao)}</div>
                        </div>
                        <div class="item-card-content">
                            <h3 class="item-card-title">${item.nome}</h3>
                            <div class="item-card-info">
                                <span class="info-ep"><i class="fas fa-hashtag"></i> ${item.episodio || '—'}</span>
                                <span class="info-type">${item.conteudo || ''}</span>
                            </div>
                        </div>
                    </div>
                    `).join('') : `
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <h3>Nenhum item encontrado</h3>
                        <p>Adicione novos itens ou ajuste seus filtros</p>
                    </div>
                    `}
                </div>

                <aside class="highlights-section">
                    <div class="highlights-header">
                        <h3><i class="fas fa-fire"></i> Para Verificar</h3>
                    </div>
                    <div class="highlights-list"></div>
                </aside>
            </div>
        </div>
    `;

    const header = document.querySelector('.list-header');
    if (header) {
        const title = header.querySelector('.list-title');
        if (title) {
            const oldBtn = header.querySelector('#test-image-btn');
            if (oldBtn) oldBtn.remove();

            const testBtn = document.createElement('button');
            testBtn.id = 'test-image-btn';
            testBtn.className = 'btn';
            testBtn.textContent = 'Testar Imagem';
            testBtn.style.marginLeft = '10px';
            title.parentNode.insertBefore(testBtn, title.nextSibling);

            // Adiciona evento para abrir o modal
            testBtn.addEventListener('click', showImageTestModal);
        }
    }

    // Adicione os listeners:

    const faltantes = linhas.filter(item => item.needs_details);
    console.log(`🔍 ${faltantes.length} itens realmente precisam de detalhes`);

    // ...dentro de showListDetails, após definir os listeners:
    function setActiveOrderButton(id) {
        document.querySelectorAll('.order-buttons button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
    }

    const orderHandlers = {
        'order-az':        'az',
        'order-za':        'za',
        'order-ep':        'ep',
        'order-ep-desc':   'ep-desc',
        'order-opinion':   'opinion',
    };

    Object.entries(orderHandlers).forEach(([btnId, order]) => {
        document.getElementById(btnId)?.addEventListener('click', () => {
            currentOrder = order;
            setActiveOrderButton(btnId);
            // ⭐ reordena usando a lista filtrada atual (se existir) ou a completa
            showItems(window.__itensVisiveis && window.__itensVisiveis.length
                ? window.__itensVisiveis
                : linhas);
        });
    });

    const toggleCensure = document.getElementById('toggle-censure');
    toggleCensure.addEventListener('change', () => applyFilter(linhas));

    // Aplica o filtro inicial com base no estado do switch
    applyFilter(linhas);

    const panel = document.getElementById('filter-panel');
    const statuses = [...new Set(linhas.map(i => i.status))];
    const conteudos = [...new Set(linhas.map(i => i.conteudo))];
    const opinioes = [...new Set(linhas.map(i => i.opiniao))];
    const allTags = linhas.flatMap(i => i.tags ? i.tags.split(',') : []);
    const tags = [...new Set(allTags.map(t => t.trim()))].sort();

    const buildSection = (items, sectionEl) => {
        items.forEach(item => {
            const span = document.createElement('span');
            span.textContent = item;
            span.classList.add('filter-option');
            span.dataset.value = item;
            sectionEl.appendChild(span);
        });
    };

    buildSection(statuses, panel.querySelector('[data-type="status"]'));
    buildSection(conteudos, panel.querySelector('[data-type="conteudo"]'));
    buildSection(opinioes, panel.querySelector('[data-type="opiniao"]'));
    buildSection(tags, panel.querySelector('[data-type="tags"]'));

    // 3) Toggle do painel
    document.getElementById('filter-toggle').addEventListener('click', () => {
        panel.classList.toggle('hidden')
        const filterButton = document.getElementById('filter-toggle');
        filterButton.classList.toggle('active');
    });

    // 4) Seleções e filtro
    const selected = {
        status: { include: new Set(), exclude: new Set(), flexible: new Set() },
        conteudo: { include: new Set(), exclude: new Set(), flexible: new Set() },
        opiniao: { include: new Set(), exclude: new Set(), flexible: new Set() },
        tags: { include: new Set(), exclude: new Set(), flexible: new Set() }
    };

    panel.addEventListener('click', e => {
        if (!e.target.classList.contains('filter-option')) return;

        const type = e.target.closest('.filter-section').dataset.type;
        const value = e.target.dataset.value;
        const sel = selected[type];

        // Ciclo de 4 estados: neutro → include → exclude → flexible → neutro
        if (sel.include.has(value)) {
            // Estado atual: INCLUDE → muda para EXCLUDE
            sel.include.delete(value);
            sel.exclude.add(value);
            e.target.classList.remove('included');
            e.target.classList.add('excluded');
        } else if (sel.exclude.has(value)) {
            // Estado atual: EXCLUDE → muda para FLEXIBLE
            sel.exclude.delete(value);
            sel.flexible.add(value);
            e.target.classList.remove('excluded');
            e.target.classList.add('flexible');
        } else if (sel.flexible.has(value)) {
            // Estado atual: FLEXIBLE → muda para NEUTRO
            sel.flexible.delete(value);
            e.target.classList.remove('flexible');
        } else {
            // Estado atual: NEUTRO → muda para INCLUDE
            sel.include.add(value);
            e.target.classList.add('included');
        }

        filterItems(linhas, selected);
    });

    // Reaplica a lista quando o switch de Hentai muda
    const filterToggle = document.getElementById('filter-toggle');

    document.getElementById('add-line-btn').addEventListener('click', () => {
        state.formMode = 'add';
        lineForm.reset();
        state.selectedTags = [];
        updateSelectedTags();
        lineModal.classList.remove('hidden');
        lineModal.classList.add('show');
        initResizeObserver();
        // Adicione esta linha:
        setTimeout(() => {
            showAllTags();
            setupTagsSearch();
        }, 100);
    });

    // Abertura/Fechamento do modal (mantido igual)
    const exportModal = document.getElementById('export-modal');
    document.getElementById('export-btn').addEventListener('click', () => {
        exportModal.classList.remove('hidden');
        exportModal.classList.add('show');
    });
    document.getElementById('export-cancel-btn').addEventListener('click', () => {
        exportModal.classList.remove('show');
        exportModal.classList.add('hidden');
    });

    const exportConfirmBtn = document.getElementById('export-confirm-btn');
    const freshExportConfirmBtn = exportConfirmBtn.cloneNode(true);
    exportConfirmBtn.parentNode.replaceChild(freshExportConfirmBtn, exportConfirmBtn);
    freshExportConfirmBtn.addEventListener('click', async () => {
        const filename = document.getElementById('export-filename').value.trim() || 'Lista.xlsx';

        const loaderModal = document.getElementById('export-loader-container');
        const progressBar = document.getElementById('export-progress');

        loaderModal.classList.remove('hidden');
        loaderModal.classList.add('show');
        progressBar.value = 0;

        const exportModal = document.getElementById('export-modal');
        exportModal.classList.remove('show');
        exportModal.classList.add('hidden');

        const opts = {
            id: document.getElementById('opt-id').checked,
            nome: document.getElementById('opt-nome').checked,
            sinonimos: document.getElementById('opt-sinonimos').checked,
            tag: document.getElementById('opt-tag').checked,
            opiniao: document.getElementById('opt-opiniao').checked,
            episodio: document.getElementById('opt-episodio').checked,
            status: document.getElementById('opt-status').checked,
            sinopse: document.getElementById('opt-sinopse').checked,
            conteudo: document.getElementById('opt-conteudo').checked,
            image: document.getElementById('opt-image').checked
        };

        // fallback: usa itens visíveis se existirem, senão usa todas as linhas carregadas
        const filtered = (window.__itensVisiveis && window.__itensVisiveis.length > 0)
            ? window.__itensVisiveis
            : (linhas && linhas.length > 0 ? sortLines(linhas, currentOrder) : []);

        if (!filtered || filtered.length === 0) {
            alert('Nada para exportar.');
            loaderModal.classList.remove('show');
            loaderModal.classList.add('hidden');
            return;
        }

        const total = filtered.length;
        let current = 0;

        const rows = [];
        const colorMap = {};
        const usedColors = new Set();

        function getRandomColor() {
            const r = Math.floor(Math.random() * 200);  // evitar branco total (255)
            const g = Math.floor(Math.random() * 200);
            const b = Math.floor(Math.random() * 200);
            const hex = [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
            if (usedColors.has(hex)) return getRandomColor(); // evita repetição direta
            usedColors.add(hex);
            return hex;
        }

        // Gera cor única por item.id
        for (let item of filtered) {
            colorMap[item.id] = getRandomColor(); // ex: "AABBCC"
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Export');

        const headerKeys = [];
        if (opts.id) headerKeys.push('ID');
        if (opts.nome) headerKeys.push('Nome');
        if (opts.sinonimos) headerKeys.push('Sinonimos');
        if (opts.tag) headerKeys.push('Tag');
        if (opts.opiniao) headerKeys.push('Opinião');
        if (opts.episodio) headerKeys.push('Ep/Cap');
        if (opts.status) headerKeys.push('Status');
        if (opts.sinopse) headerKeys.push('Sinopse');
        if (opts.conteudo) headerKeys.push('Conteudo');
        if (opts.image) headerKeys.push('Imagem');

        worksheet.columns = headerKeys.map(key => ({ header: key, key, width: 20 }));

        for (let item of filtered) {
            let sinopseText = item.sinopse || '';
            const tags = item.tags ? item.tags.split(',').map(t => t.trim()) : [''];
            const hex = colorMap[item.id]; // "AABBCC"
            const argb = `FF${hex}`; // ExcelJS espera ARGB de 8 chars

            for (let tag of tags) {
                const rowData = {};
                if (opts.id) rowData.ID = item.id;
                if (opts.nome) rowData.Nome = item.nome;
                if (opts.sinonimos) rowData.Sinonimos = Array.isArray(item.sinonimos)
                    ? item.sinonimos.join('; ')
                    : item.sinonimos || '';
                if (opts.tag) rowData.Tag = tag;
                if (opts.opiniao) rowData.Opinião = item.opiniao;
                if (opts.episodio) rowData['Ep/Cap'] = item.episodio;
                if (opts.status) rowData.Status = item.status;
                if (opts.sinopse) rowData.Sinopse = sinopseText;
                if (opts.conteudo) rowData.Conteudo = item.conteudo;
                if (opts.image) rowData.Imagem = item.imagem_url || '';

                const excelRow = worksheet.addRow(rowData);

                // Aplica cor no fundo das células (usar argb com 8 chars)
                excelRow.eachCell((cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: argb }
                    };
                });
            }

            current++;
            progressBar.value = Math.floor((current / total) * 100);
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        progressBar.value = 100;
        loaderModal.classList.remove('show');
        loaderModal.classList.add('hidden');
    });
    document.getElementById('search-name')
        .addEventListener('input', () => filterItems(linhas, selected));

    addItemClickEvent(linhas);
    showHighlights(lista);
}

function filterItems(linhas, selected) {
    const nameFilter = document.getElementById('search-name').value.toLowerCase().trim();

    const filtered = linhas.filter(item => {
        if (nameFilter) {
            const nomeMatch = item.nome.toLowerCase().includes(nameFilter);
            let sinonimos = [];
            if (Array.isArray(item.sinonimos)) sinonimos = item.sinonimos;
            else if (typeof item.sinonimos === 'string') {
                try { sinonimos = JSON.parse(item.sinonimos); } catch { sinonimos = []; }
            }
            const sinonimoMatch = sinonimos.some(s => typeof s === 'string' && s.toLowerCase().includes(nameFilter));
            if (!nomeMatch && !sinonimoMatch) return false;
        }

        for (let type of ['status', 'conteudo', 'opiniao']) {
            const val = item[type];
            const sel = selected[type];
            if (!sel) continue;
            const { include, exclude, flexible } = sel;
            if (exclude && exclude.size > 0 && exclude.has(val)) return false;
            if (flexible && flexible.size > 0) {
                if (!flexible.has(val)) return false;
            } else if (include && include.size > 0) {
                if (!include.has(val)) return false;
            }
        }

        const itemTags = item.tags ? item.tags.split(',').map(t => t.trim()) : [];
        const selTags = selected.tags;
        if (selTags) {
            const { include, exclude, flexible } = selTags;
            if (exclude) for (let bad of exclude) if (itemTags.includes(bad)) return false;
            if (flexible && flexible.size > 0) {
                if (![...flexible].some(tag => itemTags.includes(tag))) return false;
            } else if (include && include.size > 0) {
                if (![...include].every(tag => itemTags.includes(tag))) return false;
            }
        }
        return true;
    });

    window.__itensVisiveis = filtered;
    showItems(filtered);  // ⭐ showItems ordena por currentOrder
}

function showItems(linhas) {
    const showHentai = document.getElementById('toggle-censure')?.checked ?? false;

    const filteredLinhas = (linhas || []).filter(item => {
        const hasHentaiTag = item.tags?.split(',').some(tag => tag.trim() === 'Hentai') ?? false;
        return showHentai || !hasHentaiTag;
    });

    // ⭐ Ordena SEMPRE pela ordem atual (não reseta com filtros)
    const sorted = sortLines(filteredLinhas, currentOrder);

    const listItemsContainer = document.querySelector('.items-grid');
    if (!listItemsContainer) return;

    listItemsContainer.innerHTML = sorted.map(item => `
        <div class="item-card ${getClasseExtra(item)}" data-item-id="${item.id}">
            <div class="item-card-cover">
                <img src="${item.imagem_url || 'https://via.placeholder.com/300x450/1a1e28/6a7184?text=Sem+Capa'}" alt="${item.nome}" loading="lazy">
                <div class="item-card-overlay"></div>
                <div class="status-indicator">${getStatusIcon(item.status)}</div>
                <div class="opinion-indicator">${getOpiniaoIcon(item.opiniao)}</div>
            </div>
            <div class="item-card-content">
                <h3 class="item-card-title">${item.nome}</h3>
                <div class="item-card-info">
                    <span class="info-ep"><i class="fas fa-hashtag"></i> ${item.episodio || '—'}</span>
                    <span class="info-type">${item.conteudo || ''}</span>
                </div>
            </div>
        </div>
    `).join('');

    const counter = document.getElementById('results-count-value');
    if (counter) counter.textContent = sorted.length;

    addItemClickEvent(sorted);
}

// Adicionar evento de clique às linhas usando delegação de eventos
function addItemClickEvent(linhas) {
    const listItemsContainer = document.querySelector('.items-grid');
    listItemsContainer.addEventListener('click', (event) => {
        const itemElement = event.target.closest('.item-card');
        if (itemElement) {
            const itemId = itemElement.getAttribute('data-item-id');
            const item = linhas.find(i => i.id == itemId);
            if (item) showItemDetails(item, linhas);
        }
    });
}

async function fetchImageUrl(query, contentType) {
    const apiUrl = `/search_image?q=${encodeURIComponent(query)}&type=${encodeURIComponent(contentType)}`;
    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        return data.image_url ? data.image_url : "https://via.placeholder.com/150";
    } catch (error) {
        console.error("Erro ao buscar imagem:", error);
        return "https://via.placeholder.com/150";
    }
}

function bindSinopseButton(item) {
    const btn = document.getElementById('showSynopsisBtn');
    if (!btn) return;
    const freshBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(freshBtn, btn);

    freshBtn.addEventListener('click', () => {
        const m = document.createElement('div');
        m.className = 'info-extra-modal';
        m.innerHTML = `
            <div class="info-extra-content">
                <button class="modal-close-btn" data-close><i class="fas fa-times"></i></button>
                <header class="info-extra-header">
                    <span class="info-extra-badge"><i class="fas fa-book-open"></i> Sinopse</span>
                    <h3>${item.nome}</h3>
                </header>
                <div class="info-extra-body">
                    <p>${item.sinopse || 'Sinopse não disponível'}</p>
                </div>
            </div>
        `;
        document.body.appendChild(m);
        m.addEventListener('click', (e) => {
            if (e.target === m || e.target.closest('[data-close]')) document.body.removeChild(m);
        });
    });
}

async function showItemDetails(item, navList = null) {
    modalInfo.classList.remove('show');
    modalInfo.classList.remove('hidden');
    const reqId = ++state.detailsReq;
    // Use navList se for sequência, senão usa o contexto padrão
    if (Array.isArray(navList) && navList.length > 0 && navList[0].ordem !== undefined) {
        state.currentNavList = navList;
    } else {
        state.currentNavList = navList || (window.__ultimaChamadaLinhas || []);
    }
    state.allIds = state.currentNavList.map(i => i.id);
    state.currentIdx = state.allIds.indexOf(item.id);
    state.currentItem = item;
    modalInfo.dataset.currentItemId = String(item.id);

    if (item && item.sinonimos) {
        if (Array.isArray(item.sinonimos)) {
            // ok
        } else if (typeof item.sinonimos === 'string') {
            const raw = item.sinonimos.trim();
            try {
                const parsed = JSON.parse(raw);
                item.sinonimos = Array.isArray(parsed) ? parsed : [String(parsed)];
            } catch (e) {
                // fallback: separar por vírgula/; ou | e limpar espaços
                item.sinonimos = raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
            }
        } else {
            // qualquer outro tipo -> transformar em string única
            item.sinonimos = [String(item.sinonimos)];
        }
    } else {
        item.sinonimos = [];
    }

    // Pegamos o nome do item anterior, se existir

    // Criar container de export no início de showItemDetails:
    let exportCard = document.getElementById('export-card');
    if (!exportCard) {
        exportCard = document.createElement('div');
        exportCard.id = 'export-card';
        // Remove estilos fixos que interferem no template
        Object.assign(exportCard.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '420px',
            height: '490px',
            opacity: '0',             // invisível visualmente, mas renderizável
            pointerEvents: 'none',
            zIndex: 9999,
            background: 'transparent'
        });
        document.body.appendChild(exportCard);
    }

    // Determinar tipo de conteúdo
    let contentType;
    switch (item.conteudo) {
        case "Anime":
        case "Filme":
            contentType = "anime";
            break;
        case "Manga":
        case "Manhwa":
        case "Webtoon":
        case "Novel":
            contentType = "manga";
            break;
        default:
            contentType = "anime";
    }

    const imageUrl = item.imagem_url || await fetchImageUrl(item.nome, contentType);
    if (reqId !== state.detailsReq) return;
    console.log("URL da imagem:", imageUrl);

    let sequenciaInfo = '';
    try {
        const seqsRes = await fetch(`/linhas/${item.id}/sequencias`);
        const seqsJson = await seqsRes.json();
        if (seqsJson.total_sequencias > 0) {
            const seqId = seqsJson.sequencias[0].id;
            const detailRes = await fetch(`/sequencias/${seqId}`);
            const detailJson = await detailRes.json();
            const itens = detailJson.itens || [];
            const idx = itens.findIndex(i => String(i.id) === String(item.id));
            if (idx > 0) {
                const prevName = itens[idx - 1].nome;
                sequenciaInfo = `Sequência após <b>${prevName}</b>`;
            } else if (idx === 0 && itens.length > 1) {
                const nextName = itens[1].nome;
                sequenciaInfo = `Primeira temporada, antes de <b>${nextName}</b>`;
            }
            // Se for único na sequência, sequenciaInfo fica vazio
        }
    } catch (e) {
        console.warn('Erro ao buscar sequência:', e);
    }
    if (reqId !== state.detailsReq) return;

    // --- normaliza e cria HTML seguro para os sinônimos ---
    function escapeHtml(unsafe) {
        return String(unsafe).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    let synonymsHtml = '';

    if (Array.isArray(item.sinonimos)) {
        synonymsHtml = item.sinonimos
            .map(s => `<span class="synonym-tag">${escapeHtml(String(s).trim())}</span>`)
            .join(' ');
    } else if (typeof item.sinonimos === 'string' && item.sinonimos.trim()) {
        const raw = item.sinonimos.trim();
        // tenta parse JSON: '["a","b"]'
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                synonymsHtml = parsed
                    .map(s => `<span class="synonym-tag">${escapeHtml(String(s).trim())}</span>`)
                    .join(' ');
            } else {
                // se parseou, mas não é array, usa o raw como fallback
                synonymsHtml = escapeHtml(String(parsed));
            }
        } catch (e) {
            // fallback: pode ser "a, b, c" ou "a; b"
            const parts = raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) {
                synonymsHtml = parts.map(s => `<span class="synonym-tag">${escapeHtml(s)}</span>`).join(' ');
            } else {
                // se nada funcionou, mostrar o texto cru (já escapado)
                synonymsHtml = `<span class="synonym-tag">${escapeHtml(raw.replace(/^["'\[]+|["'\]]+$/g, ''))}</span>`;
            }
        }
    }

    let lastHighlightText = '';
    if (item.last_highlight) {
        const lastHighlightDate = new Date(item.last_highlight);
        const now = new Date();
        const diffMs = now - lastHighlightDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        lastHighlightText = `Verificado à ${diffDays} dias e ${diffHours} horas`;
    }

    // ⭐ ADICIONE ESTA LINHA — declara hasSequence ANTES de usar
    const hasSequence = await checkIfItemHasSequence(item.id);
    if (reqId !== state.detailsReq) return;
    const sequenceButtons = await getSequenceButtons(item.id);
    if (reqId !== state.detailsReq) return;

    if (hasSequence) {
        modalInfo.classList.remove('no-sequence');
    } else {
        modalInfo.classList.add('no-sequence');
    }

    // ============ INFO PANEL ============
    itemInfoContent.innerHTML = `
        <button class="modal-close-btn" id="close-modal-btn" aria-label="Fechar">
            <i class="fas fa-times"></i>
        </button>

        <div class="detail-panel">
            <header class="detail-header">
                <h2 class="clickable-title" title="Clique para copiar">${escapeHtml(item.nome)}</h2>
                ${sequenciaInfo ? `<p class="detail-subtitle">${sequenciaInfo}</p>` : ''}
            </header>

            <div class="detail-grid">
                <div class="detail-field">
                    <span class="detail-field-label"><i class="fas fa-film"></i> Conteúdo</span>
                    <span class="detail-field-value">${escapeHtml(item.conteudo)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label"><i class="fas fa-circle-dot"></i> Status</span>
                    <span class="detail-field-value">${escapeHtml(item.status)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label"><i class="fas fa-star"></i> Opinião</span>
                    <span class="detail-field-value">${escapeHtml(item.opiniao)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-field-label"><i class="fas fa-hashtag"></i> ${getEpisodeLabel(item.conteudo)}</span>
                    <span class="detail-field-value">${escapeHtml(item.episodio ?? '—')}</span>
                </div>
                <div class="detail-field detail-field-full">
                    <span class="detail-field-label"><i class="fas fa-tags"></i> Tags</span>
                    <div class="detail-tags">
                        ${(item.tags || '').split(',').map(t => t.trim()).filter(Boolean)
                            .map(t => `<span class="detail-tag">${escapeHtml(t)}</span>`).join('')
                            || '<span class="detail-muted">Nenhuma</span>'}
                    </div>
                </div>
                <div class="detail-field detail-field-full">
                    <span class="detail-field-label"><i class="fas fa-clock"></i> Última verificação</span>
                    <div class="detail-highlight-row">
                        <span class="detail-field-value" id="last-highlight-text">${lastHighlightText || 'Nunca'}</span>
                        <button id="update-highlight-btn" class="detail-mini-btn" data-id="${item.id}">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                    </div>
                </div>
            </div>

            <div class="item-actions">
                <button id="editLineButton" class="action-btn action-btn-edit" title="Editar">
                    <i class="fas fa-edit"></i><span>Editar</span>
                </button>
                <div class="sequence-controls">
                    <button id="mainSequenceBtn" class="action-btn action-btn-seq" title="Sequência">
                        <i class="fas fa-project-diagram"></i><span>Sequência</span>
                    </button>
                    <div class="sequence-actions" style="display: none;">
                        ${sequenceButtons}
                    </div>
                </div>
                <button id="previewTemplateBtn" class="action-btn action-btn-preview" title="Preview">
                    <i class="fas fa-image"></i><span>Preview</span>
                </button>
                <button id="deleteLineButton" class="action-btn action-btn-delete" title="Excluir">
                    <i class="fas fa-trash-alt"></i><span>Excluir</span>
                </button>
            </div>
        </div>
    `;

    const previewBtn = document.getElementById('previewTemplateBtn');

    // Listener para o botão Atualizar (atualiza last_highlight e a UI)
    (function attachUpdateHighlightListener() {
        const updateBtn = document.getElementById('update-highlight-btn');
        if (!updateBtn) return;
        updateBtn.addEventListener('click', async (e) => {
            try {
                const linhaId = e.currentTarget.dataset.id;
                const res = await fetch(`/highlighted/${linhaId}`, { method: 'POST' });
                if (!res.ok) throw new Error('Falha ao atualizar highlight');

                const nowIso = new Date().toISOString();
                item.last_highlight = nowIso;

                const lastHighlightDate = new Date(nowIso);
                const now = new Date();
                const diffMs = now - lastHighlightDate;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const newText = `Verificado à ${diffDays} dias e ${diffHours} horas`;

                const span = document.getElementById('last-highlight-text');
                if (span) span.textContent = newText;
            } catch (err) {
                console.error('Erro ao atualizar last_highlight:', err);
            }
        });
    })();
    previewBtn.replaceWith(previewBtn.cloneNode(true));
    document.getElementById('previewTemplateBtn').addEventListener('click', () => {
        showTemplatePreview(item);
    });

    modalPhoto.innerHTML = `
        <div class="photo-panel">
            <div class="photo-frame">
                <img id="modalImage" src="${imageUrl}" alt="${escapeHtml(item.nome)}">
            </div>
            <div class="photo-actions">
                <button id="showSynopsisBtn" class="photo-btn photo-btn-synopsis">
                    <i class="fas fa-book-open"></i><span>Sinopse</span>
                </button>
                <button id="showSynonymsBtn" class="photo-btn photo-btn-synonyms">
                    <i class="fas fa-tags"></i><span>Sinônimos</span>
                </button>
            </div>
        </div>
    `;

    sequenceModal.innerHTML = `
        <div class="sequence-display" id="sequenceDisplay">
            <div class="sequence-list" id="sequenceList"></div>
        </div>
    `;

    // ⭐ Wiring do botão de fechar
    document.getElementById('close-modal-btn')?.addEventListener('click', () => {
        modalInfo.classList.remove('show');
        modalInfo.classList.add('hidden');
    });

    await refreshSequenceDisplay(item.id);
    if (reqId !== state.detailsReq) return;

    function bindSynonymsButton(item) {
        const btn = document.getElementById('showSynonymsBtn');
        if (!btn) return;
        const freshBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(freshBtn, btn);

        freshBtn.addEventListener('click', () => {
            const list = Array.isArray(item.sinonimos) ? item.sinonimos : [];
            const content = list.length
                ? list.map(s => `<div class="synonym-item">${s}</div>`).join('')
                : '<p class="detail-muted">Nenhum sinônimo disponível</p>';

            const m = document.createElement('div');
            m.className = 'info-extra-modal';
            m.innerHTML = `
                <div class="info-extra-content">
                    <button class="modal-close-btn" data-close><i class="fas fa-times"></i></button>
                    <header class="info-extra-header">
                        <span class="info-extra-badge info-extra-badge-accent"><i class="fas fa-tags"></i> Sinônimos</span>
                        <h3>${item.nome}</h3>
                    </header>
                    <div class="info-extra-body synonyms-list">
                        ${content}
                    </div>
                </div>
            `;
            document.body.appendChild(m);
            m.querySelectorAll('.synonym-item').forEach(el => {
                el.addEventListener('click', () => {
                    navigator.clipboard.writeText(el.textContent).then(() => {
                        el.classList.add('copied');
                        setTimeout(() => el.classList.remove('copied'), 500);
                    });
                });
            });
            m.addEventListener('click', (e) => {
                if (e.target === m || e.target.closest('[data-close]')) document.body.removeChild(m);
            });
        });
    }
    setTimeout(() => {
        const nameText = exportCard.querySelector('#name-text');
        if (nameText) {
            // Usar a mesma função autoFitText do exportFunctions.js
            let fontSize = 16;
            nameText.style.fontSize = fontSize + 'px';

            while ((nameText.scrollHeight > nameText.parentElement.clientHeight ||
                nameText.scrollWidth > nameText.parentElement.clientWidth) &&
                fontSize > 10) {
                fontSize--;
                nameText.style.fontSize = fontSize + 'px';
            }
        }
    }, 100);

    async function checkIfItemHasSequence(itemId) {
        try {
            const response = await fetch(`/linhas/${itemId}/sequencias`);
            const data = await response.json();
            return Array.isArray(data.sequencias) && data.sequencias.length > 0;
        } catch (error) {
            console.error('Erro ao verificar sequências:', error);
            return false;
        }
    }

    modalPhoto.style.height = `${itemInfoContent.offsetHeight}px`;
    sequenceModal.style.height = `${itemInfoContent.offsetHeight}px`;
    bindSinopseButton(item);
    bindSynonymsButton(item);

    // Setup do botão de sequência e painel de ações
    function setupSequenceActionButtons() {
        const mainBtn = document.getElementById('mainSequenceBtn');
        const actionsPanel = document.querySelector('.sequence-actions');
        if (!mainBtn || !actionsPanel) return;

        // Remove listeners antigos clonando o nó
        const freshBtn = mainBtn.cloneNode(true);
        mainBtn.parentNode.replaceChild(freshBtn, mainBtn);

        freshBtn.addEventListener('click', async function () {
            const isActive = actionsPanel.style.display === 'block';
            actionsPanel.style.display = isActive ? 'none' : 'block';
            if (isActive) {
                freshBtn.classList.remove('active');
            } else {
                freshBtn.classList.add('active');
                // Atualiza os botões sempre que abre (caso tenha mudado)
                actionsPanel.innerHTML = await getSequenceButtons(item.id);

                // Adiciona listeners para os botões de ação
                actionsPanel.querySelectorAll('.sequence-action').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (btn.id === 'createSequence') {
                            const response = await fetch('/sequencias', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    nome: `${item.nome} Sequence`,
                                    descricao: `Sequência criada automaticamente para ${item.nome}`
                                })
                            });
                            const sequence = await response.json();
                            await fetch(`/sequencias/${sequence.id}/itens`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ linha_id: item.id, ordem: 1 })
                            });
                            await refreshSequenceDisplay(item.id);
                            actionsPanel.style.display = 'none';
                            freshBtn.classList.remove('active');
                        }
                        if (btn.id === 'addToSequence') {
                            showAddToSequenceModal(item);
                            actionsPanel.style.display = 'none';
                            freshBtn.classList.remove('active');
                        }
                        if (btn.id === 'deleteSequence') {
                            if (confirm('Tem certeza que deseja apagar esta sequência?')) {
                                const sequences = await (await fetch(`/linhas/${item.id}/sequencias`)).json();
                                await fetch(`/sequencias/${sequences.sequencias[0].id}`, { method: 'DELETE' });
                                await refreshSequenceDisplay(item.id);
                                actionsPanel.style.display = 'none';
                                freshBtn.classList.remove('active');
                            }
                        }
                    });
                });
            }
        });
    }
    setupSequenceActionButtons();

    const oldImg = document.getElementById('modalImage');
    const newImg = oldImg.cloneNode(true);
    oldImg.parentNode.replaceChild(newImg, oldImg);

    newImg.addEventListener('click', async () => {
        const currentUrl = document.getElementById('modalImage').src;
        const nomes = item.nome;
        const tipo = contentType;
        const maxAttempts = 5;
        const urls = [];
        const loader = document.getElementById('imageLoader');

        loader.style.display = 'flex';

        try {
            for (let i = 0; i < maxAttempts; i++) {
                const url = await fetchImageUrl(nomes, tipo);
                if (!url.includes("via.placeholder.com") && url !== currentUrl && !urls.includes(url)) {
                    urls.push(url);
                }
            }
        } finally {
            loader.style.display = 'none';
        }

        // Sempre cria/abre o modal, mesmo que urls.length === 0
        let selector = document.querySelector('.image-selector-modal');
        if (!selector) {
            selector = document.createElement('div');
            selector.className = 'image-selector-modal';
            selector.innerHTML = `
                <div class="image-selector-content">
                    <span class="image-selector-close">&times;</span>
                    <h3>Escolha uma nova capa:</h3>
                    <div class="image-list"></div>
                    <div id="customImageInputContainer" style="margin-top: 10px; text-align: center;">
                        <input type="text" id="customImageUrl" placeholder="Cole o link da imagem aqui..." style="padding: 6px; width: 80%; border-radius: 6px; border: 1px solid #ccc;">
                        <button id="submitCustomImage" style="padding: 6px 12px; border-radius: 8px; background: orange; color: white; border: none; cursor: pointer; margin-top: 10px;">
                            <i class="fas fa-link"></i> Atualizar por Link
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(selector);
        }
        const listDiv = selector.querySelector('.image-list');
        listDiv.innerHTML = '';
        if (urls.length > 0) {
            urls.forEach(url => {
                const img = document.createElement('img');
                img.src = url;
                img.style.cursor = 'pointer';
                img.addEventListener('click', async () => {
                    document.getElementById('modalImage').src = url;
                    await fetch(`/linhas/${item.id}/imagem`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ imagem_url: url })
                    });
                    document.body.removeChild(selector);
                    alert("Imagem atualizada!");
                });
                listDiv.appendChild(img);
            });
        } else {
            // Se não achou nenhuma, mostra só o campo de link
            listDiv.innerHTML = `<div style="color:#888; margin:20px 0;">Nenhuma alternativa encontrada.<br>Insira um link manual abaixo.</div>`;
        }

        // Atualizar por link customizado dentro do seletor
        selector.querySelector('#submitCustomImage').addEventListener('click', async () => {
            const newUrl = selector.querySelector('#customImageUrl').value.trim();
            if (newUrl) {
                const resp = await fetch('/update_image_url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: item.id, new_url: newUrl })
                });
                if (resp.ok) {
                    item.imagem_url = newUrl; // Atualiza o objeto em memória
                    document.getElementById('modalImage').src = newUrl;
                    document.body.removeChild(selector);
                    alert("Imagem atualizada!");
                } else {
                    alert("Erro ao atualizar imagem!");
                }
            }
        });

        // Fechar o modal se clicar no "×" ou fora do conteúdo
        selector.querySelector('.image-selector-close').addEventListener('click', () => {
            document.body.removeChild(selector);
        });
        selector.addEventListener('click', e => {
            if (e.target === selector) {
                document.body.removeChild(selector);
            }
        });
    });

    // Mostrar campo ao clicar no botão de link
    const delBtn = document.getElementById('deleteLineButton');
    // remove qualquer listener anterior clonando o nó:
    const fresh = delBtn.cloneNode(true);
    delBtn.replaceWith(fresh);
    // registra só **uma** vez
    fresh.addEventListener('click', () => deleteLine(item.id), { once: true });

    document.getElementById('editLineButton').addEventListener('click', () => openEditModal(item));

    function fecharModalInfo() {
        modalInfo.classList.remove('show');
        modalInfo.classList.add('hidden');

        setTimeout(() => {
            modalInfo.classList.remove('show');
            modalInfo.classList.add('hidden');
        }, 300);
    }

    // Clicar fora do conteúdo do modal
    modalInfo.addEventListener('click', (e) => {
        const isOutside =
            !e.target.closest('.modal-content') &&
            !e.target.closest('#modal-photo') &&
            !e.target.closest('#modal-sequence') &&
            !e.target.closest('.sequence-search-modal');
        if (isOutside) {
            fecharModalInfo();
        }
    });

    document.querySelectorAll('.clickable-title').forEach(title => {
        title.addEventListener('click', () => {
            // Copiar o conteúdo do nome (innerText) para a área de transferência
            const textToCopy = title.innerText;

            // Usando o método moderno do Clipboard API
            navigator.clipboard.writeText(textToCopy).then(() => {
            });
        });
    });
    void modalInfo.offsetWidth;
    const exportCardBtn = modalInfo.querySelector('#exportCardBtn');
    if (exportCardBtn) {
        const newExportBtn = exportCardBtn.cloneNode(true);
        exportCardBtn.parentNode.replaceChild(newExportBtn, exportCardBtn);

        newExportBtn.addEventListener('click', () => {
            const id = modalInfo.dataset.currentItemId;
            if (!id) return;

            // tenta usar o state primeiro, mas garante pelo id
            if (state.currentItem && String(state.currentItem.id) === String(id)) {
                exportItemAsImage(state.currentItem);
                return;
            }

            // fallback se você tiver um index global (recomendado)
            const byId = window.__itemsById;
            const resolved = byId?.get ? byId.get(Number(id)) : null;
            if (resolved) exportItemAsImage(resolved);
        });
    }
    modalInfo.classList.add('show');
}

function bindExportButton(item, buttonElement) {
    if (!buttonElement) return;

    const newButton = buttonElement.cloneNode(true);
    buttonElement.parentNode.replaceChild(newButton, buttonElement);

    newButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log('Exportando item:', item.nome);

        // Adicionar feedback visual
        const originalText = newButton.innerHTML;
        newButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exportando...';
        newButton.disabled = true;

        try {
            await exportItemAsImage(item);
        } catch (error) {
            console.error('Erro ao exportar:', error);
            alert('Erro ao exportar imagem. Tente novamente.');
        } finally {
            // Restaurar botão
            newButton.innerHTML = originalText;
            newButton.disabled = false;
        }
    });
}

function bindPreviewButton(item, buttonElement) {
    if (!buttonElement) return;

    const newButton = buttonElement.cloneNode(true);
    buttonElement.parentNode.replaceChild(newButton, buttonElement);

    newButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log('Abrindo preview para:', item.nome);
        showTemplatePreview(item);
    });
}

function createActionButtons(item, lineElement) {
    const actionsDiv = lineElement.querySelector('.item-actions') || document.createElement('div');
    actionsDiv.className = 'item-actions';

    // Limpar botões existentes
    actionsDiv.innerHTML = '';

    // Botão Preview
    const previewBtn = document.createElement('button');
    previewBtn.className = 'btn-preview';
    previewBtn.innerHTML = '<i class="fas fa-eye"></i> Preview';
    previewBtn.title = 'Visualizar card';

    // Botão Exportar
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-export';
    exportBtn.innerHTML = '<i class="fas fa-download"></i> Exportar';
    exportBtn.title = 'Exportar como imagem';

    actionsDiv.appendChild(previewBtn);
    actionsDiv.appendChild(exportBtn);

    // Adicionar ao elemento da linha se não existir
    if (!lineElement.querySelector('.item-actions')) {
        lineElement.appendChild(actionsDiv);
    }

    // Vincular eventos
    bindPreviewButton(item, previewBtn);
    bindExportButton(item, exportBtn);
}

function openItemByIndex(idx) {
    if (idx < 0 || idx >= state.allIds.length) return;
    const nextItemId = state.allIds[idx];
    const nextItem = state.currentNavList.find(i => i.id === nextItemId);
    if (nextItem) showItemDetails(nextItem, state.currentNavList);
}

function handleModalArrowNav(e) {
    if (!modalInfo.classList.contains('show')) return;
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "ArrowRight") openItemByIndex(state.currentIdx + 1);
        if (e.key === "ArrowLeft") openItemByIndex(state.currentIdx - 1);
        if (e.key === "ArrowDown") openItemByIndex(state.currentIdx + 5);
        if (e.key === "ArrowUp") openItemByIndex(state.currentIdx - 5);
    }
}
document.addEventListener('keydown', handleModalArrowNav);


// Abrir modal de edição
function openEditModal(item) {
    modalInfo.classList.add('hidden');
    state.formMode = 'edit';
    state.currentEditingId = item.id;

    document.getElementById('line-name').value = item.nome;
    document.getElementById('line-content').value = item.conteudo;
    document.getElementById('line-status').value = item.status;
    document.getElementById('line-episode').value = item.episodio;
    document.getElementById('line-opinion').value = item.opiniao;

    state.selectedTags = item.tags ? item.tags.split(",") : [];
    updateSelectedTags();

    document.querySelector('button[type="submit"]').textContent = 'Salvar Alterações';
    lineModal.classList.remove('hidden');
    lineModal.classList.add('show');
    setTimeout(() => { initResizeObserver(); showAllTags(); setupTagsSearch(); }, 100);
}

// Atualizar uma linha
async function updateLine(itemId) {
    const updatedItem = {
        nome: document.getElementById('line-name').value,
        conteudo: document.getElementById('line-content').value,
        status: document.getElementById('line-status').value,
        episodio: document.getElementById('line-episode').value,
        opiniao: document.getElementById('line-opinion').value,
        tags: state.selectedTags.join(", ")
    };

    try {
        const response = await fetch(`/linhas/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedItem),
        });

        const result = await response.json();
        console.log(result);
        alert(result.message || 'Erro ao editar a linha.');

        // ⭐ RESTAURAR: buscar linhas atualizadas
        const updatedLinesResponse = await fetch(`/linhas/${state.currentList.id}`);
        const updatedLines = await updatedLinesResponse.json();

        showItems(updatedLines);

        // Resetar formulário e modo
        state.formMode = 'add';
        state.currentEditingId = null;
        lineForm.reset();
        state.selectedTags = [];
        updateSelectedTags();
        lineModal.classList.add('hidden');
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao atualizar a linha.');
    }
}

// Criar uma nova linha
async function createNewLine() {
    const newLine = {
        lista_id: state.currentList.id,
        nome: document.getElementById('line-name').value,
        tags: state.selectedTags.join(', '),
        conteudo: document.getElementById('line-content').value,
        status: document.getElementById('line-status').value,
        episodio: document.getElementById('line-episode').value,
        opiniao: document.getElementById('line-opinion').value
    };

    try {
        const response = await fetch('/linhas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newLine),
        });

        if (!response.ok) throw new Error('Erro ao salvar linha');

        const newItem = await response.json();
        await corrigirItem({
            id: newItem.id,
            nome: newItem.nome,
            conteudo: newLine.conteudo
        });

        state.formMode = 'add';
        lineForm.reset();
        state.selectedTags = [];
        updateSelectedTags();
        lineModal.classList.add('hidden');
        showListDetails(state.currentList);
    } catch (error) {
        console.error('Erro:', error);
    }
}

// Excluir linha
async function deleteLine(lineId) {
    if (!confirm("Tem certeza que deseja excluir esta linha?")) return;
    try {
        const response = await fetch(`/linhas/${lineId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Erro ao excluir linha');
        modalInfo.classList.add('hidden');
        showListDetails(state.currentList);
    } catch (error) {
        console.error('Erro:', error);
    }
}
// Função para lidar com o envio do formulário de linha
function handleFormSubmit(event) {
    event.preventDefault();
    if (state.formMode === 'edit') {
        updateLine(state.currentEditingId);
    } else {
        createNewLine();
    }
}

// Configura o evento de submissão do formulário de linha
lineForm.removeEventListener('submit', handleFormSubmit);
lineForm.addEventListener('submit', handleFormSubmit);

document.addEventListener('showItemDetails', (e) => {
    showItemDetails(e.detail.item, e.detail.navList);
});

export {
    showListDetails,
    handleFormSubmit,
    showItemDetails,
    showItems,
    bindSinopseButton,
    bindExportButton,
    bindPreviewButton,
    createActionButtons
};