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
            sidebarLists.appendChild(listItem); // Adiciona o item a sidebar
        });
    } catch (error) {
        console.error('Erro:', error);
        sidebarLists.innerHTML = '<p>Erro ao carregar as listas.</p>';
    }
}

// Chamando a função para carregas as listas ao carregar a pagina
document.addEventListener('DOMContentLoaded', loadLists);