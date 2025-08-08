// ---------------------------- UTILS ----------------------------
import {
    mainInfoContentId, tagsContainerId, themeToggle
} from './constants.js';

import { showItems } from './lineManagement.js';

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

// Verificar preferência de tema ao carregar a página
function initTheme() {
    if (localStorage.getItem('darkTheme') === 'true') {
        document.body.classList.add('dark-theme');
        themeToggle.checked = true;
    }

    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('darkTheme', isDark);
    });
}

function applyFilter(linhas) {
    const showPutariaManhwa = document.getElementById('toggle-censure').checked;
    const filteredLinhas = linhas.filter(item => {
        const isPutaria = getClasseExtra(item) === "Putaria";
        const isManhwa = item.conteudo === "Manhwa";
        return showPutariaManhwa || !(isPutaria && isManhwa);
    });
    showItems(filteredLinhas);
}

function getEpisodeLabel(contentType) {
    const ct = contentType.toLowerCase();
    if (ct === 'filme') return 'Filmes';
    if (['manga', 'manhwa', 'webtoon'].includes(ct)) return 'Capítulos';
    return 'Episódio';
}

function getClasseExtra(item) {
    if (item.tags.includes("Goat") &&
        (item.tags.includes("Beijo") &&
            item.tags.includes("Romance do bom") &&
            (item.tags.includes("Namoro") || item.tags.includes("Casamento") || item.tags.includes("Noivado"))
        )
    ) {
        return "BestLove";
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
        return "Love";
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
        // Retorna a classe "Putaria"
        const classe = "Putaria";

        // Verifica se é um Manwha
        if (item.conteudo === "Manhwa") {
            // Aguarda o DOM renderizar o elemento antes de aplicar o blur
            setTimeout(() => {
                const imageElement = document.querySelector(`.item-info[data-item-id="${item.id}"] .item-image img`);
                if (imageElement) {
                    imageElement.style.filter = "blur(5px)";
                }
            }, 0); // Executa após o próximo ciclo de renderização
        }

        return classe;
    }

    if (
        item.tags.includes("Ação") &&
        (
            (
                (item.opiniao === "Recomendo" || item.opiniao === "Muito Bom" || item.opiniao === "Bom" || item.opiniao === "Favorito") &&
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

function getStatusIcon(status) {
    switch (status.toLowerCase()) {
        case 'concluido':
            return '<i class="icon-concluido fas fa-check" title="Concluído"></i>';
        case 'assistir':
            return '<i class="icon-assistir fas fa-bookmark" title="Ver"></i>';
        case 'ler':
            return '<i class="icon-ler fas fa-bookmark" title="Ler"></i>';
        case 'vendo':
            return '<i class="icon-vendo fas fa-eye" title="Vendo"></i>';
        case 'lendo':
            return '<i class="icon-lendo fas fa-eye" title="Lendo"></i>';
        case 'dropado':
            return '<i class="icon-dropado fas fa-eye-slash" title="Dropado"></i>';
        case 'cancelado':
            return '<i class="icon-cancelado fas fa-ghost" title="Cancelado"></i>';
        case 'conheço':
            return '<i class="icon-conheco fas fa-question" title="Conheço"></i>';
        default:
            return ''; // vazio se não corresponder a nenhum
    }

}
function getOpiniaoIcon(opiniao) {
    const opiniaoFormatada = opiniao.toLowerCase();
    switch (opiniaoFormatada) {
        case 'favorito':
            return '<i class="opiniao-favorito fas fa-star" title="Favorito" style="color:#ffe200;"></i>';
        case 'muito bom':
            return '<i class="opiniao-muito-bom fas fa-face-laugh-beam" title="Muito Bom" style="color:#f1c40f;"></i>';
        case 'recomendo':
            return '<i class="opiniao-recomendo fas fa-thumbs-up" title="Recomendo" style="color:#2ecc71;"></i>';
        case 'bom':
            return '<i class="opiniao-bom fas fa-smile" title="Bom" style="color:#27ae60;"></i>';
        case 'mediano':
            return '<i class="opiniao-mediano fas fa-meh" title="Mediano" style="color:#f39c12;"></i>';
        case 'ruim':
            return '<i class="opiniao-ruim fas fa-frown" title="Ruim" style="color:#e67e22;"></i>';
        case 'horrivel':
            return '<i class="opiniao-horrivel fas fa-skull-crossbones" title="Horrível" style="color:#c0392b;"></i>';
        case 'não vi':
            return '<i class="opiniao-nao-vi fas fa-question-circle" title="Não vi" style="color:#95a5a6;"></i>';
        default:
            return '';
    }
}



// Exportar funções utilitárias
export {
    extractBaseAndNumber, romanToDecimal, initResizeObserver, initTheme,
    applyFilter, getEpisodeLabel, getClasseExtra, getStatusIcon, getOpiniaoIcon
};