import { refreshSequenceDisplay } from './sequenceManagement.js';
import { bindSinopseButton } from './lineManagement.js';
import { getEpisodeLabel } from './utils.js';

// ---------------------------- FUNÇÕES DE EXPORTAÇÃO COM HTML-TO-IMAGE ----------------------------
async function exportItemAsImage(item) {
    const loader = document.getElementById('imageCreatorLoader');
    if (loader) loader.style.display = 'flex';
    try {
        let exportCard = document.getElementById('export-card');

        // Se não existir, cria o elemento
        if (!exportCard) {
            exportCard = document.createElement('div');
            exportCard.id = 'export-card';
            document.body.appendChild(exportCard);
        }

        // Configurar o card de exportação
        exportCard.style.position = 'fixed';
        exportCard.style.left = '0';
        exportCard.style.top = '0';
        exportCard.style.width = '420px';
        exportCard.style.height = '490px';
        exportCard.style.zIndex = '99999';
        exportCard.style.transform = 'translateX(-200vw) translateY(0)'; 
        exportCard.style.opacity = '1';
        exportCard.style.visibility = 'visible';
        exportCard.style.background = 'transparent';
        exportCard.style.pointerEvents = '';

        // Gerar o template
        exportCard.innerHTML = generateTemplateHTML(item);

        // Esperar um pouco para o DOM atualizar
        await new Promise(resolve => setTimeout(resolve, 500));

        // Aguardar carregamento das imagens
        await waitForImages(exportCard, 7000);

        // USANDO HTML-TO-IMAGE - CORREÇÃO: Verificar se a biblioteca está disponível
        if (typeof htmlToImage === 'undefined') {
            throw new Error('Biblioteca html-to-image não carregada');
        }

        const dataUrl = await htmlToImage.toPng(exportCard, {
            width: 420,
            height: 490,
            style: {
                transform: 'none',
                margin: '0',
                padding: '0'
            },
            quality: 1.0,
            pixelRatio: 2,
            skipAutoScale: false,
            backgroundColor: 'transparent',
            cacheBust: true,
            filter: (node) => {
                if (node.classList && node.classList.contains('template-preview-modal')) {
                    return false;
                }
                return true;
            }
        });

        // Download da imagem
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${item.nome.replace(/\s+/g, '_')}_card.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        refreshSequenceDisplay();
        bindSinopseButton(item);

    } catch (error) {
        console.error('Erro na exportação com html-to-image:', error);
        alert('Erro ao exportar imagem: ' + error.message);
    } finally {
        // Restaurar estado do card
        const exportCard = document.getElementById('export-card');
        if (exportCard) {
            exportCard.style.opacity = '0';
            exportCard.style.position = '';
            exportCard.style.zIndex = '';
            exportCard.style.left = '';
            exportCard.style.top = '';
            exportCard.style.background = '';
        }

        if (loader) loader.style.display = 'none';
    }
}

// Função auxiliar para aguardar carregamento de imagens
function waitForImages(container, timeout = 7000) {
    const images = Array.from(container.querySelectorAll('img'));
    const promises = images.map(img => {
        // força carregamento se src existe
        if (!img.src) return Promise.resolve();

        // se já carregou ok
        if (img.complete && img.naturalWidth && img.naturalWidth > 1) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            let resolved = false;
            const onDone = () => { if (!resolved) { resolved = true; resolve(); } };
            img.addEventListener('load', onDone);
            img.addEventListener('error', () => {
                console.warn('Erro ao carregar imagem (waitForImages):', img.src);
                // fallback para capa, se for o caso
                if (img.alt === 'Capa' || img.classList.contains('cover-image')) {
                    img.src = 'https://via.placeholder.com/180x250/667eea/ffffff?text=Capa+Não+Disponível';
                }
                onDone();
            });

            // Caso timeout
            setTimeout(onDone, timeout);
        });
    });

    return Promise.all(promises);
}

