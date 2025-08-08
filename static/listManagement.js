import { sidebarLists, state, listForm } from './constants.js';
import { showListDetails } from './lineManagement.js';

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

export { loadLists };