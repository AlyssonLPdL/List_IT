
import { selectedTagsContainer, state } from './constants.js';

// ---------------------------- SISTEMA DE TAGS ----------------------------
const tagCategories = {
    "Romance": [
        "Romance", "Beijo", "Namoro", "Casamento", "Noivado",
        "Romance do bom", "Fez Filho(s)", "Gravidez"
    ],
    "Ação": [
        "Ação", "Poder", "Aventura", "Overpower", "Dungeon", "Mecha", "Demônio", "Monstros"
    ],
    "Fantasia": [
        "Magia", "Fantasia", "Sobrenatural", "Deuses", "Reencarnar", "Kemonomimi", "Medieval", "Goat", "Isekai", "MC Vilão"
    ],
    "Emocional": [
        "Drama", "Tristeza", "Cringe", "Fofo"
    ],
    "Slice of Life": [
        "Slice of Life", "Vida Escolar", "Dormitorios", "Morar Juntos"
    ],
    "Tematico": [
        "Esporte", "Musical", "Terror", "Gore", "Comédia", "SciFi", "VR/Jogo", "System"
    ],
    "Gênero": [
        "Shounen", "Shoujo-ai", "Mahou Shoujo", "Yuri", "Gender bender"
    ],
    "Adulto": [
        "Ecchi", "Nudez", "Sexo", "Incesto", "NTR", "Harem", "Nudez Nippleless"
    ],
};

// Função auxiliar para obter todas as tags em um array plano
function getAllTagsFlat() {
    return Object.values(tagCategories).flat();
}

// Selecionar tag
function selectTag(tag) {
    if (!state.selectedTags.includes(tag)) {
        state.selectedTags.push(tag);
        updateSelectedTags();
    }
}

// Atualizar tags selecionadas na interface
function updateSelectedTags() {
    if (state.selectedTags.length === 0) {
        selectedTagsContainer.style.display = 'none';
    } else {
        selectedTagsContainer.style.display = 'flex';
        selectedTagsContainer.innerHTML = state.selectedTags
            .map(tag => `<span class="selected-tag">${tag}</span>`)
            .join('');
        document.querySelectorAll('.selected-tag').forEach(tagElement => {
            tagElement.addEventListener('click', () => removeTag(tagElement.textContent));
        });
    }
}

// Remover tag selecionada
function removeTag(tag) {
    state.selectedTags = state.selectedTags.filter(selectedTag => selectedTag !== tag);
    updateSelectedTags();
}

// Exibir tags agrupadas por categoria com comportamento de acordeão
function showAllTags() {
    const tagsContainer = document.querySelector('.tags-container-div');
    if (!tagsContainer) {
        console.error('Container de tags não encontrado!');
        return;
    }
    tagsContainer.innerHTML = '';
    tagsContainer.className = 'tags-container-div';
    tagsContainer.style.cssText = `
        width: 100%;
        overflow-y: auto;
        position: relative;
    `;
    
    // Criar um container para as categorias
    const categoriesContainer = document.createElement('div');
    categoriesContainer.className = 'tags-accordion-container';
    categoriesContainer.id = 'tags-accordion-container';
    categoriesContainer.style.overflow = 'auto';
    
    // Para cada categoria, criar um item do acordeão
    Object.entries(tagCategories).forEach(([categoryName, tags]) => {
        // Item do acordeão
        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item';
        accordionItem.dataset.category = categoryName;
        
        // Cabeçalho do acordeão (sempre visível)
        const accordionHeader = document.createElement('div');
        accordionHeader.className = 'accordion-header';
        accordionHeader.innerHTML = `
            <span class="accordion-category-name">${categoryName}</span>
            <span class="accordion-category-count">(${tags.length})</span>
            <i class="fas fa-chevron-down accordion-icon"></i>
        `;
        
        // Conteúdo do acordeão (inicialmente oculto)
        const accordionContent = document.createElement('div');
        accordionContent.className = 'accordion-content hidden';
        
        // Container das tags dentro do conteúdo
        const tagsGrid = document.createElement('div');
        tagsGrid.className = 'tags-grid';
        
        // Adicionar cada tag da categoria
        tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'tag';
            tagElement.textContent = tag;
            tagElement.addEventListener('click', () => {
                selectTag(tag);
                // Ao selecionar uma tag, não fechamos o acordeão
            });
            tagsGrid.appendChild(tagElement);
        });
        
        // Botão de voltar (só aparece quando o conteúdo está expandido)
        const backButton = document.createElement('div');
        backButton.className = 'accordion-back-button hidden';
        backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Voltar para categorias';
        backButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllAccordions();
            showAllCategories();
        });
        
        accordionContent.appendChild(backButton);
        accordionContent.appendChild(tagsGrid);
        
        accordionItem.appendChild(accordionHeader);
        accordionItem.appendChild(accordionContent);
        categoriesContainer.appendChild(accordionItem);
        
        // Evento para expandir a categoria
        accordionHeader.addEventListener('click', () => {
            const isCurrentlyActive = accordionItem.classList.contains('active');
            
            // Se já está ativo, não faz nada
            if (isCurrentlyActive) return;
            
            // Esconde todas as outras categorias e expande apenas esta
            expandSingleCategory(categoryName);
        });
    });
    
    tagsContainer.appendChild(categoriesContainer);
}

// Expande uma única categoria, escondendo as outras
function expandSingleCategory(categoryName) {
    const container = document.getElementById('tags-accordion-container');
    if (!container) return;
    
    const allItems = container.querySelectorAll('.accordion-item');
    
    allItems.forEach(item => {
        const isTarget = item.dataset.category === categoryName;
        
        if (isTarget) {
            // Esta é a categoria alvo - expande
            item.classList.add('active');
            item.classList.remove('hidden');
            item.querySelector('.accordion-content').classList.remove('hidden');
            item.querySelector('.accordion-header').classList.add('expanded');
            item.querySelector('.accordion-back-button').classList.remove('hidden');
            
            // Atualizar ícone
            const icon = item.querySelector('.accordion-icon');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            // Esta não é a categoria alvo - esconde completamente
            item.classList.add('hidden');
            item.classList.remove('active');
            item.querySelector('.accordion-content').classList.add('hidden');
            item.querySelector('.accordion-header').classList.remove('expanded');
        }
    });
}

// Mostra todas as categorias novamente
function showAllCategories() {
    const container = document.getElementById('tags-accordion-container');
    if (!container) return;
    
    const allItems = container.querySelectorAll('.accordion-item');
    
    allItems.forEach(item => {
        // Mostra todos os itens
        item.classList.remove('hidden');
        item.classList.remove('active');
        item.querySelector('.accordion-content').classList.add('hidden');
        item.querySelector('.accordion-header').classList.remove('expanded');
        item.querySelector('.accordion-back-button')?.classList.add('hidden');
        
        // Atualizar ícone
        const icon = item.querySelector('.accordion-icon');
        if (icon) {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    });
}

// Fechar todos os itens do acordeão
function closeAllAccordions() {
    const container = document.getElementById('tags-accordion-container');
    if (!container) return;
    
    const allItems = container.querySelectorAll('.accordion-item');
    
    allItems.forEach(item => {
        item.classList.remove('active');
        item.querySelector('.accordion-content').classList.add('hidden');
        item.querySelector('.accordion-header').classList.remove('expanded');
        item.querySelector('.accordion-back-button')?.classList.add('hidden');
        
        const icon = item.querySelector('.accordion-icon');
        if (icon) {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    });
}

// Exportar funções
export { 
    showAllTags, 
    updateSelectedTags, 
    getAllTagsFlat 
};