import { selectedTagsContainer, state } from './constants.js';

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

export { showAllTags, updateSelectedTags };