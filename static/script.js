(function(){
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
    const tagSearch = document.getElementById('tag-search');
    const suggestionsContainer = document.getElementById('suggestions');
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

    // ---------------------------- MODAL EVENTS ----------------------------
    function initModalEvents() {
        // Abrir modal de criar lista
        createListBtn.addEventListener('click', () => modal.classList.remove('hidden'));

        // Fechar modal de criar lista
        closeModal.addEventListener('click', () => modal.classList.add('hidden'));

        // Fechar modal de adicionar linha
        closeLineModal.addEventListener('click', () => {
            selectedTags = [];
            updateSelectedTags();
            lineModal.classList.add('hidden');
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
            return "GoAmor";
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
            return "Amor";
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
            return "Putaria";
        }

        if (
            item.tags.includes("Ação") &&
            (
                item.opiniao === "Recomendo" ||
                (
                    (item.opiniao === "Muito Bom" || item.opiniao === "Bom" || item.opiniao === "Favorito") &&
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

        const mensagem = `
                        Explicação de como usar o Filtro.

        1. Você pode pesquisar utilizando informações como Status, Tags, Opinião ou Nome.
        -- Cada Linha exibida, não começa com a informação inserida, mas contem ela;
        -- Como por exemplo, você pode escrever [ Ro ], e isso fara aparecer,
        -- tudo que possuir essa sequencia de letras, não apenas as começadas nela.

        2. Para pesquisar mais de uma coisa por vez, você utiliza o prefixo de [ + ]
        -- sem espaço, para adicionar algo no filto.
        -- Exemplo disso seria usando como [ Romance+Beijo ] para exibir apenas animes
        -- com tag de romance e beijo em conjunto.
        -- 2.1. Essa busca tambem pode mesclar informações, como utilizar Opinião e Tag,
        -- ---- Ou Nome e Status, etc.
        -- ---- Ex.: [ Beijo+Concluido ], [ Favorito+Goat ].

        3. Para fazer uma busca, mas excluir conteudos com uma possivel informação, use [ - ].
        -- Da mesma forma que o [ + ], o [ - ] adiciona uma remoção no filto, fazendo com que
        -- conteudos que possuam essa informação não sejam exibidos. Exemplo;
        -- [ Romance-NTR ], isso faz aparecer apenas animes que possuam
        -- romance mas caso algum possua NTR, ele não exibe o conteudo.
        -- 3.1. Você pode tambem misturar as buscas, utilizando [ - ] e [ + ] ao mesmo tempo.
        -- ---- Ex.: [ Namoro+Beijo-Tristeza ].

        `.replace(/\n/g, '&#10;'); // Transforma as quebras de linha para funcionar no HTML

            mainContent.innerHTML = `
                <h1>${lista.nome}</h1>
                <div class="pesquisa">
                    <input type="text" id="filter-input" placeholder="Filtrar por Status, Tags ou Opinião...">
                    <span class="info-icon" data-message="${mensagem}">i</span>
                </div>
            <button id="add-line-btn">+ Adicionar Linha</button>
            <div class="graf-list">
                <div class="container-list-items">
                    <div class="list-items">
                        ${linhas.map(item => `
                            <div class="item-info ${item.opiniao} ${getClasseExtra(item)}" data-item-id="${item.id}">
                                ${item.nome}
                            </div>
                        `).join('')}
                    </div>    
                </div>
                <div class="graficos">
                    <canvas id="statusChart"></canvas>
                    <canvas id="opinionChart"></canvas>
                </div>
            </div>
        `;

        document.getElementById('add-line-btn').addEventListener('click', () => {
            formMode = 'add';
            lineForm.reset();
            selectedTags = [];
            updateSelectedTags();
            lineModal.classList.remove('hidden');
            initResizeObserver();
        });

        const filterInput = document.getElementById('filter-input');
        filterInput.addEventListener('input', () => filterItems(linhas));

        addItemClickEvent(linhas);
        initCharts(linhas);
    }

    // Função para filtrar os itens com base no filtro
    function filterItems(linhas) {
        const filterValue = document.getElementById('filter-input').value.toLowerCase().trim();
        
        if (!filterValue) {
            showItems(linhas);
            return;
        }
    
        const includeFilters = [];
        const excludeFilters = [];
        
        filterValue.split('+').forEach(part => {
            const subFilters = part.split('-').map(f => f.trim()).filter(f => f);
            if (subFilters.length > 0) {
                includeFilters.push(...subFilters.slice(0, 1)); // Primeiro é obrigatório
                excludeFilters.push(...subFilters.slice(1)); // O restante são negativos
            }
        });
    
        // Filtrar os itens corretamente
        const filteredLinhas = linhas.filter(item => {
            const tags = item.tags ? item.tags.split(',').map(tag => tag.trim().toLowerCase()) : [];
            
            // Verifica se o item contém TODOS os filtros positivos
            const matchesInclude = includeFilters.every(filter =>
                tags.some(tag => tag.includes(filter)) ||
                item.status.toLowerCase().includes(filter) ||
                item.opiniao.toLowerCase().includes(filter) ||
                item.nome.toLowerCase().includes(filter)
            );
    
            // Verifica se NÃO contém nenhum dos filtros negativos
            const matchesExclude = excludeFilters.every(filter =>
                !tags.some(tag => tag.includes(filter)) &&
                !item.status.toLowerCase().includes(filter) &&
                !item.opiniao.toLowerCase().includes(filter) &&
                !item.nome.toLowerCase().includes(filter)
            );
    
            return matchesInclude && matchesExclude;
        });
    
        showItems(filteredLinhas);
    }    

    // Função para exibir os itens filtrados
    function showItems(linhas) {
        const listItemsContainer = document.querySelector('.list-items');
        listItemsContainer.innerHTML = linhas.map(item => `
            <div class="item-info ${item.opiniao} ${getClasseExtra(item)}" data-item-id="${item.id}">
                ${item.nome}
            </div>
        `).join('');
        addItemClickEvent(linhas);
    }

    // Adicionar evento de clique às linhas usando delegação de eventos
    function addItemClickEvent(linhas) {
        const listItemsContainer = document.querySelector('.list-items');
        listItemsContainer.addEventListener('click', (event) => {
            const itemElement = event.target;
            if (itemElement.classList.contains('item-info')) {
                const itemId = itemElement.getAttribute('data-item-id');
                const item = linhas.find(i => i.id == itemId);
                showItemDetails(item);
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

        // Determinar tipo de conteúdo
        let contentType;
        switch (item.conteudo) {
            case "Anime":
            case "Filme":
            case "Hentai":
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

        const imageUrl = await fetchImageUrl(item.nome, contentType);
        console.log("URL da imagem:", imageUrl);

        mainInfoContent.innerHTML = `
            <button id="deleteLineButton"><i class="fas fa-trash-alt"></i></button>
            <span id="close-modal-btn">&times;</span>
            <h2 id="itemNameh2" class="clickable-title">${item.nome}</h2>
            <div id="info-div-box">
                <p><strong>Conteúdo:</strong> ${item.conteudo}</p>
                <fieldset>
                    <legend style="font-weight:600;">Tags:</legend>
                    <p style="margin: 0; border: 0;">${item.tags}</p>
                </fieldset>
                <p><strong>Status:</strong> ${item.status}</p>
                <p><strong>Episódio/Capítulo:</strong> ${item.episodio}</p>
                <p><strong>Opinião:</strong> ${item.opiniao}</p>
            </div>
            <button id="editLineButton"><i class="fas fa-edit"></i></button>
        `;

        modalPhoto.innerHTML = `
            <img src="${imageUrl}" alt="${item.nome}" style="max-width: 100%; height: 400px; border-radius: 10px;">
        `;

        modalPhoto.style.height = `${mainInfoContent.offsetHeight + 0.41}px`;

        document.getElementById('deleteLineButton').addEventListener('click', () => deleteLine(item.id));
        document.getElementById('editLineButton').addEventListener('click', () => openEditModal(item));
        document.getElementById('close-modal-btn').addEventListener('click', () => modalInfo.classList.add('hidden'));
        document.querySelector('#itemNameh2').addEventListener('click', () => {
            const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(item.nome)}`;
            window.open(googleSearchUrl, '_blank');
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
        "Isekai", "MC vilão"
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

    // ---------------------------- GRÁFICOS ----------------------------
    // Inicializa os gráficos de Status e Opinião com os dados das linhas
    function initCharts(linhas) {
        createStatusChart(linhas);
        createOpinionChart(linhas);
    }

    // Cria o gráfico de Status
    function createStatusChart(linhas) {
        const statusCategories = [...new Set(linhas.map(item => item.status))];
        const counts = statusCategories.map(() => 0);
        linhas.forEach(item => {
            const index = statusCategories.indexOf(item.status);
            if (index !== -1) counts[index]++;
        });
        const ctx = document.getElementById('statusChart').getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: statusCategories,
                datasets: [{
                    data: counts,
                    backgroundColor: ["#4dc9f6", "#f67019", "#f53794", "#537bc4", "#acc236", "#166a8f", "#00a950", "#58595b"]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Status'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = counts.reduce((a, b) => a + b, 0);
                                const value = context.parsed;
                                const percentage = total ? ((value / total) * 100).toFixed(2) : 0;
                                return `${context.label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Cria o gráfico de Opinião
    function createOpinionChart(linhas) {
        const opinionCategories = [...new Set(linhas.map(item => item.opiniao))];
        const counts = opinionCategories.map(() => 0);
        linhas.forEach(item => {
            const index = opinionCategories.indexOf(item.opiniao);
            if (index !== -1) counts[index]++;
        });
        const ctx = document.getElementById('opinionChart').getContext('2d');
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: opinionCategories,
                datasets: [{
                    data: counts,
                    backgroundColor: ["#ff6384", "#36a2eb", "#ffcd56", "#4bc0c0", "#9966ff", "#c9cbcf", "#ff9f40", "#66ff66"]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Opinião'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = counts.reduce((a, b) => a + b, 0);
                                const value = context.parsed;
                                const percentage = total ? ((value / total) * 100).toFixed(2) : 0;
                                return `${context.label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ---------------------------- INICIALIZAÇÃO ----------------------------
    document.addEventListener('DOMContentLoaded', () => {
        initModalEvents();
        loadLists();
        showAllTags();
    });
})();
