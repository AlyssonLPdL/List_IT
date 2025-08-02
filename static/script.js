(function () {
    // ---------------------------- CONSTANTES E ELEMENTOS ----------------------------
    // Modais
    const modal = document.getElementById('modal');
    const createListBtn = document.getElementById('create-list-btn');
    const closeModal = document.getElementById('close-modal');
    const listForm = document.getElementById('list-form');
    const lineModal = document.getElementById('line-modal');
    const closeLineModal = document.getElementById('close-line-modal');
    const modalInfo = document.getElementById('info-modal');
    const modalPhoto = document.getElementById('modal-photo');
    const mainInfoContent = modalInfo.querySelector('.modal-content');
    const mainInfoContentId = document.getElementById('mainInfoContent');
    const tagsContainerId = document.getElementById('tags-container');
    const sequenceModal = document.getElementById('modal-sequence');

    // Listas
    const sidebarLists = document.querySelector('.sidebar-lists');
    const mainContent = document.querySelector('.main-content');

    // Linhas
    const lineForm = document.getElementById('line-form');

    // Tags
    const selectedTagsContainer = document.getElementById('selected-tags');

    // Variáveis globais
    let currentList = null;
    let formMode = 'add'; // 'add' para adicionar, 'edit' para editar
    let currentEditingId = null;
    let selectedTags = [];
    let allIds = [];
    let currentIdx = 0;
    let currentNavList = []; // <- lista de itens do contexto atual

    // ---------------------------- UTILS ----------------------------
    // Função para extrair nome base e número romano (se houver)
    function extractBaseAndNumber(nome) {
        const romanRegex = /\b(?:I{1,3}|IV|V?I{0,3}|IX|X{0,3})\b/;
        const match = nome.match(romanRegex);
        let numeroRomano = match ? match[0] : null;
        let nomeBase = nome.replace(romanRegex, '').trim();
        return { nomeBase, numeroRomano };
    }

    // Converte número romano para número decimal
    function romanToDecimal(roman) {
        if (!roman) return -1; // Sem número romano vem primeiro
        const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
        return romanMap[roman] || 99;
    }

    // Função para configurar o ResizeObserver para ajustar altura dos containers
    function initResizeObserver() {
        const resizeObserver = new ResizeObserver(() => {
            tagsContainerId.style.height = `${mainInfoContentId.offsetHeight - 40}px`;
        });
        resizeObserver.observe(mainInfoContentId);
    }

    const themeToggle = document.getElementById('theme-toggle');

    // Verificar preferência salva ao carregar a página
    if (localStorage.getItem('darkTheme') === 'true') {
        document.body.classList.add('dark-theme');
        themeToggle.checked = true;
    }

    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-theme');

        // Salvar preferência no localStorage
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('darkTheme', isDark);
    });

    function applyFilter(linhas) {
        const showPutariaManhwa = document.getElementById('toggle-censure').checked;

        // Filtra as linhas com base no estado do switch
        const filteredLinhas = linhas.filter(item => {
            const isPutaria = getClasseExtra(item) === "Putaria";
            const isManhwa = item.conteudo === "Manhwa";

            // Oculta apenas itens que são "Putaria" e "Manhwa" ao mesmo tempo
            return showPutariaManhwa || !(isPutaria && isManhwa);
        });

        // Atualiza os itens exibidos
        showItems(filteredLinhas);
    }

    function getEpisodeLabel(contentType) {
        const ct = contentType.toLowerCase();
        if (ct === 'filme') {
            return 'Filmes';
        }
        if (['manga', 'manhwa', 'webtoon'].includes(ct)) {
            return 'Capítulos';
        }
        // padrão para anime, série, etc.
        return 'Episódio';
    }

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

        document.getElementById('close-line-modal').addEventListener('click', () => {
            selectedTags = [];
            updateSelectedTags();
            fecharModalLine();
        });

        lineModal.addEventListener('click', (e) => {
            if (e.target === lineModal) {
                selectedTags = [];
                updateSelectedTags();
                fecharModalLine(); // aqui agora chama a função corretamente
            }
        });
    }

    // ---------------------------- GERENCIAMENTO DE LISTAS ----------------------------
    async function loadLists() {
        try {
            const response = await fetch('/listas');
            if (!response.ok) throw new Error('Erro ao carregar as listas');

            const listas = await response.json();
            sidebarLists.innerHTML = '';

            listas.forEach(lista => {
                const listItem = document.createElement('div');
                listItem.className = 'list-item';
                listItem.textContent = lista.nome;
                listItem.addEventListener('click', () => showListDetails(lista));
                sidebarLists.appendChild(listItem);
            });
        } catch (error) {
            console.error('Erro:', error);
            sidebarLists.innerHTML = '<p>Erro ao carregar as listas.</p>';
        }
    }

    // Criar uma nova lista
    listForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const listName = document.getElementById('list-name').value;

        try {
            const response = await fetch('/listas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome: listName })
            });

            if (!response.ok) throw new Error('Erro ao criar lista');

            modal.classList.add('hidden');
            listForm.reset();
            loadLists();
        } catch (error) {
            console.error('Erro:', error);
        }
    });

    // ---------------------------- GERENCIAMENTO DE LINHAS ----------------------------
    // Função para lidar com o envio do formulário de linha
    document.addEventListener("DOMContentLoaded", () => {
        const refreshButtons = document.querySelectorAll(".refreshImages");

        refreshButtons.forEach(button => {
            button.addEventListener("click", async () => {
                try {
                    const resposta = await fetch('/refresh_images', { method: 'POST' });
                    const resultado = await resposta.json();
                    alert(resultado.mensagem);
                    location.reload(); // Atualiza a página para refletir as imagens corrigidas
                } catch (erro) {
                    alert("Erro ao atualizar imagens.");
                    console.error(erro);
                }
            });
        });
    });

    function handleFormSubmit(event) {
        event.preventDefault();
        if (formMode === 'edit') {
            updateLine(currentEditingId);
        } else {
            createNewLine();
        }
    }
    // Configura o evento de submissão do formulário de linha
    lineForm.removeEventListener('submit', handleFormSubmit);
    lineForm.addEventListener('submit', handleFormSubmit);

    // Função para obter classe extra baseada em condições
    function getClasseExtra(item) {
        if (item.tags.includes("Goat") &&
            (item.tags.includes("Beijo") &&
                item.tags.includes("Romance do bom") &&
                (item.tags.includes("Namoro") || item.tags.includes("Casamento") || item.tags.includes("Noivado"))
            )
        ) {
            return "BestLove";
        }

        if (item.tags.includes("Goat")) {
            return "Goat";
        }

        if (item.status === "Cancelado") {
            return "Cancelado";
        }

        if (
            item.tags.includes("Beijo") &&
            item.tags.includes("Romance do bom") &&
            (item.tags.includes("Namoro") || item.tags.includes("Casamento") || item.tags.includes("Noivado"))
        ) {
            return "Love";
        }

        if (
            item.tags.includes("Ecchi") &&
            (item.tags.includes("Nudez") || item.tags.includes("Nudez Nippleless")) &&
            (
                item.tags.includes("Incesto") ||
                item.tags.includes("Sexo") ||
                item.tags.includes("Yuri") ||
                item.tags.includes("Vida Escolar") ||
                item.tags.includes("Dormitorios") ||
                (item.opiniao === "Mediano" ||
                    item.opiniao === "Ruim" ||
                    item.opiniao === "Horrivel")
            )
        ) {
            // Retorna a classe "Putaria"
            const classe = "Putaria";

            // Verifica se é um Manwha
            if (item.conteudo === "Manhwa") {
                // Aguarda o DOM renderizar o elemento antes de aplicar o blur
                setTimeout(() => {
                    const imageElement = document.querySelector(`.item-info[data-item-id="${item.id}"] .item-image img`);
                    if (imageElement) {
                        imageElement.style.filter = "blur(5px)";
                    }
                }, 0); // Executa após o próximo ciclo de renderização
            }

            return classe;
        }

        if (
            item.tags.includes("Ação") &&
            (
                (
                    (item.opiniao === "Recomendo" || item.opiniao === "Muito Bom" || item.opiniao === "Bom" || item.opiniao === "Favorito") &&
                    item.tags.includes("Shounen") &&
                    !item.tags.includes("Dormitorio") &&
                    !(item.tags.includes("Fez Filho(s)") && item.tags.includes("Gravidez"))
                )
            )
        ) {
            return "Pika";
        }

        return "";
    }

    function getStatusIcon(status) {
        switch (status.toLowerCase()) {
            case 'concluido':
                return '<i class="icon-concluido fas fa-check" title="Concluído"></i>';
            case 'assistir':
                return '<i class="icon-assistir fas fa-bookmark" title="Ver"></i>';
            case 'ler':
                return '<i class="icon-ler fas fa-bookmark" title="Ler"></i>';
            case 'vendo':
                return '<i class="icon-vendo fas fa-eye" title="Vendo"></i>';
            case 'lendo':
                return '<i class="icon-lendo fas fa-eye" title="Lendo"></i>';
            case 'dropado':
                return '<i class="icon-dropado fas fa-eye-slash" title="Dropado"></i>';
            case 'cancelado':
                return '<i class="icon-cancelado fas fa-ghost" title="Cancelado"></i>';
            case 'conheço':
                return '<i class="icon-conheco fas fa-question" title="Conheço"></i>';
            default:
                return ''; // vazio se não corresponder a nenhum
        }

    }
    function getOpiniaoIcon(opiniao) {
        const opiniaoFormatada = opiniao.toLowerCase();
        switch (opiniaoFormatada) {
            case 'favorito':
                return '<i class="opiniao-favorito fas fa-star" title="Favorito" style="color:#ffe200;"></i>';
            case 'muito bom':
                return '<i class="opiniao-muito-bom fas fa-face-laugh-beam" title="Muito Bom" style="color:#f1c40f;"></i>';
            case 'recomendo':
                return '<i class="opiniao-recomendo fas fa-thumbs-up" title="Recomendo" style="color:#2ecc71;"></i>';
            case 'bom':
                return '<i class="opiniao-bom fas fa-smile" title="Bom" style="color:#27ae60;"></i>';
            case 'mediano':
                return '<i class="opiniao-mediano fas fa-meh" title="Mediano" style="color:#f39c12;"></i>';
            case 'ruim':
                return '<i class="opiniao-ruim fas fa-frown" title="Ruim" style="color:#e67e22;"></i>';
            case 'horrivel':
                return '<i class="opiniao-horrivel fas fa-skull-crossbones" title="Horrível" style="color:#c0392b;"></i>';
            case 'não vi':
                return '<i class="opiniao-nao-vi fas fa-question-circle" title="Não vi" style="color:#95a5a6;"></i>';
            default:
                return '';
        }
    }

    // Exibir detalhes da lista e suas linhas
    async function showListDetails(lista) {
        currentList = lista;

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
            <div class="list-header">
            <h1 class="list-title">${lista.nome}</h1>
            <div class="controls-container">
                <div class="censure-toggle">
                <label class="switch">
                    <input type="checkbox" id="toggle-censure">
                    <span class="slider"></span>
                </label>
                </div>
            </div>
            </div>

            <div class="search-section">
            <div class="search-filter-container">
                <div class="search-filter">
                <input type="text" id="search-name" placeholder="Buscar por nome...">
                <button type="button" id="filter-toggle">Filtros</button>
                </div>
                <div class="action-buttons">
                <button class="btn" id="add-line-btn">
                    <i>+</i> Adicionar Linha
                </button>
                <button class="btn" id="export-btn">
                    <i>↓</i> Exportar
                </button>
                </div>
            </div>
            
            <!-- Painel de filtros -->
            <div id="filter-panel" class="hidden">
                <h4>----------------------------------- Status -------------------------------------</h4>
                <div class="filter-section" data-type="status"></div>
                <h4>--------------------------------- Conteúdo ----------------------------------</h4>
                <div class="filter-section" data-type="conteudo"></div>
                <h4>----------------------------------- Opinião ------------------------------------</h4>
                <div class="filter-section" data-type="opiniao"></div>
                <h4>------------------------------------- Tags -------------------------------------</h4>
                <div class="filter-section" data-type="tags"></div>
            </div>
            </div>

            <div class="order-buttons">
                <button id="order-az"><i class="fa-solid fa-arrow-down-a-z"></i></i></button>
                <button id="order-za"><i class="fa-solid fa-arrow-up-a-z"></i></button>
                <button id="order-ep"><i class="fa-solid fa-arrow-down-1-9"></i></button>
                <button id="order-ep-desc"><i class="fa-solid fa-arrow-up-1-9"></i></button>
                <button id="order-opinion"><i class="fas fa-star"></i></button>
            </div>

            <div class="items-container">
            <div class="items-grid">
                ${linhas.length > 0 ? linhas.map(item => `
                <div class="item-card ${getClasseExtra(item)}" data-item-id="${item.id}">
                    <div class="status-indicator">${getStatusIcon(item.status)}</div>
                    <div class="opinion-indicator">${getOpiniaoIcon(item.opiniao)}</div>
                    
                    <div class="item-card-image">
                        <img src="${item.imagem_url || 'https://via.placeholder.com/150'}" alt="${item.nome}">
                    </div>
                    
                    <div class="item-card-content">
                        <h3 class="item-card-title">${item.nome}</h3>
                        <div class="item-card-info">
                        <span>${item.episodio || 'N/A'}</span>
                        <span>${item.conteudo || ''}</span>
                        </div>
                    </div>
                </div>
                `).join('') : `
                <div class="empty-state">
                    <i>📭</i>
                    <h3>Nenhum item encontrado</h3>
                    <p>Adicione novos itens ou ajuste seus filtros</p>
                </div>
                `}
            </div>
            
            <div class="highlights-section">
                <h3>${lista.nome} para Verificar</h3>
                <div class="highlights-list">
                <!-- Destaques serão adicionados via JS -->
                </div>
            </div>
            </div>
        `;

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

                        if (classe === 'BestLove' && item.tags.includes('Goat')) return 0;
                        if (classe === 'BestLove') return 1;
                        if (classe === 'Goat') return 2;
                        if (classe === 'Love' && opiniao === "Favorito") return 3;

                        const opiniaoOrder = [
                            "Favorito", "Muito Bom", "Recomendo", "Bom", "Mediano", "Ruim", "Horrivel", "Não vi"
                        ];
                        const idx = opiniaoOrder.indexOf(opiniao);
                        return idx === -1 ? 99 : (4 + idx);
                    }
                    return getPriority(a) - getPriority(b);
                });
            }
            return linhas;
        }

        // Adicione os listeners:
        // ...dentro de showListDetails, após definir os listeners:
        function setActiveOrderButton(id) {
            document.querySelectorAll('.order-buttons button').forEach(btn => btn.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        }

        document.getElementById('order-az').addEventListener('click', () => {
            currentOrder = 'az';
            setActiveOrderButton('order-az');
            showItems(sortLines(linhas, currentOrder));
        });
        document.getElementById('order-za').addEventListener('click', () => {
            currentOrder = 'za';
            setActiveOrderButton('order-za');
            showItems(sortLines(linhas, currentOrder));
        });
        document.getElementById('order-ep').addEventListener('click', () => {
            currentOrder = 'ep';
            setActiveOrderButton('order-ep');
            showItems(sortLines(linhas, currentOrder));
        });
        document.getElementById('order-ep-desc').addEventListener('click', () => {
            currentOrder = 'ep-desc';
            setActiveOrderButton('order-ep-desc');
            showItems(sortLines(linhas, currentOrder));
        });
        document.getElementById('order-opinion').addEventListener('click', () => {
            currentOrder = 'opinion';
            setActiveOrderButton('order-opinion');
            showItems(sortLines(linhas, currentOrder));
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
            status: { include: new Set(), exclude: new Set() },
            conteudo: { include: new Set(), exclude: new Set() },
            opiniao: { include: new Set(), exclude: new Set() },
            tags: { include: new Set(), exclude: new Set() }
        };

        panel.addEventListener('click', e => {
            if (!e.target.classList.contains('filter-option')) return;
            const type = e.target.closest('.filter-section').dataset.type;
            const value = e.target.dataset.value;
            const sel = selected[type];

            if (!sel.include.has(value) && !sel.exclude.has(value)) {
                // 1º clique: marca como INCLUDE
                sel.include.add(value);
                e.target.classList.add('included');
            }
            else if (sel.include.has(value)) {
                // 2º clique: remove INCLUDE, marca EXCLUDE
                sel.include.delete(value);
                e.target.classList.remove('included');
                sel.exclude.add(value);
                e.target.classList.add('excluded');
            }
            else {
                // 3º clique: remove EXCLUDE
                sel.exclude.delete(value);
                e.target.classList.remove('excluded');
            }

            filterItems(linhas, selected);
        });

        // Adiciona evento ao switch para ativar/desativar conteúdos "Putaria" e "Manhwa"
        document.getElementById('toggle-censure').addEventListener('change', (event) => {
            const showPutariaManhwa = event.target.checked;

            const filteredLinhas = linhas.filter(item => {
                const isPutaria = getClasseExtra(item) === "Putaria";
                const isManhwa = item.conteudo === "Manhwa";

                // Oculta apenas itens que são "Putaria" e "Manhwa" ao mesmo tempo
                return showPutariaManhwa || !(isPutaria && isManhwa);
            });

            showItems(filteredLinhas);
        });

        // Após renderizar os itens...
        document.querySelectorAll('.item-info').forEach(async (element) => {
            const itemId = element.getAttribute('data-item-id');
            const item = linhas.find(i => i.id == itemId);

            // Só faz a busca se imagem estiver vazia ou for placeholder
            if (!item.imagem_url || item.imagem_url.includes("via.placeholder.com")) {
                let contentType;
                switch (item.conteudo) {
                    case "Anime":
                    case "Filme":
                        contentType = "anime";
                        break;
                    case "Manga":
                    case "Manhwa":
                    case "Webtoon":
                        contentType = "manga";
                        break;
                    default:
                        contentType = "anime";
                }

                try {
                    const response = await fetch(`/search_image?q=${encodeURIComponent(item.nome)}&type=${encodeURIComponent(contentType)}`);
                    const data = await response.json();
                    const imageUrl = data.image_url;

                    // Atualiza imagem no DOM
                    element.querySelector('.item-image img').src = imageUrl;

                    // ❌ Só salva no banco se NÃO for placeholder
                    if (!imageUrl.includes("via.placeholder.com")) {
                        console.log("Salvando imagem no banco:", imageUrl, item.id);
                        await fetch(`/linhas/${item.id}/imagem`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imagem_url: imageUrl })
                        });
                    }

                } catch (err) {
                    console.error("Erro ao buscar imagem:", err);
                }
            }
        });

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        document.querySelectorAll('.item-card').forEach(async element => {
            const item = linhas.find(i => i.id == element.dataset.itemId);

            // Se faltarem sinopse ou sinônimos, buscar
            if (!item.needs_details) {
                let contentType;
                switch (item.conteudo) {
                    case "Anime":
                    case "Filme":
                        contentType = "anime";
                        break;
                    case "Manga":
                    case "Manhwa":
                    case "Webtoon":
                        contentType = "manga";
                        break;
                    default:
                        contentType = "anime";
                }
                try {
                    const resp = await fetch(`/search_details?q=${encodeURIComponent(item.nome)}&type=${encodeURIComponent(contentType)}`);
                    if (resp.ok) {
                        const det = await resp.json();
                        await fetch(`/linhas/${item.id}/details`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                sinonimos: det.sinonimos,
                                sinopse: det.sinopse
                            })
                        });
                        console.log(`🔄 Detalhes atualizados para: ${item.nome}`);
                    }
                } catch (err) {
                    console.error("Erro ao buscar detalhes:", err);
                }

                // Pausa entre as requisições
                await sleep(1000);
            }
        });


        document.getElementById('add-line-btn').addEventListener('click', () => {
            formMode = 'add';
            lineForm.reset();
            selectedTags = [];
            updateSelectedTags();
            lineModal.classList.remove('hidden');
            lineModal.classList.add('show');
            initResizeObserver();
        });

        // ...existing code...
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

        document.getElementById('export-confirm-btn').addEventListener('click', async () => {
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
            };

            const allItens = window.__linhasAtuais || [];
            const selected = window.__ultimoFiltroSelecionado || {
                status: { include: new Set(), exclude: new Set() },
                conteudo: { include: new Set(), exclude: new Set() },
                opiniao: { include: new Set(), exclude: new Set() },
                tags: { include: new Set(), exclude: new Set() }
            };

            const showPutariaManhwa = document.getElementById('toggle-censure').checked;
            const filtered = allItens.filter(item => {
                const isPutaria = getClasseExtra(item) === "Putaria";
                const isManhwa = (item.conteudo || "").trim().toLowerCase() === "manhwa";
                if (!showPutariaManhwa && isPutaria && isManhwa) return false;

                const nameFilter = document.getElementById('search-name').value.toLowerCase().trim();
                if (nameFilter && !item.nome.toLowerCase().includes(nameFilter)) return false;

                for (let type of ['status', 'conteudo', 'opiniao']) {
                    const val = item[type];
                    const { include, exclude } = selected[type];
                    if (exclude.size && exclude.has(val)) return false;
                    if (include.size && !include.has(val)) return false;
                }

                const itemTags = item.tags ? item.tags.split(',').map(t => t.trim()) : [];
                for (let bad of selected.tags.exclude) if (itemTags.includes(bad)) return false;
                if (selected.tags.include.size) {
                    const allIncluded = [...selected.tags.include].every(tag => itemTags.includes(tag));
                    if (!allIncluded) return false;
                }

                return true;
            });

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
                const color = hex; // ou `${hex}AA` se quiser transparência (ARGB)
                if (usedColors.has(color)) return getRandomColor(); // evita repetição direta
                usedColors.add(color);
                return color;
            }

            // Gera cor única por item.id
            for (let item of filtered) {
                colorMap[item.id] = getRandomColor();
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

            worksheet.columns = headerKeys.map(key => ({ header: key, key, width: 20 }));

            for (let item of filtered) {
                let sinopseText = item.sinopse || '';
                const tags = item.tags ? item.tags.split(',').map(t => t.trim()) : [''];
                const bgColor = colorMap[item.id];

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

                    const excelRow = worksheet.addRow(rowData);

                    // Aplica cor no fundo das células
                    excelRow.eachCell((cell) => {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: bgColor }
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
            loaderModal.classList.remove('show');
            loaderModal.classList.add('hidden');
        });

        // ...existing code...
        document.getElementById('search-name')
            .addEventListener('input', () => filterItems(linhas, selected));


        addItemClickEvent(linhas);
        showHighlights(lista);
    }

    // Função para filtrar os itens com base no filtro
    function filterItems(linhas, selected) {
        const nameFilter = document.getElementById('search-name').value
            .toLowerCase().trim();

        const filtered = linhas.filter(item => {
            // 1) filtro por nome OU sinônimo
            if (nameFilter) {
                const nomeMatch = item.nome.toLowerCase().includes(nameFilter);

                // Trata sinônimos como array, ou faz parse se for string JSON
                let sinonimos = [];
                if (Array.isArray(item.sinonimos)) {
                    sinonimos = item.sinonimos;
                } else if (typeof item.sinonimos === 'string') {
                    try {
                        sinonimos = JSON.parse(item.sinonimos);
                    } catch (e) {
                        sinonimos = [];
                    }
                }

                const sinonimoMatch = sinonimos.some(s =>
                    typeof s === 'string' && s.toLowerCase().includes(nameFilter)
                );

                if (!nomeMatch && !sinonimoMatch)
                    return false;
            }

            // 2) para cada tipo, aplicamos primeiro EXCLUDES, depois INCLUDES
            for (let type of ['status', 'conteudo', 'opiniao']) {
                const val = item[type];
                const { include, exclude } = selected[type];

                if (exclude.size > 0 && exclude.has(val))
                    return false;
                if (include.size > 0 && !include.has(val))
                    return false;
            }

            // 3) tags: múltiplas por item
            const itemTags = item.tags
                ? item.tags.split(',').map(t => t.trim())
                : [];

            // a) excluir tags indesejadas
            for (let bad of selected.tags.exclude) {
                if (itemTags.includes(bad))
                    return false;
            }

            // b) incluir pelo menos todas as tags desejadas
            if (selected.tags.include.size > 0) {
                const allIncluded = [...selected.tags.include].every(tag => itemTags.includes(tag));
                if (!allIncluded) return false;
            }

            return true;
        });

        window.__ultimaChamadaLinhas = filtered;
        showItems(filtered);
    }


    // Função para exibir os itens filtrados
    function showItems(linhas) {
        const showPutariaManhwa = document.getElementById('toggle-censure').checked;

        // Filtra as linhas com base no estado do switch
        const filteredLinhas = linhas.filter(item => {
            const isPutaria = getClasseExtra(item) === "Putaria";
            const isManhwa = item.conteudo === "Manhwa";

            // Oculta apenas itens que são "Putaria" e "Manhwa" ao mesmo tempo
            return showPutariaManhwa || !(isPutaria && isManhwa);
        });

        const listItemsContainer = document.querySelector('.items-grid');
        listItemsContainer.innerHTML = filteredLinhas.map(item => `
            <div class="item-card ${getClasseExtra(item)}" data-item-id="${item.id}">
                    <div class="status-indicator">${getStatusIcon(item.status)}</div>
                    <div class="opinion-indicator">${getOpiniaoIcon(item.opiniao)}</div>
                    
                    <div class="item-card-image">
                        <img src="${item.imagem_url || 'https://via.placeholder.com/150'}" alt="${item.nome}">
                    </div>
                    
                    <div class="item-card-content">
                        <h3 class="item-card-title">${item.nome}</h3>
                        <div class="item-card-info">
                        <span>${item.episodio || 'N/A'}</span>
                        <span>${item.conteudo || ''}</span>
                        </div>
                    </div>
                </div>
        `).join('');

        addItemClickEvent(filteredLinhas);

        document.querySelectorAll('.item-info').forEach(async (element) => {
            const itemId = element.getAttribute('data-item-id');
            const item = linhas.find(i => i.id == itemId);

            // Só faz a busca se imagem estiver vazia ou for placeholder
            if (!item.imagem_url || item.imagem_url.includes("via.placeholder.com")) {
                let contentType;
                switch (item.conteudo) {
                    case "Anime":
                    case "Filme":
                        contentType = "anime";
                        break;
                    case "Manga":
                    case "Manhwa":
                    case "Webtoon":
                        contentType = "manga";
                        break;
                    default:
                        contentType = "anime";
                }

                const fetchedUrl = await fetchImageUrl(item.nome, contentType);
                if (fetchedUrl && !fetchedUrl.includes('via.placeholder.com')) {
                    await fetch(`/linhas/${item.id}/imagem`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imagem_url: fetchedUrl })
                    });
                    item.imagem_url = fetchedUrl;
                }

                try {
                    const response = await fetch(`/search_image?q=${encodeURIComponent(item.nome)}&type=${encodeURIComponent(contentType)}`);
                    const data = await response.json();
                    const imageUrl = data.image_url;

                    // Atualiza imagem no DOM
                    element.querySelector('.item-image img').src = imageUrl;

                    // ❌ Só salva no banco se NÃO for placeholder
                    if (!imageUrl.includes("via.placeholder.com")) {
                        console.log("Salvando imagem no banco:", imageUrl, item.id);
                        await fetch(`/linhas/${item.id}/imagem`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imagem_url: imageUrl })
                        });
                    }

                } catch (err) {
                    console.error("Erro ao buscar imagem:", err);
                }
            }
        });
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

    // Função para buscar imagem
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

    function displayImage(imageUrl) {
        const imgElement = document.createElement('img');
        imgElement.src = imageUrl;
        imgElement.alt = 'Imagem do conteúdo';
        document.getElementById('image-container').appendChild(imgElement);
    }

    function bindSinopseButton(item) {
        const btn = document.getElementById('showSynopsisBtn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const synopsisModal = document.createElement('div');
            synopsisModal.id = 'synopsis-modal';
            synopsisModal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            max-width: 600px;
            max-height: 80vh;
            background: var(--color-card-bg);
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 5px 30px rgba(0,0,0,0.3);
            z-index: 10000;
            overflow-y: auto;
        `;

            synopsisModal.innerHTML = `
            <h3 style="margin-top: 0;">Sinopse de ${item.nome}</h3>
            <p id="sinopse-texto" style="line-height: 1.6;">${item.sinopse || 'Sinopse não disponível'}</p>
            <button id="closeSynopsis" style="
                position: absolute;
                top: 10px;
                right: 10px;
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: #ccc;
            ">&times;</button>
        `;

            document.body.appendChild(synopsisModal);

            // Fechar modal
            document.getElementById('closeSynopsis').addEventListener('click', () => {
                document.body.removeChild(synopsisModal);
            });

            // Fechar ao clicar fora
            synopsisModal.addEventListener('click', (e) => {
                if (e.target === synopsisModal) {
                    document.body.removeChild(synopsisModal);
                }
            });
        });
    }

    // Exibir detalhes de uma linha
    async function showItemDetails(item, navList = null) {
        modalInfo.classList.remove('show');
        modalInfo.classList.remove('hidden');
        currentNavList = navList || (window.__ultimaChamadaLinhas || []);
        allIds = currentNavList.map(i => i.id);
        currentIdx = allIds.indexOf(item.id);

        const seqNavList = Array.isArray(navList)
            && navList.length > 0
            && navList[0].ordem !== undefined
            ? navList
            : [];

        currentNavList = seqNavList;  // agora só terá algo se for sequência
        console.log("[📋] usarei como currentNavList:", currentNavList);

        // Pegamos o nome do item anterior, se existir
        let sequenciaInfo = '';
        if (currentNavList.length) {
            const ids = currentNavList.map(i => i.id);
            const idx = ids.indexOf(item.id);
            if (idx > 0) {
                const anterior = currentNavList[idx - 1];
                sequenciaInfo = `Sequência após ${anterior.nome}`;
            }
        }

        if (!sequenciaInfo) {
            try {
                // GET /linhas/:id/sequencias → lista de sequências que contém este item
                const seqsRes = await fetch(`/linhas/${item.id}/sequencias`);
                const seqsJson = await seqsRes.json();
                if (seqsJson.total_sequencias > 0) {
                    const seqId = seqsJson.sequencias[0].id;
                    // GET /sequencias/:seqId → detalhes, incluindo itens
                    const detailRes = await fetch(`/sequencias/${seqId}`);
                    const detailJson = await detailRes.json();
                    const itens = detailJson.itens || [];
                    const ids = itens.map(i => i.id);
                    const idx = ids.indexOf(item.id);
                    if (idx > 0) {
                        prevName = itens[idx - 1].nome;
                        sequenciaInfo = `Sequência após ${prevName}`;
                    }
                }
            } catch (e) {
                console.warn("Erro ao buscar sequência via API:", e);
            }
        }

        // Criar container de export no início de showItemDetails:
        let exportCard = document.getElementById('export-card');
        if (!exportCard) {
            exportCard = document.createElement('div');
            exportCard.id = 'export-card';
            // estilos principais
            Object.assign(exportCard.style, {
                width: '600px',
                background: 'linear-gradient(180deg, rgb(6, 18, 67), rgb(42, 77, 142), rgb(0, 85, 185))',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
                padding: '20px',
                boxSizing: 'border-box',
                position: 'absolute',
                top: '-9999px',
                left: '-9999px',
                opacity: '1',
                PointerEvents: 'none',
                zIndex: -1
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
                contentType = "manga";
                break;
            default:
                contentType = "anime";
        }

        const imageUrl = item.imagem_url || await fetchImageUrl(item.nome, contentType);
        console.log("URL da imagem:", imageUrl);

        mainInfoContent.innerHTML = `
            <div id="info-div-box">
                <fieldset>
                    <legend style="font-weight:600;">Conteúdo:</legend>
                    <p style="margin: 0; border: 0;">${item.conteudo}</p>
                </fieldset>
                <fieldset>
                    <legend style="font-weight:600;">Status:</legend>
                    <p style="margin: 0; border: 0;">${item.status}</p>
                </fieldset>
                <fieldset>
                    <legend style="font-weight:600;">Opinião:</legend>
                    <p style="margin: 0; border: 0;">${item.opiniao}</p>
                </fieldset>
                <fieldset>
                    <legend style="font-weight:600;">${getEpisodeLabel(item.conteudo)}:</legend>
                    <p style="margin: 0; border: 0;">${item.episodio}</p>
                </fieldset>
                <fieldset style="width: 80%;">
                    <legend style="font-weight:600;">Tags:</legend>
                    <p style="margin: 0; border: 0;">${item.tags}</p>
                </fieldset>
                
                <div class="item-actions">
                    <button id="editLineButton"><i class="fas fa-edit"></i></button>
                    <div class="sequence-controls">
                        <button id="mainSequenceBtn">
                            <i class="fas fa-project-diagram"></i> Sequência
                        </button>
                        <div class="sequence-actions" style="display: none;">
                            ${await getSequenceButtons(item.id)}
                        </div>
                    </div>
                    <button id="exportCardBtn" style="padding:6px 8px; font-size: 20px; border:none; background:#007bff; color:white; border-radius:4px; cursor:pointer;">
                        <i class="fas fa-image"></i>
                    </button>
                    <button id="deleteLineButton"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `;

        const hasSequence = await checkIfItemHasSequence(item.id);

        modalPhoto.innerHTML = `
            <div class="modal-photo-container">
                <h2 class="clickable-title" style="width: ${hasSequence ? '1010px' : '710px'}">${item.nome}</h2>
                
                <img id="modalImage" src="${imageUrl}" alt="${item.nome}" 
                    style="max-width: 100%; height: 400px; border-radius: 10px; cursor:pointer;">
                
                <!-- Botão para abrir sinopse -->
                <button id="showSynopsisBtn" style="
                    position: absolute;
                    bottom: -40px;
                    right: 90px;
                    padding: 8px 15px;
                    background: #4a6fc5;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    z-index: 10;
                ">
                    <i class="fas fa-book-open"></i> Ver Sinopse
                </button>
            </div>
        `;

        sequenceModal.innerHTML = `
            <div class="sequence-display" id="sequenceDisplay">
                <div class="sequence-list" id="sequenceList"></div>
            </div>
        `;



        // Dentro de showItemDetails, após renderizar o modal:
        exportCard.innerHTML = `
            <div class="card-container">
                <div class="card-header">
                    <div class="gold-border"></div>
                    <h1 class="card-title">${item.nome}</h1>
                    
                    <!-- Sinônimos adicionados aqui -->
                    <div class="synonyms-container" style="margin-top: 8px;">
                        ${Array.isArray(item.sinonimos) ?
                item.sinonimos.map(s => `<span class="synonym-tag">${s}</span>`).join('') :
                (item.sinonimos || '')
            }
                    </div>
                    
                    <div class="gold-border"></div>
                </div>
                
                <div class="card-content">
                    <div class="image-container">
                        <img src="${item.imagem_url}" alt="${item.nome}" class="card-image">
                    </div>
                    
                    ${sequenciaInfo
                ? `<div class="sequencia-info" style="margin: 8px 0; color: #FFD700; font-style: italic;">
                        ${sequenciaInfo}
                        </div>`
                : ''}
                    <!-- Sinopse adicionada aqui -->
                    <div class="synopsis-container" id="synopsisContainer">
                        <h3 class="synopsis-title">Sinopse</h3>
                        <p class="synopsis-text">${item.sinopse || 'Sinopse não disponível'}</p>
                    </div>
                    
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Conteúdo:</span>
                            <span class="info-value">${item.conteudo}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Status:</span>
                            <span class="info-value">${item.status}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Opinião:</span>
                            <span class="info-value">${item.opiniao}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">${getEpisodeLabel(item.conteudo)}:</span>
                            <span class="info-value">${item.episodio}</span>
                        </div>
                        <div class="info-item full-width">
                            <span class="info-label">Tags:</span>
                            <span class="info-value">${item.tags}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            .card-container {
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            
            .card-header {
                text-align: center;
                position: relative;
                padding: 10px 0;
            }

            .card-content {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            
            .gold-border {
                height: 3px;
                background: linear-gradient(90deg, transparent, #D4AF37, transparent);
                margin: 5px 0;
            }
            
            .card-title {
                font-family: 'Cinzel', 'Georgia', serif;
                font-size: 28px;
                font-weight: 700;
                margin: 0;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                letter-spacing: 1px;
                color: #FFD700;
            }
            
            .image-container {
                width: 80%;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
                border: 2px solid rgb(235, 180, 0);
            }
            
            .card-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }
            
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-top: 15px;
            }
            
            .info-item {
                background: rgba(0, 0, 0, 0.2);
                padding: 10px;
                border-radius: 6px;
                border-left: 3px solid #D4AF37;
            }
            
            .full-width {
                grid-column: span 2;
            }
            
            .info-label {
                display: block;
                font-weight: 600;
                font-size: 14px;
                color: #FFD700;
                margin-bottom: 3px;
            }
            
            .info-value {
                display: block;
                font-size: 16px;
                color: #FFFFFF;
            }

            .synonyms-container {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                justify-content: center;
                margin: 8px 0 12px;
            }
            
            .synonym-tag {
                background: rgba(212, 175, 55, 0.2);
                color: #FFD700;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 12px;
                border: 1px solid rgba(212, 175, 55, 0.4);
            }
            
            .synopsis-container {
                background: rgba(0, 0, 0, 0.2);
                padding: 12px;
                border-radius: 8px;
                margin: 15px 0;
                border-left: 3px solid #D4AF37;
            }
            
            .synopsis-title {
                color: #FFD700;
                margin-top: 0;
                margin-bottom: 8px;
                font-size: 16px;
            }
            
            .synopsis-text {
                color: #FFFFFF;
                font-size: 14px;
                line-height: 1.5;
                margin: 0;
                max-height: 150px;
                overflow-y: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 7;
                line-clamp: 2;
                -webkit-box-orient: vertical;
                line-height: 1.4;
            }
            
            .gold-sparkle {
                width: 12px;
                height: 12px;
                background: #FFD700;
                border-radius: 50%;
                box-shadow: 0 0 10px 3px rgba(255, 215, 0, 0.7);
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 0.7; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.2); }
                100% { opacity: 0.7; transform: scale(1); }
            }
        `;
        exportCard.appendChild(style);

        async function checkIfItemHasSequence(itemId) {
            try {
                const response = await fetch(`/linhas/${itemId}/sequencias`);
                const data = await response.json();
                // ⬇️ aqui, usa o length do array
                return Array.isArray(data.sequencias) && data.sequencias.length > 0;
            } catch (error) {
                console.error('Erro ao verificar sequências:', error);
                return false;
            }
        }

        modalPhoto.style.height = `${mainInfoContent.offsetHeight}px`;
        sequenceModal.style.height = `${mainInfoContent.offsetHeight}px`;

        function setupSequenceActionButtons() {
            const mainBtn = document.getElementById('mainSequenceBtn');
            const actionsPanel = document.querySelector('.sequence-actions');
            if (!mainBtn || !actionsPanel) return;

            // Remove listener antigo (se existia)
            mainBtn.replaceWith(mainBtn.cloneNode(true));
            const freshMainBtn = document.getElementById('mainSequenceBtn');

            // Toda vez que clicar em “Sequência”, alterna display
            freshMainBtn.addEventListener('click', () => {
                const isOpen = actionsPanel.style.display === 'block';
                actionsPanel.style.display = isOpen ? 'none' : 'block';
            });
        }

        // Funções auxiliares
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

        // Event Listener melhorado para alternar o estado
        document.getElementById('mainSequenceBtn').addEventListener('click', async function () {
            const actionsPanel = this.nextElementSibling;
            const isActive = actionsPanel.style.display === 'block';

            // Alterna a visibilidade
            actionsPanel.style.display = isActive ? 'none' : 'block';

            // Atualiza a classe active
            if (isActive) {
                this.classList.remove('active');
            } else {
                this.classList.add('active');

                // Atualiza os botões sempre que abre (caso tenha mudado)
                const newButtons = await getSequenceButtons(item.id);
                actionsPanel.innerHTML = newButtons;

                // Reatacha os event listeners aos novos botões
                setupSequenceActionButtons(item);
            }
        });

        // Criar sequência
        document.querySelector('.sequence-actions').addEventListener('click', async (e) => {
            if (e.target.id === 'createSequence') {
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

                refreshSequenceDisplay(sequence.id);
            }

            if (e.target.id === 'addToSequence') {
                showAddToSequenceModal(item);
            }

            if (e.target.id === 'deleteSequence') {
                if (confirm('Tem certeza que deseja apagar esta sequência?')) {
                    const sequences = await (await fetch(`/linhas/${item.id}/sequencias`)).json();
                    await fetch(`/sequencias/${sequences.sequencias[0].id}`, { method: 'DELETE' });
                    refreshSequenceDisplay();
                }
            }
        });

        // Mostrar modal de adição à sequência
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
        }

        function displaySearchResults(items, currentItem, modal) {
            // capture de novo, mas sempre dentro do modal
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
                    // ... seu código de adicionar à sequência ...
                    document.body.removeChild(modal);
                    refreshSequenceDisplay(item.id);
                });
            });
        }

        // Atualizar exibição da sequência
        async function refreshSequenceDisplay(sequenceId = null) {
            if (!sequenceId) {
                const sequences = await (await fetch(`/linhas/${item.id}/sequencias`)).json();
                sequenceId = sequences.sequencias[0]?.id;
            }

            const sequenceDisplay = document.getElementById('sequenceDisplay');
            const sequenceList = document.getElementById('sequenceList');

            // Se não houver sequência, esconde o modal de sequência
            if (!sequenceId) {
                // Esconde todo o bloco de sequência
                sequenceModal.innerHTML = "";
                sequenceModal.style.height = "0";
                return;
            }

            // Se houver, mostra normalmente
            sequenceModal.innerHTML = `
                <div class="sequence-display" id="sequenceDisplay">
                    <div class="sequence-list" id="sequenceList"></div>
                </div>
            `;
            sequenceModal.style.height = `${mainInfoContent.offsetHeight + 0.41}px`;

            const response = await fetch(`/sequencias/${sequenceId}`);
            const sequence = await response.json();

            const sequenceListDiv = document.getElementById('sequenceList');
            sequenceListDiv.innerHTML = sequence.itens.map(item => `
                <div class="sequence-card${getClasseExtra(item) ? ' ' + getClasseExtra(item) : ''}">
                    <div class="order">${item.ordem}</div>
                    <button class="remove-sequence-item" data-id="${item.id}">&times;</button>
                    <img src="${item.imagem_url}" alt="${item.nome}">
                    <p class="sequence-text">${item.nome}</p>
                </div>
            `).join('');
            sequenceItemClickEvent(sequence.itens);

            document.querySelectorAll('.remove-sequence-item').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    await fetch(`/sequencias/${sequenceId}/itens/${e.target.dataset.id}`, {
                        method: 'DELETE'
                    });
                    refreshSequenceDisplay(sequenceId);
                });
            });

            function sequenceItemClickEvent(itens) {
                const sequenceContainer = document.querySelector('.sequence-list');
                sequenceContainer.addEventListener('click', (event) => {
                    const itemElement = event.target.closest('.sequence-card');
                    const isBotao = event.target.tagName === 'BUTTON';

                    // Ignora clique no botão
                    if (!itemElement || isBotao) return;

                    const index = Array.from(sequenceContainer.children).indexOf(itemElement);
                    const item = itens[index];
                    if (item) showItemDetails(item, itens);
                });
            }
        }

        async function exportItemAsImage(item) {
            // 1) Se não tiver URL, busca uma
            if (!item.imagem_url || item.imagem_url === "undefined" || item.imagem_url === "null") {
                let contentType;
                switch (item.conteudo) {
                    case "Anime":
                    case "Filme":
                        contentType = "anime";
                        break;
                    case "Manga":
                    case "Manhwa":
                    case "Webtoon":
                        contentType = "manga";
                        break;
                    default:
                        contentType = "anime";
                }
                const fetchedUrl = await fetchImageUrl(item.nome, contentType);
                if (fetchedUrl && !fetchedUrl.includes('via.placeholder.com')) {
                    item.imagem_url = fetchedUrl;
                    // opcional: salve no banco
                    await fetch(`/linhas/${item.id}/imagem`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imagem_url: fetchedUrl })
                    });
                } else {
                    return alert("Imagem indisponível para exportação.");
                }
            }

            const exportCard = document.getElementById('export-card');
            const imgEl = exportCard.querySelector('img');

            // 2) Use sempre o proxy para evitar CORS
            imgEl.src = `/proxy_image?url=${encodeURIComponent(item.imagem_url)}`;

            // 3) Aguarde o load antes de capturar
            await new Promise(resolve => {
                imgEl.onload = resolve;
                imgEl.onerror = resolve;
            });

            // 4) Agora gera o canvas
            const canvas = await html2canvas(exportCard);
            const finalDataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = finalDataURL;
            link.download = `${item.nome.replace(/\s+/g, '_')}.png`;
            link.click();
        }

        // Chamada inicial para carregar a sequência
        refreshSequenceDisplay();
        bindSinopseButton(item);

        document.getElementById('modalImage').addEventListener('click', async () => {
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

                loader.style.display = 'none';

                if (urls.length === 0) {
                    return alert("Não foi possível encontrar alternativas melhores.");
                }

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
                urls.forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
                    img.style.cursor = 'pointer';
                    img.addEventListener('click', async () => {
                        document.getElementById('modalImage').src = url;
                        await fetch(`/linhas/${item.id}/imagem`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ imagem_url: url })
                        });
                        document.body.removeChild(selector);
                        alert("Imagem atualizada!");
                    });
                    listDiv.appendChild(img);
                });

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

            } catch (error) {
                loader.style.display = 'none';
                alert('Erro ao buscar imagens. Tente novamente.');
                console.error(error);
            }
        });

        // Mostrar campo ao clicar no botão de link
        document.getElementById('deleteLineButton').addEventListener('click', () => deleteLine(item.id));
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
        // Ativar listener do botão de exportar
        document.getElementById('exportCardBtn')
            .addEventListener('click', () => exportItemAsImage(item));
        modalInfo.classList.add('show');
    }

    function openItemByIndex(idx) {
        if (idx < 0 || idx >= allIds.length) return;
        const nextItemId = allIds[idx];
        const nextItem = currentNavList.find(i => i.id === nextItemId);
        if (nextItem) showItemDetails(nextItem, currentNavList);
    }

    function handleModalArrowNav(e) {
        if (!modalInfo.classList.contains('show')) return;
        if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            if (e.key === "ArrowRight") openItemByIndex(currentIdx + 1);
            if (e.key === "ArrowLeft") openItemByIndex(currentIdx - 1);
            if (e.key === "ArrowDown") openItemByIndex(currentIdx + 5);
            if (e.key === "ArrowUp") openItemByIndex(currentIdx - 5);
        }
    }
    document.addEventListener('keydown', handleModalArrowNav);


    // Abrir modal de edição
    function openEditModal(item) {
        modalInfo.classList.add('hidden');
        formMode = 'edit';
        currentEditingId = item.id;

        document.getElementById('line-name').value = item.nome;
        document.getElementById('line-content').value = item.conteudo;
        document.getElementById('line-status').value = item.status;
        document.getElementById('line-episode').value = item.episodio;
        document.getElementById('line-opinion').value = item.opiniao;

        selectedTags = item.tags ? item.tags.split(",") : [];
        updateSelectedTags();

        document.querySelector('button[type="submit"]').textContent = 'Salvar Alterações';
        lineModal.classList.remove('hidden');
        lineModal.classList.add('show');
        initResizeObserver();
    }

    // Atualizar uma linha
    async function updateLine(itemId) {
        const updatedItem = {
            nome: document.getElementById('line-name').value,
            conteudo: document.getElementById('line-content').value,
            status: document.getElementById('line-status').value,
            episodio: document.getElementById('line-episode').value,
            opiniao: document.getElementById('line-opinion').value,
            tags: selectedTags.join(", ")
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

            // Recarregar as linhas da lista atual
            const updatedLinesResponse = await fetch(`/linhas/${currentList.id}`);
            const updatedLines = await updatedLinesResponse.json();
            updatedLines.sort((a, b) => a.nome.localeCompare(b.nome));
            showItems(updatedLines);

            // Resetar formulário e modo
            formMode = 'add';
            currentEditingId = null;
            lineForm.reset();
            selectedTags = [];
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
            lista_id: currentList.id,
            nome: document.getElementById('line-name').value,
            tags: selectedTags.join(', '),
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

            formMode = 'add';
            lineForm.reset();
            selectedTags = [];
            updateSelectedTags();
            lineModal.classList.add('hidden');
            showListDetails(currentList);
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
            showListDetails(currentList);
        } catch (error) {
            console.error('Erro:', error);
        }
    }

    // ---------------------------- SISTEMA DE TAGS ----------------------------
    // Tags organizadas por categorias
    const romanceTags = [
        "Romance", "Beijo", "Namoro", "Casamento", "Morar Juntos", "Noivado",
        "Romance do bom", "Fez Filho(s)", "Gravidez"
    ];
    const actionAdventureTags = [
        "Ação", "Poder", "Aventura", "Overpower", "Dungeon", "Mecha", "Demônio", "Monstros"
    ];
    const fantasySupernaturalTags = [
        "Magia", "Fantasia", "Sobrenatural", "Deuses", "Reencarnar", "Medieval"
    ];
    const dramaEmotionalTags = [
        "Drama", "Tristeza", "Cringe"
    ];
    const sciFiTechTags = [
        "SciFi", "VR/Jogo", "System"
    ];
    const sliceOfLifeTags = [
        "Slice of Life", "Vida Escolar", "Dormitorios"
    ];
    const comedyTags = [
        "Comédia", "Fofo"
    ];
    const horrorTags = [
        "Terror", "Gore"
    ];
    const sportsMusicTags = [
        "Esporte", "Musical"
    ];
    const genderTags = [
        "Shounen", "Shoujo-ai", "Mahou Shoujo", "Yuri", "Gender bender"
    ];
    const adultControversialTags = [
        "Ecchi", "Nudez", "Sexo", "Incesto", "NTR", "Harem", "Nudez Nippleless"
    ];
    const isekaiTags = [
        "Isekai", "MC Vilão"
    ];
    const characterTags = [
        "Kemonomimi", "Goat"
    ];

    // Junta todas as tags
    const allTags = [
        ...romanceTags, ...actionAdventureTags, ...fantasySupernaturalTags,
        ...dramaEmotionalTags, ...sciFiTechTags, ...sliceOfLifeTags,
        ...comedyTags, ...horrorTags, ...sportsMusicTags,
        ...genderTags, ...adultControversialTags, ...isekaiTags,
        ...characterTags
    ];

    // Selecionar tag
    function selectTag(tag) {
        if (!selectedTags.includes(tag)) {
            selectedTags.push(tag);
            updateSelectedTags();
        }
    }

    // Atualizar tags selecionadas na interface
    function updateSelectedTags() {
        if (selectedTags.length === 0) {
            selectedTagsContainer.style.display = 'none';
        } else {
            selectedTagsContainer.style.display = 'flex';
            selectedTagsContainer.innerHTML = selectedTags
                .map(tag => `<span class="selected-tag">${tag}</span>`)
                .join('');
            document.querySelectorAll('.selected-tag').forEach(tagElement => {
                tagElement.addEventListener('click', () => removeTag(tagElement.textContent));
            });
        }
    }

    // Remover tag selecionada
    function removeTag(tag) {
        selectedTags = selectedTags.filter(selectedTag => selectedTag !== tag);
        updateSelectedTags();
    }

    // Exibir todas as tags no container
    function showAllTags() {
        const tagsContainer = document.querySelector('.tags-container-div');
        tagsContainer.innerHTML = '';
        const sortedTags = allTags.sort();
        sortedTags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.classList.add('tag');
            tagElement.textContent = tag;
            tagsContainer.appendChild(tagElement);
            tagElement.addEventListener('click', () => selectTag(tag));
        });
    }

    // ---------------------------- DESTAQUE ----------------------------
    async function showHighlights(lista) {
        try {
            // Buscar itens da lista
            const res = await fetch(`/to_highlight/${lista.id}`);
            if (!res.ok) throw new Error('Erro ao buscar destaques');
            let itens = await res.json();

            // Censura (Putaria + Manhwa)
            const toggle = document.getElementById('toggle-censure');
            const showPutariaManhwa = toggle && toggle.checked;

            itens = itens.filter(item => {
                const classeExtra = getClasseExtra(item);
                const isPutaria = classeExtra === "Putaria";
                const conteudo = (item.conteudo || "").trim().toLowerCase();
                const isManhwa = conteudo === "manhwa";

                return showPutariaManhwa || !(isPutaria && isManhwa);
            });

            // Atualiza o container
            const container = document.querySelector('.highlights-list');
            container.innerHTML = ''; // <- limpa sempre, antes de adicionar os novos itens

            if (itens.length === 0) {
                container.innerHTML = '<p>Nenhum item pendente.</p>';
                return;
            }

            // Monta os cards
            itens.sort((a, b) =>
                a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
            );

            // Agora sim, gerar os cards
            itens.forEach(item => {
                const extraClass = getClasseExtra(item); // Ex: "Putaria"
                const div = document.createElement('div');
                div.classList.add('highlight-item');
                if (extraClass) div.classList.add(extraClass);

                div.innerHTML = `
                    <img src="${item.imagem_url}" style="width:80px;height:120px;border-radius:6px;">
                    <p class="highlight-text">${item.nome}</p>
                    <button data-id="${item.id}">Verificado ✔️</button>
                `;

                div.querySelector('button').addEventListener('click', async e => {
                    await fetch(`/highlighted/${e.target.dataset.id}`, { method: 'POST' });
                    div.remove();
                });

                container.appendChild(div);
            });

            destaqueItemClickEvent(itens);

            // Se ainda não adicionou o listener, adiciona
            if (!toggle.dataset.bound) {
                toggle.addEventListener('change', () => {
                    showHighlights(lista); // Recarrega os destaques com novo estado do toggle
                });
                toggle.dataset.bound = "true"; // Marca como já vinculado
            }

        } catch (error) {
            console.error('Erro ao carregar destaques:', error);
        }
    }

    function destaqueItemClickEvent(itens) {
        const destaqueContainer = document.querySelector('.highlights-list');
        destaqueContainer.addEventListener('click', (event) => {
            const itemElement = event.target.closest('.highlight-item');
            const isBotao = event.target.tagName === 'BUTTON';

            // Ignora clique no botão de "Verificado ✔️"
            if (!itemElement || isBotao) return;

            const index = Array.from(destaqueContainer.children).indexOf(itemElement);
            const item = itens[index];
            if (item) showItemDetails(item, itens);
        });
    }


    // ---------------------------- INICIALIZAÇÃO ----------------------------
    document.addEventListener('DOMContentLoaded', () => {
        initModalEvents();
        loadLists();
        showAllTags();
    });
})();
