// ---------------------------- MODAIS ----------------------------
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
// ---------------------------- EVENTOS DE MODAL ----------------------------
// Abrir modal de criar lista
createListBtn.addEventListener('click', () => modal.classList.remove('hidden'));

// Fechar modal de criar lista
closeModal.addEventListener('click', () => modal.classList.add('hidden'));

// Fechar modal de adicionar linha
closeLineModal.addEventListener('click', () => {
    selectedTags = []; // Limpa as tags selecionadas
    updateSelectedTags(); // Atualiza a interface
    lineModal.classList.add('hidden');
});

// ---------------------------- GERENCIAMENTO DE LISTAS ----------------------------
const sidebarLists = document.querySelector('.sidebar-lists');
const mainContent = document.querySelector('.main-content');
let currentList = null;

// Buscar e exibir listas
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
let formMode = 'add'; // 'add' para adicionar, 'edit' para editar
let currentEditingId = null;

// Função para lidar com o envio do formulário
function handleFormSubmit(event) {
    event.preventDefault();
    if (formMode === 'edit') {
        updateLine(currentEditingId);
    } else {
        createNewLine();
    }
}

function getClasseExtra(item) {
    const hasClassList = item.classList && typeof item.classList.contains === 'function';
    
    // Verifica a combinação de classes
    if (item.tags.includes("Goat") &&
    (
        item.tags.includes("Beijo") &&
        item.tags.includes("Romance do bom") &&
        (item.tags.includes("Namoro") || item.tags.includes("Casamento") || item.tags.includes("Noivado"))
    )
    ) {
        return "GoAmor";
    }

    if (item.tags.includes("Goat")) {
        return "Goat";
    }

    if (
        item.status === "Cancelado"
    ) {
        return "Cancelado"
    }

    if (
        item.tags.includes("Beijo") &&
        item.tags.includes("Romance do bom") &&
        (item.tags.includes("Namoro") || item.tags.includes("Casamento") || item.tags.includes("Noivado"))
    ) {
        return "Amor";
    }

    if (
        item.tags.includes("Ecchi") &&      // Deve ter a tag "Ecchi"
        (item.tags.includes("Nudez") || item.tags.includes("Nudez Nippleless")) &&      // Deve ter a tag "Nudez"
        (
            item.tags.includes("Incesto") ||    // Ou uma das tags adicionais
            item.tags.includes("Sexo") ||
            item.tags.includes("Yuri") ||
            item.tags.includes("Vida Escolar") ||
            item.tags.includes("Dormitorios") ||
            (item.opiniao === "Mediano" || 
                item.opiniao === "Ruim" || 
                item.opiniao === "Horrivel") // Opinião obrigatória
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
        return "Pika"
    }
    
    return "";
}

// Configurar o evento de submissão do formulário de linha
const lineForm = document.getElementById('line-form');
lineForm.removeEventListener('submit', handleFormSubmit); // Remove evento anterior, se existir
lineForm.addEventListener('submit', handleFormSubmit);

// Exibir detalhes da lista
async function showListDetails(lista) {
    currentList = lista;

    const response = await fetch(`/linhas/${lista.id}`);
    const linhas = await response.json();

    // Função para extrair nome base e número romano (se houver)
    function extractBaseAndNumber(nome) {
        const romanRegex = /\b(?:I{1,3}|IV|V?I{0,3}|IX|X{0,3})\b/; // Captura números romanos corretamente
        const match = nome.match(romanRegex);

        let numeroRomano = match ? match[0] : null; // Guarda o número romano se existir
        let nomeBase = nome.replace(romanRegex, '').trim(); // Remove o número romano do nome base

        return { nomeBase, numeroRomano };
    }

    // Converte número romano para número decimal
    function romanToDecimal(roman) {
        if (!roman) return -1; // Sem número romano vem primeiro
        const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
        return romanMap[roman] || 99; // Se não encontrar, assume 99 (evita erro)
    }

    // Ordena a lista corretamente
    linhas.sort((a, b) => {
        const aInfo = extractBaseAndNumber(a.nome);
        const bInfo = extractBaseAndNumber(b.nome);

        // 1️⃣ Ordenação alfabética pelo nome base
        const baseCompare = aInfo.nomeBase.localeCompare(bInfo.nomeBase);
        if (baseCompare !== 0) return baseCompare;

        // 2️⃣ Se os nomes base forem iguais, ordena pelo número romano (sem número vem primeiro)
        const aNumero = romanToDecimal(aInfo.numeroRomano);
        const bNumero = romanToDecimal(bInfo.numeroRomano);

        return aNumero - bNumero;
    });

    mainContent.innerHTML = `
        <h1>${lista.nome}</h1>
        <input type="text" id="filter-input" placeholder="Filtrar por Status, Tags ou Opinião...">
        <button id="add-line-btn">+ Adicionar Linha</button>
        <div class="container-list-items">
            <div class="list-items">
                ${linhas.map(item => `
                    <div class="item-info ${item.opiniao} ${getClasseExtra(item)}" data-item-id="${item.id}">
                        ${item.nome}
                    </div>
                `).join('')}
            </div>    
        </div>
    `;

    document.getElementById('add-line-btn').addEventListener('click', () => {
        formMode = 'add'; // Define o modo como 'adicionar'
        lineForm.reset(); // Reseta o formulário
        selectedTags = []; // Limpa as tags selecionadas
        updateSelectedTags(); // Atualiza a interface
        lineModal.classList.remove('hidden');
        const resizeObserver = new ResizeObserver(() => {
            // Ajusta a altura de tagsContainerId sempre que mainInfoContentId mudar de tamanho
            tagsContainerId.style.height = `${mainInfoContentId.offsetHeight - 40}px`;
        });
        
        // Inicia a observação do elemento
        resizeObserver.observe(mainInfoContentId);
    });

    const filterInput = document.getElementById('filter-input');
    filterInput.addEventListener('input', () => filterItems(linhas));

    addItemClickEvent(linhas);
}

// Função para filtrar os itens com base no filtro
function filterItems(linhas) {
    const filterValue = document.getElementById('filter-input').value.toLowerCase().trim();

    if (!filterValue) {
        showItems(linhas);
        return;
    }

    const filters = filterValue.split('+').map(f => f.trim());

    const filteredLinhas = linhas.filter(item => {
        const tags = item.tags ? item.tags.split(',').map(tag => tag.trim().toLowerCase()) : [];
        return filters.every(filter => 
            tags.some(tag => tag.includes(filter)) ||
            item.status.toLowerCase().includes(filter) ||
            item.opiniao.toLowerCase().includes(filter) ||
            item.nome.toLowerCase().includes(filter)
        );
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
    `).join('')

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

// ✅ Função para buscar imagem
async function fetchImageUrl(query, contentType) {
    const apiUrl = `/search_image?q=${encodeURIComponent(query)}&type=${encodeURIComponent(contentType)}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.image_url) {
            return data.image_url; // Retorna a URL da imagem
        } else {
            return "https://via.placeholder.com/150"; // Imagem padrão
        }
    } catch (error) {
        console.error("Erro ao buscar imagem:", error);
        return "https://via.placeholder.com/150"; // Imagem padrão em caso de erro
    }
}

function displayImage(imageUrl) {
    const imgElement = document.createElement('img');
    imgElement.src = imageUrl;
    imgElement.alt = 'Imagem do conteúdo';
    document.getElementById('image-container').appendChild(imgElement); // Coloca a imagem no container
}

// Exibir detalhes de uma linha
async function showItemDetails(item) {
    modalInfo.classList.remove('hidden');

    // Determinar se é anime ou mangá
    let contentType; // Padrão é anime
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

    // Buscar imagem do item
    const imageUrl = await fetchImageUrl(item.nome, contentType);
    console.log("URL da imagem:", imageUrl);  // Verifique a URL aqui

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
    const resizeObserver = new ResizeObserver(() => {
        // Ajusta a altura de tagsContainerId sempre que mainInfoContentId mudar de tamanho
        tagsContainerId.style.height = `${mainInfoContentId.offsetHeight - 40}px`;
    });
    
    // Inicia a observação do elemento
    resizeObserver.observe(mainInfoContentId);
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatedItem),
        });

        const result = await response.json();
        console.log(result);
        alert(result.message || 'Erro ao editar a linha.');

        // Recarregar as linhas da lista atual com a linha editada
        const updatedLinesResponse = await fetch(`/linhas/${currentList.id}`);
        const updatedLines = await updatedLinesResponse.json();
        updatedLines.sort((a, b) => a.nome.localeCompare(b.nome));
        showItems(updatedLines);

        // Resetar o formulário e o modo
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
        showListDetails(currentList); // Atualiza a lista após adicionar a linha
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
const tagSearch = document.getElementById('tag-search');
const suggestionsContainer = document.getElementById('suggestions');
const selectedTagsContainer = document.getElementById('selected-tags');

