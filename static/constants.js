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
const sequenceModal = document.getElementById('modal-sequence');

// Listas
const sidebarLists = document.querySelector('.sidebar-lists');
const mainContent = document.querySelector('.main-content');

// Linhas
const lineForm = document.getElementById('line-form');

// Tags
const selectedTagsContainer = document.getElementById('selected-tags');

// Variáveis globais
export const state = {
    currentList: null,
    formMode: 'add',
    currentEditingId: null,
    selectedTags: [],
    allIds: [],
    currentIdx: 0,
    currentNavList: []
};

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');

// Exportar constantes para uso em outros arquivos
export {
    modal, createListBtn, closeModal, listForm, lineModal, closeLineModal,
    modalInfo, modalPhoto, mainInfoContent, mainInfoContentId, tagsContainerId,
    sequenceModal, sidebarLists, mainContent, lineForm, selectedTagsContainer,
    themeToggle
};