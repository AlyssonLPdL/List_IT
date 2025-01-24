const modal = document.getElementById('modal');
const createListBtn = document.getElementById('create-list-btn');
const closeModal = document.getElementById('close-modal');
const listForm = document.getElementById('list-form');

// Fbrir o modal
createListBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
});

// Fechar o modal
closeModal.addEventListener('click', () => {
    modal.classList.add('hidden');
});

// Submeter o formulario
listForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evitar o recarregar da pagina

    // Obter os valores do formulario
    const listName = document.getElementById('list-name').value;
    const listDescription = document.getElementById('list-description').value;

    // Criar o objeto da lista
    const newList = {
        name: listName,
        description: listDescription,
        createdAt: new Date().toISOString(),
        items: [],
    };

    try {
        // envia os dados para o backend
        const response = await fetch('/save-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newList),
        });

        const result = await response.json();

        if (response.ok) {
            alert(result.message);
            listForm.reset(); // Limpa o formulario
            modal.classList.add('hidden');
            loadLists();
        } else {
            alert('erro ao salvar a lista: ' + result.message);
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao conectar ao servidor.');
    }
});

// Seleção do container onde as listas serão exibidas
const sidebarLists = document.querySelector('.sidebar-lists');

// Função para buscar e exibir as listas
async function loadLists() {
    try {
        const response = await fetch('/lists'); // Faz uma requisição GET para o backend
        if (!response.ok) {
            throw new Error('Erro ao carregar as listas');
        }

        const lists = await response.json(); // Converte o JSON recebido em um awway

        // Atualiza o sidebar com os nomes das listas
        sidebarLists.innerHTML = '';
        lists.forEach((list) => {
            const listItem = document.createElement('div');
            listItem.className = 'list-item'
            listItem.textContent = list.name; // Mostra apenas o nome da lista
            listItem.addEventListener('click', () => showListDetails(list));
            sidebarLists.appendChild(listItem); // Adiciona o item a sidebar
        });
    } catch (error) {
        console.error('Erro:', error);
        sidebarLists.innerHTML = '<p>Erro ao carregar as listas.</p>';
    }
}

// ------------------------- LINHAS ----------------------------

// Const dos Lines
const mainContent = document.querySelector('.main-content');
const lineModal = document.getElementById('line-modal');
const closeLineModal = document.getElementById('close-line-modal');
const lineForm = document.getElementById('line-form');
const modalInfo = document.getElementById('info-modal');
const mainInfoContent = modalInfo.querySelector('.modal-content'); // Definindo o conteúdo do modal

let currentList = null;

// Mostrar detalhes da lista no main content
function showListDetails(list) {
    currentList = list;
    mainContent.innerHTML = `
        <h1>${list.name}</h1>
        <button id="add-line-btn">+ Adicionar Linha</button>
        <input type="text" id="search-input" placeholder="Pesquisar..." />
        <div class="list-items">
            ${list.items.map(item => 
                `<div class="item-info" data-item-id="${item.name}">
                    ${item.name}
                </div>`
            ).join('')}
        </div>
    `;

    // Função para filtrar os itens da lista
    document.getElementById('search-input').addEventListener('input', filterItems);

    function filterItems(event) {
        const query = event.target.value.toLowerCase(); // Obtém o texto digitado pelo usuário e converte para minúsculas

        // Filtra os itens da lista conforme o texto digitado
        const filteredItems = list.items.filter(item => {
            return (
                item.content.toLowerCase().includes(query) ||
                item.status.toLowerCase().includes(query) ||
                item.opinion.toLowerCase().includes(query) ||
                item.tags.some(tag => tag.toLowerCase().includes(query))
            );
        });

        // Atualiza a exibição com os itens filtrados
        updateItemsDisplay(filteredItems);
    };

    function updateItemsDisplay(items) {
        const itemsContainer = document.querySelector('.list-items');
        itemsContainer.innerHTML = items.length > 0
            ? items.map(item => `<div class="item-info" data-item-id="${item.name}">${item.name}</div>`).join('')
            : '<p>Nenhum item encontrado.';

        // Garantir que o evento de clique seja adicionado aos itens renderizados
        document.querySelectorAll('.item-info').forEach(itemElement => {
            itemElement.addEventListener('click', () => {
                const itemName = itemElement.getAttribute('data-item-id');
                const item = list.items.find(i => i.name === itemName);
                showItemDetails(item);
            });
        });
    };

    document.getElementById('add-line-btn').addEventListener('click', () => {
        lineModal.classList.remove('hidden');
    });
};

