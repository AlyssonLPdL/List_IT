import { getClasseExtra } from './utils.js';
import { showItemDetails } from './lineManagement.js';

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

export { showHighlights };