function smartTagOrganization(tags, containerWidth, maxRows = 7) {
    // Objective:
    // - Do NOT resize or shrink spans. Use measured widths exactly.
    // - Place as MANY tags as possible into up to maxRows rows.
    // - Sort tags from smallest to largest before packing (menor para maior).
    // - For each row, select a subset of the remaining tags that fits into containerWidth
    //   and maximizes the number of tags in that row (tie-breaker: maximize used width).
    // Implementation: per-row 0/1 knapsack DP maximizing count, then used width.
    if (!Array.isArray(tags) || tags.length === 0) return [];

    // measure text widths consistent with .tag-bubble style
    const measureWidth = (() => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = "bold 11px Arial";
        return (tag) => {
            const textWidth = Math.ceil(ctx.measureText(tag).width);
            // padding-left/right = 3px each (as in your CSS), border 1px each side
            const bubbleWidth = textWidth + 3 + 3 + 1 + 1;
            return Math.min(bubbleWidth, containerWidth);
        };
    })();

    // prepare items sorted ascending (menor para maior)
    const items = tags.map(t => ({ text: t, width: Math.ceil(measureWidth(t)) }))
        .sort((a, b) => a.width - b.width);

    const rows = [];
    let remaining = items.slice(); // shallow copy of remaining items

    for (let r = 0; r < maxRows && remaining.length > 0; r++) {
        const C = Math.floor(containerWidth);

        // DP arrays: dpCount[c] = max number of items achievable with capacity c
        // dpUsed[c] = used width for that solution (for tie-break)
        const dpCount = new Int32Array(C + 1);
        const dpUsed = new Int32Array(C + 1);
        // parent pointer (store index of item used and previous capacity)
        const parent = Array.from({ length: C + 1 }, () => null);

        // We need item indices for backtracking, so iterate items with their indices
        for (let idx = 0; idx < remaining.length; idx++) {
            const w = Math.min(Math.floor(remaining[idx].width), C);
            if (w <= 0) continue;
            // iterate capacities backwards
            for (let cap = C; cap >= w; cap--) {
                const prevCap = cap - w;
                const candidateCount = dpCount[prevCap] + 1;
                const candidateUsed = dpUsed[prevCap] + w;
                if (candidateCount > dpCount[cap] ||
                    (candidateCount === dpCount[cap] && candidateUsed > dpUsed[cap])) {
                    dpCount[cap] = candidateCount;
                    dpUsed[cap] = candidateUsed;
                    parent[cap] = { prev: prevCap, idx: idx };
                }
            }
        }

        // find best capacity (max count, then max used)
        let bestCap = 0;
        for (let cap = 0; cap <= C; cap++) {
            if (dpCount[cap] > dpCount[bestCap] ||
                (dpCount[cap] === dpCount[bestCap] && dpUsed[cap] > dpUsed[bestCap])) {
                bestCap = cap;
            }
        }

        // if no items fit (best count 0), try to fit the smallest single item (defensive)
        if (dpCount[bestCap] === 0) {
            // if the smallest remaining item fits individually, place it; otherwise stop
            const single = remaining.find(it => it.width <= C);
            if (!single) break;
            const chosen = [single];
            // remove chosen from remaining
            const chosenText = new Set(chosen.map(x => x.text));
            remaining = remaining.filter(it => !chosenText.has(it.text) || chosenText.delete(it.text) && false === false);
            rows.push(chosen);
            continue;
        }

        // backtrack to get chosen items for this row
        const chosenIndices = new Set();
        let cur = bestCap;
        while (cur > 0 && parent[cur]) {
            const entry = parent[cur];
            chosenIndices.add(entry.idx);
            cur = entry.prev;
        }

        // Build chosen array in original order (smaller to larger)
        const chosen = [];
        for (let i = 0; i < remaining.length; i++) {
            if (chosenIndices.has(i)) {
                chosen.push(remaining[i]);
            }
        }

        // remove chosen items from remaining (by matching object identity via text & width)
        const chosenSet = new Set(chosen.map(x => x.text + "||" + x.width));
        remaining = remaining.filter(it => !chosenSet.has(it.text + "||" + it.width));

        rows.push(chosen);
    }

    // rows is array of arrays of {text,width}
    return rows;
}