// Função para exibir os detalhes do item no modal
function showItemDetails(item) {
    modalInfo.classList.remove('hidden'); // Exibe o modal

    // Preenche os dados do item no modal
    mainInfoContent.innerHTML = `
        <h2>${item.name}</h2>
        <p><strong>Conteúdo:</strong> ${item.content}</p>
        <p><strong>Status:</strong> ${item.status}</p>
        <p><strong>Episódio/Capítulo:</strong> ${item.episode}</p>
        <p><strong>Opinião:</strong> ${item.opinion}</p>
        <p><strong>Tags:</strong> ${item.tags.join(', ')}</p>
        <button type="button" id="close-modal-btn">&times;</button>
    `;

    // Fechar modal de item
    const closeModalInfo = document.getElementById('close-modal-btn');
    closeModalInfo.addEventListener('click', () => {
        modalInfo.classList.add('hidden');
    });
};

// Fechar modal de adicionar linha
closeLineModal.addEventListener('click', () => {
    lineModal.classList.add('hidden');
});


// ------------------------ Sistema de tags ----------------------------

const tagSearch = document.getElementById('tag-search');
const suggestionsContainer = document.getElementById('suggestions');
const selectedTagsContainer = document.getElementById('selected-tags');

const allTags = ["Romance",
                "Terror",
                "Ação",
                "Magia",
                "Gore",
                "SciFi",
                "Romance do bom",
                "Isekai",
                "Ecchi"]; // Suas tags possíveis

let selectedTags = [];

tagSearch.addEventListener('input', () => {
    const query = tagSearch.value.toLowerCase();
    suggestionsContainer.innerHTML = ''; // Limpar sugestões anteriores

    if (query) {
        const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(query));
        
        filteredTags.forEach(tag => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.textContent = tag;
            suggestionDiv.addEventListener('click', () => selectTag(tag));
            suggestionsContainer.appendChild(suggestionDiv);
        });

        suggestionsContainer.style.display = 'block'; // Mostrar sugestões
    } else {
        suggestionsContainer.style.display = 'none'; // Esconder sugestões
    }
});

function selectTag(tag) {
    if (!selectedTags.includes(tag)) {
        selectedTags.push(tag);
        updateSelectedTags();
    }

    tagSearch.value = ''; // Limpa a pesquisa
    suggestionsContainer.style.display = 'none'; // Esconde sugestões
}

function updateSelectedTags() {
    selectedTagsContainer.innerHTML = ''; // Limpa os tags selecionados

    selectedTags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.textContent = tag;
        tagElement.addEventListener('click', () => removeTag(tag));
        selectedTagsContainer.appendChild(tagElement);
    });
}

function removeTag(tag) {
    selectedTags = selectedTags.filter(t => t !== tag);
    updateSelectedTags();
}

// -------------------------------- Formulario de linha---------------------------

// Submeter formulario de adicionar linha
lineForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const lineName = document.getElementById('line-name').value;
    const tags = selectedTags;
    const content = document.getElementById('line-content').value;
    const status = document.getElementById('line-status').value;
    const episode = document.getElementById('line-episode').value;
    const opinion = document.getElementById('line-opinion').value;

    const newLine = {
        name: lineName,
        tags: tags,
        content: content,
        status: status,
        episode: episode,
        opinion: opinion,
        listName: currentList.name
    };

    try {
        const response = await fetch('/add-line', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newLine),
        });

        const result = await response.json();
        if (response.ok) {
            lineForm.reset();
            selectedTags = [];
            updateSelectedTags();
            currentList.items.push(newLine);
            lineModal.classList.add('hidden');
            showListDetails(currentList);
        } else {
            alert('Erro ao salvar linha');
        }
    } catch (error) {
        console.error('Erro:', error)
    }
});

// ------------------------- Modal info -----------------------------


// Chamando a função para carregas as listas ao carregar a pagina
document.addEventListener('DOMContentLoaded', loadLists);