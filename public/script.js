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

// Const dos Lines
const mainContent = document.querySelector('.main-content');

const lineModal = document.getElementById('line-modal');
const closeLineModal = document.getElementById('close-line,modal');
const lineForm = document.getElementById('line-form');

let currentList = null;

// Mostrar detalhes da lista no main content
function showListDetails(list) {
    currentList = list;
    mainContent.innetHTML = `
        <h1>${list.name}</h1>
        <button id="add-line-btn">+ Adicionar Linha</button>
        <div class="list-items">
            ${list.items.map(item => `<div>${item.name}</div>`).join('')}
        </div>
    `;

    document.getElementById('add-line-btn').addEventListener('click', () => {
        lineModal.classList.remove('hidden');
    });
}

// Fechar modal de adicionar linha
closeLineModal.getElementById('click', () => {
    linemModal.classList.add('hidden');
});

// Submeter formulario de adicionar linha
lineForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const lineName = document.getElementById('line-name').value;
    const tags = [...document.querySelectorAll('input[type="checkbox"]:checked')].map(tag => tag.value);
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
    };

    currentList.items.push(newLine)

    try {
        const response = await fetch('/save-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentList),
        });

        const result = await response.json();
        if (response.ok) {
            lineModal.classList.add('hidden');
            lineForm.reset();
            showListDetails(currentList);
        } else {
            alert('Erro ao salvar linha');
        }
    } catch (error) {
        console.error('Erro:', error)
    }
});

// Chamando a função para carregas as listas ao carregar a pagina
document.addEventListener('DOMContentLoaded', loadLists);