// Função para gerar o template HTML - OTIMIZADA PARA HTML-TO-IMAGE
function generateTemplateHTML(item) {
    const tagsArray = item.tags ? item.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

    // Organizar tags de forma inteligente no espaço disponível
    const containerWidth = 145;
    const organizedTags = smartTagOrganization(tagsArray, containerWidth, 7);

    const tagsHTML = organizedTags.map(row => `
        <div style="display: flex; flex-wrap: nowrap;">
            ${row.map(t => `<span class="tag-bubble" style="width:${t.width}px; display:inline-block;">${t.text}</span>`).join('')}
        </div>
    `).join('');


    const backgroundUrl = '/static/img/cardTemplate.png';
    const coverUrl = item.imagem_url
        ? '/proxy_image?url=' + encodeURIComponent(item.imagem_url)
        : 'https://via.placeholder.com/180x250/667eea/ffffff?text=Sem+Capa';

    return `
        <div class="template-container" style="width: 420px; height: 490px; position: relative; font-family: Arial, sans-serif; background: transparent; overflow: hidden;">
            <!-- Imagem de fundo -->
            <img src="${backgroundUrl}" 
                 style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1;" 
                 alt="Background" 
                 crossorigin="anonymous">
            
            <!-- Imagem da capa -->
            <div style="position: absolute; top: 24px; left: 242px; width: 171px; height: 216px; border-radius: 5px; overflow: hidden; box-shadow: 0 3px 10px rgba(0,0,0,0.2); z-index: 2;">
                <img src="${coverUrl}" 
                     alt="Capa" 
                     style="width: 100%; height: 100%; object-fit: inherit;"
                     crossorigin="anonymous">
            </div>
            
            <!-- Nome -->
            <div style="position: absolute; top: 360px; left: 5px; width: 220px; height: 105px; z-index: 2; display: flex; align-items: center; justify-content: center; text-align: center; background: transparent;">
                <div style="font-size: 16px; color: #3d3d3d; line-height: 1.1; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; word-wrap: break-word; overflow: hidden; text-overflow: ellipsis; padding: 2px;">
                    ${item.nome}
                </div>
            </div>
            
            <!-- Tipo de conteúdo -->
            <div style="position: absolute; top: 280px; left: 225px; width: 150px; height: 20px; z-index: 2; font-size: 11px; color: #3d3d3d; line-height: 1.2; display: flex; align-items: center; background: transparent;">
                Tipo: ${item.conteudo}
            </div>
            
            <!-- Status -->
            <div style="position: absolute; top: 300px; left: 315px; width: 150px; height: 20px; z-index: 2; font-size: 11px; color: #3d3d3d; line-height: 1.2; display: flex; align-items: center; background: transparent;">
                Status: ${item.status}
            </div>
            
            <!-- Opinião -->
            <div style="position: absolute; top: 300px; left: 225px; width: 150px; height: 20px; z-index: 2; font-size: 11px; color: #3d3d3d; line-height: 1.2; display: flex; align-items: center; background: transparent;">
                Nota: ${item.opiniao}
            </div>
            
            <!-- Episódio -->
            <div style="position: absolute; top: 280px; left: 315px; width: 150px; height: 20px; z-index: 2; font-size: 11px; color: #3d3d3d; line-height: 1.2; display: flex; align-items: center; background: transparent;">
                ${getEpisodeLabel(item.conteudo)}: ${item.episodio}
            </div>
            
            <!-- Tags -->
            <div style="position: absolute; top: 60px; left: 10px; color: #3d3d3d; z-index: 2;">
            Tags:</div>
            <div style="position: absolute; top: 100px; left: 66px; width: 145px; height: auto; z-index: 2; background: transparent;">
                <div style="display: flex; flex-wrap: wrap;">
                    ${tagsHTML}
                </div>
            </div>
        </div>
        
        <style>
            .tag-bubble {
                background: linear-gradient(to bottom, #fefefe 0%, #e5e5e5 50%, #d6d6d6 100%);
                border: 1px solid #9a9a9a;
                border-radius: 3px;

                /* brilho superior */
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.9),   /* highlight interno */
                    inset 0 -1px 0 rgba(0, 0, 0, 0.15),       /* sombra interna inferior */
                    0 1px 2px rgba(0,0,0,0.25);               /* sombra externa */

                color: #333;
                padding: 3px;
                font-size: 11px;
                font-weight: bold;
                line-height: 1.1;
                white-space: nowrap;

                text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7); /* típico Win7 */
                display: inline-block;

                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;

                cursor: default;
            } 
            /* Garantir que todas as imagens carreguem corretamente */
            img {
                display: block;
            }
            
            .template-container * {
                box-sizing: border-box;
            }
        </style>
    `;
}