// Tags relacionadas a romance
const romanceTags = [
    "Romance", "Beijo", "Namoro", "Casamento", "Morar Juntos", "Noivado", 
    "Romance do bom", "Fez Filho(s)", "Gravidez"
];

// Tags relacionadas a ação e aventura
const actionAdventureTags = [
    "Ação", "Poder", "Aventura", "Overpower", "Dungeon", "Mecha", "Demônio", "Monstros"
];

// Tags relacionadas a fantasia e sobrenatural
const fantasySupernaturalTags = [
    "Magia", "Fantasia", "Sobrenatural", "Deuses", "Reencarnar", "Medieval"
];

// Tags relacionadas a drama e emoção
const dramaEmotionalTags = [
    "Drama", "Tristeza", "Cringe"
];

// Tags relacionadas a ficção científica e tecnologia
const sciFiTechTags = [
    "SciFi", "VR/Jogo"
];

// Tags relacionadas a vida cotidiana
const sliceOfLifeTags = [
    "Slice of Life", "Vida Escolar", "Dormitorios"
];

// Tags relacionadas a comédia e diversão
const comedyTags = [
    "Comédia", "Fofo"
];

// Tags relacionadas a terror e suspense
const horrorTags = [
    "Terror", "Gore"
];

// Tags relacionadas a esportes e música
const sportsMusicTags = [
    "Esporte", "Musical"
];

