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
            <h1>${lista.nome}</h1>
            <div class="pesquisa">
                <label class="switch">
                        <input type="checkbox" id="toggle-censure">
                        <span class="slider"></span>
                    </label>
                <div class="search-filter">
                    <input type="text" id="search-name" placeholder="Buscar por nome...">
                    <button type="button" id="filter-toggle">Filtros ▼</button>
                </div>
                <!-- painel de filtros escondido por padrão -->
                <div id="filter-panel" class="hidden">
                    <h4>----------------------------------- Status -------------------------------------</h4>
                    <div class="filter-section" data-type="status">
                    </div>
                    <h4>--------------------------------- Conteúdo ----------------------------------</h4>
                    <div class="filter-section" data-type="conteudo">
                    </div>
                    <h4>----------------------------------- Opinião ------------------------------------</h4>
                    <div class="filter-section" data-type="opiniao">
                    </div>
                    <h4>------------------------------------- Tags -------------------------------------</h4>
                    <div class="filter-section" data-type="tags">
                    </div>
                </div>
                </div>
            <button id="add-line-btn">+ Adicionar Linha</button>
            <div class="graf-list">
                <div class="container-list-items">
                    <div class="list-items">
                        ${linhas.map(item => `
                            <div class="item-info ${getClasseExtra(item)}" data-item-id="${item.id}">
                                <div class="status-icon" style="position: absolute;top: 4px;right: 8px;font-size: 30px;height: 30px;text-shadow:-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white;">
                                    ${getStatusIcon(item.status)}
                                </div>
                                <div class="opiniao-icon" style="position: absolute;top: 4px;left: 8px;font-size: 30px;height: 30px;text-shadow:-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white;">
                                    ${getOpiniaoIcon(item.opiniao)}
                                </div>
                                <div class="item-image">
                                    <img src="${item.imagem_url && !item.imagem_url.includes('via.placeholder.com') ? item.imagem_url : 'https://via.placeholder.com/150'}" alt="${item.nome}" style="height:220px;width:150px;padding-top:15px;border-radius:10px;">
                                </div>
                                <div class="item-text">${item.nome}</div>
                            </div>
                        `).join('')}
                    </div>    
                </div>
                <div class="graficos">
                    <h3>${lista.nome} para Verificar</h3>
                    <div class="destaque">
                    </div>
                </div>
            </div>
        `;

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

        document.getElementById('add-line-btn').addEventListener('click', () => {
            formMode = 'add';
            lineForm.reset();
            selectedTags = [];
            updateSelectedTags();
            lineModal.classList.remove('hidden');
            lineModal.classList.add('show');
            initResizeObserver();
        });

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
            // 1) filtro por nome
            if (nameFilter && !item.nome.toLowerCase().includes(nameFilter))
                return false;

            // 2) para cada tipo, aplicamos primeiro EXCLUDES, depois INCLUDES
            for (let type of ['status', 'conteudo', 'opiniao']) {
                const val = item[type];
                const { include, exclude } = selected[type];

                if (exclude.size > 0 && exclude.has(val))
                    return false;
                if (include.size > 0 && !include.has(val))
                    return false;
            }

            // 3) tags: um pouco diferente, porque são múltiplas por item
            const itemTags = item.tags
                ? item.tags.split(',').map(t => t.trim())
                : [];

            // a) não querer certas tags?
            for (let bad of selected.tags.exclude) {
                if (itemTags.includes(bad))
                    return false;
            }
            // b) querer pelo menos uma das tags escolhidas?
            if (selected.tags.include.size > 0) {
                const allIncluded = [...selected.tags.include].every(tag => itemTags.includes(tag));
                if (!allIncluded) return false;
            }

            return true;
        });

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

        const listItemsContainer = document.querySelector('.list-items');
        listItemsContainer.innerHTML = filteredLinhas.map(item => `
            <div class="item-info ${item.opiniao} ${getClasseExtra(item)}" data-item-id="${item.id}">
                <div class="status-icon" style="position: absolute;top: 4px;right: 8px;font-size: 30px;height: 30px;text-shadow:-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white;">
                    ${getStatusIcon(item.status)}
                </div>
                <div class="opiniao-icon" style="position: absolute;top: 4px;left: 8px;font-size: 30px;height: 30px;text-shadow:-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white;">
                    ${getOpiniaoIcon(item.opiniao)}
                </div>
                <div class="item-image">
                    <img src="${item.imagem_url && !item.imagem_url.includes('via.placeholder.com') ? item.imagem_url : 'https://via.placeholder.com/150'}" alt="${item.nome}" style="height:220px;width:150px;padding-top:15px;border-radius:10px;">
                </div>
                <div class="item-text">${item.nome}</div>
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
        const listItemsContainer = document.querySelector('.list-items');
        listItemsContainer.addEventListener('click', (event) => {
            const itemElement = event.target.closest('.item-info');
            if (itemElement) {
                const itemId = itemElement.getAttribute('data-item-id');
                const item = linhas.find(i => i.id == itemId);
                if (item) showItemDetails(item);
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

    // Exibir detalhes de uma linha
    async function showItemDetails(item) {
        modalInfo.classList.remove('hidden');
        modalInfo.classList.add('show');

        // Opcional: se quiser resetar a animação se abrir várias vezes seguidas
        modalInfo.offsetHeight; // força reflow

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
            <button id="deleteLineButton"><i class="fas fa-trash-alt"></i></button>
            <span id="close-modal-btn">&times;</span>
            <h2 class="clickable-title">${item.nome}</h2>
            <div id="info-div-box">
                <p><strong>Conteúdo:</strong> ${item.conteudo}</p>
                <fieldset>
                    <legend style="font-weight:600;">Tags:</legend>
                    <p style="margin: 0; border: 0;">${item.tags}</p>
                </fieldset>
                <p><strong>Status:</strong> ${item.status}</p>
                <p><strong>Episódio/Capítulo:</strong> ${item.episodio}</p>
                <p><strong>Opinião:</strong> ${item.opiniao}</p>
                <div class="pesquisasContainer">
                    <img class="pesquisaBtn" id="google" src="/static/img/Google.png" alt="Google">
                    <img class="pesquisaBtn" id="mangaDex" src="/static/img/MangaDex.png" alt="MangaDex">
                    <img class="pesquisaBtn" id="novelCool" src="/static/img/NovelCool.png" alt="novelCool">
                    <!-- Ícones de pesquisa de Anime -->
                    <img class="pesquisaBtn animeSearch" id="betterAnimes" src="/static/img/BetterAnimes.png" alt="BetterAnimes" style="display:none;">
                    <img class="pesquisaBtn animeSearch" id="animesFire" src="/static/img/AnimesFire.png" alt="AnimesFire" style="display:none;">
                </div>
            </div>
            <button id="editLineButton"><i class="fas fa-edit"></i></button>
        `;

        modalPhoto.innerHTML = `
            <img id="modalImage" src="${imageUrl}" alt="${item.nome}" style="max-width: 100%; height: 400px; border-radius: 10px;">
            <div style="text-align: center; margin-top: 10px;">
                <button id="refreshImageBtn" style="padding: 6px 12px; border-radius: 8px; background: green; color: white; border: none; cursor: pointer;">
                    <i class="fas fa-rotate-right"></i>
                </button>
                <button id="customImageBtn" style="padding: 6px 12px; border-radius: 8px; background: orange; color: white; border: none; cursor: pointer; margin-left: 10px;">
                    <i class="fas fa-link"></i> Link
                </button>
            </div>
            <div id="customImageInputContainer" style="display: none; margin-top: 10px; text-align: center;">
                <input type="text" id="customImageUrl" placeholder="Cole o link da imagem aqui..." style="padding: 6px; width: 80%; border-radius: 6px; border: 1px solid #ccc;">
                <button id="submitCustomImage" style="padding: 6px 12px; border-radius: 8px; background: blue; color: white; border: none; cursor: pointer; margin-left: 10px;">
                    Atualizar
                </button>
            </div>
        `;

        modalPhoto.style.height = `${mainInfoContent.offsetHeight + 0.41}px`;

        document.getElementById('refreshImageBtn').addEventListener('click', async () => {
            const currentUrl = document.getElementById('modalImage').src;
            const nomes = item.nome;        // seu título
            const tipo = contentType;       // "anime" ou "manga"
            const maxAttempts = 5;
            const urls = [];
            const loader = document.getElementById('imageLoader');
            
            loader.style.display = 'flex'; // Mostrar loader
            
            try {
                // Tenta buscar até 5 URLs diferentes
                for (let i = 0; i < maxAttempts; i++) {
                    const url = await fetchImageUrl(nomes, tipo);
                    if (!url.includes("via.placeholder.com") && url !== currentUrl && !urls.includes(url)) {
                        urls.push(url);
                    }
                }
        
                loader.style.display = 'none'; // Esconde loader após fim da busca
        
                if (urls.length === 0) {
                    return alert("Não foi possível encontrar alternativas melhores.");
                }
        
                // Cria o modal de seleção
                const selector = document.createElement('div');
                selector.className = 'image-selector-modal';
                selector.innerHTML = `
                  <div class="image-selector-content">
                    <span class="image-selector-close">&times;</span>
                    <h3>Escolha uma nova capa:</h3>
                    <div class="image-list"></div>
                  </div>
                `;
                document.body.appendChild(selector);
        
                const listDiv = selector.querySelector('.image-list');
                urls.forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
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
                loader.style.display = 'none'; // Esconde loader em caso de erro
                alert('Erro ao buscar imagens. Tente novamente.');
                console.error(error);
            }
        });        

        // Mostrar campo ao clicar no botão de link
        document.getElementById('customImageBtn').addEventListener('click', () => {
            document.getElementById('customImageInputContainer').style.display = 'block';
        });

        // Submeter novo link
        document.getElementById('submitCustomImage').addEventListener('click', () => {
            const newUrl = document.getElementById('customImageUrl').value.trim();
            if (newUrl) {
                fetch('/update_image_url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: item.id, new_url: newUrl })
                })
                    .then(res => res.json())
                    .then(data => {
                        alert(data.mensagem);
                        document.getElementById('modalImage').src = newUrl;
                    })
                    .catch(err => {
                        alert('Erro ao atualizar imagem.');
                        console.error(err);
                    });
            }
        });

        // Exibir/ocultar os botões de pesquisa de acordo com o tipo de conteúdo
        if (contentType === "anime") {
            document.querySelectorAll('.animeSearch').forEach(el => el.style.display = 'block');
            document.querySelector('#mangaDex').style.display = 'none';
            document.querySelector('#novelCool').style.display = 'none';
        } else if (contentType === "manga") {
            document.querySelectorAll('.animeSearch').forEach(el => el.style.display = 'none');
            document.querySelector('#mangaDex').style.display = 'block';
            document.querySelector('#novelCool').style.display = 'block';
        }

        // Adicionar event listeners para abrir as buscas
        document.querySelector('#mangaDex').addEventListener('click', () => {
            const mangaDexSearchUrl = `https://mangadex.org/search?q=${encodeURIComponent(item.nome)}`;
            window.open(mangaDexSearchUrl, '_blank');
        });

        document.querySelector('#novelCool').addEventListener('click', () => {
            const novelCoolSearchUrl = `https://www.novelcool.com/search/?wd=${encodeURIComponent(item.nome)}`;
            window.open(novelCoolSearchUrl, '_blank');
        });

        document.querySelector('#google').addEventListener('click', () => {
            const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(item.nome)}`;
            window.open(googleSearchUrl, '_blank');
        });

        // Adicionar event listeners para as buscas de anime
        document.querySelector('#betterAnimes').addEventListener('click', () => {
            // Substituir espaços por "+" e remover caracteres especiais
            const formattedQuery = item.nome
                .replace(/[^\w\s-]/g, '')  // Remove caracteres não alfanuméricos (mantém apenas letras, números e espaços)
                .replace(/\s+/g, '+')      // Substitui espaços por "+"
                .toLowerCase();           // Converte para minúsculo, se necessário

            const betterAnimesSearchUrl = `https://betteranime.net/pesquisa?searchTerm=${formattedQuery}`;
            window.open(betterAnimesSearchUrl, '_blank');
        });

        document.querySelector('#animesFire').addEventListener('click', () => {
            // Substituir espaços e outros caracteres especiais por "-"
            const formattedQuery = item.nome
                .replace(/[^\w\s-]/g, '')  // Remove caracteres não alfanuméricos (mantém apenas letras, números e espaços)
                .replace(/\s+/g, '-')      // Substitui espaços por "-"
                .toLowerCase();           // Converte para minúsculo, se necessário

            const animesFireSearchUrl = `https://animefire.plus/pesquisar/${formattedQuery}`;
            window.open(animesFireSearchUrl, '_blank');
        });

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

        // Botão de fechar
        document.getElementById('close-modal-btn').addEventListener('click', fecharModalInfo);

        // Clicar fora do conteúdo do modal
        modalInfo.addEventListener('click', (e) => {
            const isOutside = !e.target.closest('.modal-content') && !e.target.closest('#modal-photo');
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
    }

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
            const container = document.querySelector('.destaque');
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
                    <p class="destaque-text">${item.nome}</p>
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
        const destaqueContainer = document.querySelector('.destaque');
        destaqueContainer.addEventListener('click', (event) => {
            const itemElement = event.target.closest('.highlight-item');
            const isBotao = event.target.tagName === 'BUTTON';

            // Ignora clique no botão de "Verificado ✔️"
            if (!itemElement || isBotao) return;

            const index = Array.from(destaqueContainer.children).indexOf(itemElement);
            const item = itens[index];
            if (item) showItemDetails(item);
        });
    }


    // ---------------------------- INICIALIZAÇÃO ----------------------------
    document.addEventListener('DOMContentLoaded', () => {
        initModalEvents();
        loadLists();
        showAllTags();
    });
})();