// Função de preview adaptada
function showTemplatePreview(item) {
    if (currentPreviewModal) {
        document.body.removeChild(currentPreviewModal);
        currentPreviewModal = null;
    }

    const previewModal = document.createElement('div');
    previewModal.id = 'template-preview-modal';
    previewModal.className = 'template-preview-modal';

    previewModal.innerHTML = `
        <div class="preview-overlay">
            <div class="preview-container">
                <div class="preview-header">
                    <h3>Preview: ${item.nome}</h3>
                    <button class="close-btn" id="closePreviewBtn">&times;</button>
                </div>
                
                <div class="preview-body">
                    <div id="preview-content" style="width: 420px; height: 490px; transform: scale(0.8);">
                        ${generateTemplateHTML(item)}
                    </div>
                </div>
                
                <div class="preview-footer">
                    <button class="export-btn" id="exportFromPreviewBtn">
                        <i class="fas fa-download"></i> Exportar Agora
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            .template-preview-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10000;
            }
            
            .preview-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
                box-sizing: border-box;
            }
            
            .preview-container {
                background: #1a1a1a;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                max-width: 900px;
                width: 100%;
                max-height: 95vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid #333;
            }
            
            .preview-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 25px;
                background: #2d2d2d;
                border-bottom: 1px solid #444;
            }
            
            .preview-header h3 {
                margin: 0;
                color: white;
                font-size: 1.4rem;
                font-weight: 600;
            }
            
            .close-btn {
                background: none;
                border: none;
                color: #999;
                font-size: 2rem;
                cursor: pointer;
                padding: 0;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s ease;
            }
            
            .close-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: white;
            }
            
            .preview-body {
                flex: 1;
                padding: 30px;
                display: flex;
                justify-content: center;
                align-items: center;
                background: #1a1a1a;
                overflow: auto;
            }
            
            .preview-footer {
                padding: 20px 25px;
                background: #2d2d2d;
                border-top: 1px solid #444;
                text-align: center;
            }
            
            .export-btn {
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                font-weight: 600;
                transition: all 0.3s ease;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            
            .export-btn:hover {
                background: linear-gradient(135deg, #0056b3, #004494);
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0, 123, 255, 0.3);
            }
        </style>
    `;

    document.body.appendChild(previewModal);
    currentPreviewModal = previewModal;

    // Configurar eventos
    const closePreviewBtn = document.getElementById('closePreviewBtn');
    const closeModal = () => {
        if (currentPreviewModal) {
            document.body.removeChild(currentPreviewModal);
            currentPreviewModal = null;
        }
    };

    closePreviewBtn.addEventListener('click', closeModal);
    document.getElementById('exportFromPreviewBtn').addEventListener('click', () => {
        exportItemAsImage(item);
        closeModal();
    });

    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal || e.target.classList.contains('preview-overlay')) {
            closeModal();
        }
    });

    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

let currentPreviewModal = null;

export { exportItemAsImage, generateTemplateHTML, showTemplatePreview };