// Tags relacionadas a gêneros e mudanças de gênero
const genderTags = [
    "Shounen", "Shoujo-ai", "Mahou Shoujo", "Yuri", "Gender bender"
];

// Tags relacionadas a temas adultos e polêmicos
const adultControversialTags = [
    "Ecchi", "Nudez", "Sexo", "Incesto", "NTR", "Harem", "Nudez Nippleless"
];

// Tags relacionadas a mundos paralelos e reencarnação
const isekaiTags = [
    "Isekai", "MC vilão"
];

// Tags relacionadas a personagens específicos
const characterTags = [
    "Kemonomimi", "Goat"
];

// Junta todas as tags organizadas em uma única lista
const allTags = [
    ...romanceTags, ...actionAdventureTags, ...fantasySupernaturalTags, 
    ...dramaEmotionalTags, ...sciFiTechTags, ...sliceOfLifeTags, 
    ...comedyTags, ...horrorTags, ...sportsMusicTags, 
    ...genderTags, ...adultControversialTags, ...isekaiTags, 
    ...characterTags
];

let selectedTags = [];

// Função para selecionar tags
function selectTag(tag) {
    if (!selectedTags.includes(tag)) {
        selectedTags.push(tag);
        updateSelectedTags();
    }
}

// Função para atualizar as tags selecionadas na interface
function updateSelectedTags() {
    if (selectedTags.length === 0) {
        selectedTagsContainer.style.display = 'none';
    } else {
        selectedTagsContainer.style.display = 'flex';
        selectedTagsContainer.innerHTML = selectedTags
            .map(tag => `<span class="selected-tag">${tag}</span>`)
            .join('');

        // Adiciona evento de clique para remover a tag
        document.querySelectorAll('.selected-tag').forEach(tagElement => {
            tagElement.addEventListener('click', () => removeTag(tagElement.textContent));
        });
    }
}

// Função para remover uma tag
function removeTag(tag) {
    selectedTags = selectedTags.filter(selectedTag => selectedTag !== tag);
    updateSelectedTags();
}

// ---------------------------- EXIBIÇÃO DE TAGS -------------------------

// Função para exibir todas as tags no container
function showAllTags() {
    const tagsContainer = document.querySelector('.tags-container-div');
    tagsContainer.innerHTML = ''; // Limpa o conteúdo anterior

    // Ordena as tags
    const sortedTags = allTags.sort();

    
    // Cria um elemento para cada tag
    sortedTags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.classList.add('tag');
        tagElement.textContent = tag;
        tagsContainer.appendChild(tagElement);
        tagElement.addEventListener('click', () => selectTag(tag));
    });
}

// ---------------------------- Animação ---------------------------------


// ---------------------------- INICIALIZAÇÃO ----------------------------
document.addEventListener('DOMContentLoaded', () => {
    loadLists();
    showAllTags();
});