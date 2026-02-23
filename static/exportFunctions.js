import { refreshSequenceDisplay } from './sequenceManagement.js';
import { bindSinopseButton } from './lineManagement.js';
import { getEpisodeLabel } from './utils.js';

// ---------------------------- HELPERS ----------------------------
function getExportType(item) {
    const c = (item?.conteudo || '').toLowerCase().trim();
    return (c === 'anime' || c === 'filme') ? 'anime' : 'manga';
}

function parseSinonimos(sinonimosData) {
    if (!sinonimosData) return [];

    if (Array.isArray(sinonimosData)) return sinonimosData.filter(Boolean);

    if (typeof sinonimosData === 'string') {
        // tenta JSON
        try {
            const parsed = JSON.parse(sinonimosData);
            if (Array.isArray(parsed)) return parsed.filter(Boolean);
        } catch { }

        // fallback: "a; b; c"
        return sinonimosData.split(';').map(s => s.trim()).filter(Boolean);
    }

    return [];
}

function normalizeTitle(s) {
    return (s ?? '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')     // troca pontuação por espaço
        .trim()
        .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
    a = a ?? '';
    b = b ?? '';
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        const ca = a.charCodeAt(i - 1);
        for (let j = 1; j <= n; j++) {
            const cb = b.charCodeAt(j - 1);
            const cost = ca === cb ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    return dp[m][n];
}

function similarityRatio(a, b) {
    const na = normalizeTitle(a);
    const nb = normalizeTitle(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;

    const dist = levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    return maxLen === 0 ? 1 : 1 - dist / maxLen; // 0..1
}

function hasNonASCII(s) {
    // qualquer char acima de 0x7F (kanji/kana/acentos etc)
    return /[^\x00-\x7F]/.test(s ?? '');
}

/**
 * Regras:
 * - tenta usar sinonimos[0]
 * - se sinonimo[0] for muito parecido com o nome (>= threshold), usa sinonimo[1]
 * - se sinonimo[1] tiver não-ASCII, usa sinonimo[2]
 */
function getSmartSinonimo(nome, sinonimosData, threshold = 0.82) {
    const sinonimos = parseSinonimos(sinonimosData);
    if (!sinonimos.length) return '';

    const s1 = sinonimos[0] || '';
    const s2 = sinonimos[1] || '';
    const s3 = sinonimos[2] || '';

    // Se o primeiro é praticamente o nome, pula pro segundo
    if (s2 && similarityRatio(nome, s1) >= threshold) {
        // Se o segundo é "kanji/kana/etc", pega o terceiro
        if (s3 && hasNonASCII(s2)) return s3;
        return s2;
    }

    return s1;
}

// Função auxiliar para aguardar carregamento de imagens
function waitForImages(container, timeout = 10000) {
    const images = Array.from(container.querySelectorAll('img'));
    const promises = images.map(img => {
        if (!img.src) return Promise.resolve();

        return new Promise(resolve => {
            let resolved = false;
            const onDone = () => { if (!resolved) { resolved = true; resolve(); } };

            // Forçar recarregamento limpando cache
            img.addEventListener('load', onDone, { once: true });
            img.addEventListener('error', () => {
                console.warn('Erro ao carregar imagem:', img.src);
                if (img.alt === 'Capa' || img.classList.contains('cover-image')) {
                    img.src = 'https://via.placeholder.com/180x250/667eea/ffffff?text=Capa+Não+Disponível';
                }
                onDone();
            }, { once: true });

            setTimeout(onDone, timeout);
        });
    });

    return Promise.all(promises);
}

function smartTagOrganization(tags, containerWidth, maxRows = 7) {
    if (!Array.isArray(tags) || tags.length === 0) return [];

    const measureWidth = (() => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = "bold 11px Arial";
        return (tag) => {
            const textWidth = Math.ceil(ctx.measureText(tag).width);
            const bubbleWidth = textWidth + 3 + 3 + 1 + 1; // padding + border
            return Math.min(bubbleWidth, containerWidth);
        };
    })();

    const items = tags
        .map(t => ({ text: t, width: Math.ceil(measureWidth(t)) }))
        .sort((a, b) => a.width - b.width);

    const rows = [];
    let remaining = items.slice();

    for (let r = 0; r < maxRows && remaining.length > 0; r++) {
        const C = Math.floor(containerWidth);

        const dpCount = new Int32Array(C + 1);
        const dpUsed = new Int32Array(C + 1);
        const parent = Array.from({ length: C + 1 }, () => null);

        for (let idx = 0; idx < remaining.length; idx++) {
            const w = Math.min(Math.floor(remaining[idx].width), C);
            if (w <= 0) continue;

            for (let cap = C; cap >= w; cap--) {
                const prevCap = cap - w;
                const candidateCount = dpCount[prevCap] + 1;
                const candidateUsed = dpUsed[prevCap] + w;

                if (
                    candidateCount > dpCount[cap] ||
                    (candidateCount === dpCount[cap] && candidateUsed > dpUsed[cap])
                ) {
                    dpCount[cap] = candidateCount;
                    dpUsed[cap] = candidateUsed;
                    parent[cap] = { prev: prevCap, idx };
                }
            }
        }

        let bestCap = 0;
        for (let cap = 0; cap <= C; cap++) {
            if (
                dpCount[cap] > dpCount[bestCap] ||
                (dpCount[cap] === dpCount[bestCap] && dpUsed[cap] > dpUsed[bestCap])
            ) {
                bestCap = cap;
            }
        }

        if (dpCount[bestCap] === 0) {
            const single = remaining.find(it => it.width <= C);
            if (!single) break;

            rows.push([single]);
            const key = single.text + "||" + single.width;
            remaining = remaining.filter(it => (it.text + "||" + it.width) !== key);
            continue;
        }

        const chosenIndices = new Set();
        let cur = bestCap;
        while (cur > 0 && parent[cur]) {
            const entry = parent[cur];
            chosenIndices.add(entry.idx);
            cur = entry.prev;
        }

        const chosen = [];
        for (let i = 0; i < remaining.length; i++) {
            if (chosenIndices.has(i)) chosen.push(remaining[i]);
        }

        const chosenSet = new Set(chosen.map(x => x.text + "||" + x.width));
        remaining = remaining.filter(it => !chosenSet.has(it.text + "||" + it.width));

        rows.push(chosen);
    }

    return rows;
}

// ---------------------------- TEMPLATE ----------------------------
// forcedType: null | 'anime' | 'manga'
function generateTemplateHTML(item, forcedType = null) {
    const type = forcedType ?? getExportType(item);

    const tagsArray = item.tags
        ? item.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : [];

    // Adiciona cache buster para evitar reuso de imagens cacheadas
    const cb = Date.now() + '_' + Math.random().toString(16).slice(2);
    const imageUrl = item.imagem_url && item.imagem_url.trim() 
        ? item.imagem_url 
        : null;
    const coverUrl = imageUrl
        ? `/proxy_image?url=${encodeURIComponent(imageUrl)}&cb=${cb}`
        : 'https://via.placeholder.com/180x250/667eea/ffffff?text=Sem+Capa';

    // -------- TEMPLATE MANGA (livro) --------
    if (type === 'manga') {
        const backgroundUrl = '/static/img/card-Manga.png';


        // limpa HTML caso venha de fonte externa
        const sinopse = (item.sinopse || '').replace(/<[^>]*>/g, '').trim();
        const sinopseSafe = sinopse || ' '; // mantém o bloco “vivo”

        // tags texto simples
        const tagsArray = item.tags
            ? item.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [];
        const tagsText = tagsArray.length ? tagsArray.join(', ') : '';

        return `
            <div class="template-container manga-card" style="width:800px;height:490px;position:relative;background:transparent;overflow:hidden;">
            <img src="${backgroundUrl}"
                style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;"
                alt="Background" crossorigin="anonymous">

            <!-- Capa (mantive onde já estava) -->
            <div class="manga-cover">
                <img src="${coverUrl}" alt="Capa" crossorigin="anonymous" />
            </div>

            <!-- BLOCO DIREITA (Nome + Sinopse) -->
            <div class="manga-right">
                <h2 class="manga-title">
                <span class="manga-title-text">${item.nome}</span>
                </h2>

                <p class="manga-sinopse">
                <span class="manga-sinopse-text">${sinopseSafe}</span>
                </p>
            </div>

            <!-- INFOS (estilo “anime”: label + value) -->
            <div class="manga-infos">
                <div class="manga-info"><span class="lbl">Tipo:</span> <span class="val">${item.conteudo ?? ''}</span></div>
                <div class="manga-info"><span class="lbl">${getEpisodeLabel(item.conteudo)}:</span> <span class="val">${item.episodio ?? ''}</span></div>
                <div class="manga-info"><span class="lbl">Status:</span> <span class="val">${item.status ?? ''}</span></div>
                <div class="manga-info"><span class="lbl">Nota:</span> <span class="val">${item.opiniao ?? ''}</span></div>
            </div>

            <!-- TAGS (texto puro, separado por vírgula) -->
            <div class="manga-tags">
                <span class="lbl">Tags:</span>
                <span class="val">${tagsText}</span>
            </div>

            <!-- SINONIMOS -->
            <div class="manga-sinonimos">
                <span class="lbl">Sinônimo:</span>
                <span class="val">${getSmartSinonimo(item.nome, item.sinonimos)}</span>
            </div>

            <style>
                @font-face {
                font-family: 'MarckScript';
                src: url('/static/fonts/MarckScript-Regular.ttf') format('truetype');
                font-weight: normal;
                font-style: normal;
                }

                .manga-title,
                .manga-sinopse, 
                .manga-infos, 
                .manga-tags, 
                .manga-sinonimos {
                font-family: 'MarckScript', cursive;
                }

                .manga-title {
                font-size: 20px;
                line-height: 1.2;
                letter-spacing: 0.4px;
                }

                .manga-sinopse {
                font-size: 13px;
                line-height: 1.45;
                letter-spacing: 0.3px;
                text-align: justify;
                }

                .manga-sinonimos {
                position: absolute;
                bottom: 45px;
                left: 50px;
                width: 320px;
                z-index: 2;
                font-size: 14px;
                line-height: 1.25;
                color: #3d3d3d;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 6;
                -webkit-box-orient: vertical;
                }

                img { display:block; }
                .template-container * { box-sizing:border-box; }

                /* capa */
                .manga-cover{
                position:absolute;
                top:30px; left:50px;
                width:171px; height:228px;
                border-radius:6px;
                overflow:hidden;
                box-shadow:0 3px 10px rgba(0,0,0,0.2);
                z-index:2;
                background: #fff;
                }
                .manga-cover img{
                width:100%;
                height:100%;
                object-fit:cover;
                }

                /* direita: nome + sinopse (pra você brincar com font-size à vontade) */
                .manga-right{
                position:absolute;
                top:35px; left:425px;
                width:325px;
                z-index:2;
                display:flex;
                flex-direction:column;
                gap:10px;
                }

                .manga-title{
                margin:0;
                padding:0;
                font-size:18px;
                line-height:1.15;
                font-weight:800;
                color:#3d3d3d;
                max-height:60px;
                overflow:hidden;
                text-overflow:ellipsis;
                }
                .manga-title-text{
                display:block;
                }

                .manga-sinopse{
                margin:0;
                padding:0;
                font-size:13px;
                line-height:1.35;
                color:#3d3d3d;

                /* clamp “tipo anime” */
                display:-webkit-box;
                -webkit-line-clamp:8; /* ajuste linhas */
                -webkit-box-orient:vertical;
                }
                .manga-sinopse-text{
                display:block;
                white-space:normal;
                }

                /* infos em coluninha (mais “limpo”) */
                .manga-infos{
                position:absolute;
                top:40px; left:230px;
                width:150px;
                z-index:2;
                display:grid;
                grid-template-columns:1fr;
                gap:6px 10px;
                font-size:15px;
                color:#3d3d3d;
                }
                .manga-info{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .manga-info .lbl{ font-weight:700; }
                .manga-info .val{ font-weight:400; }

                /* tags texto puro */
                .manga-tags{
                position:absolute;
                top:280px; left:50px;
                width:320px;
                z-index:2;
                font-size:15px;
                line-height:1.25;
                color:#3d3d3d;
                overflow:hidden;

                /* se tiver tags demais, corta bonito */
                display:-webkit-box;
                -webkit-line-clamp:6;
                -webkit-box-orient:vertical;
                }
                .manga-tags .lbl{ font-weight:700; }
                .manga-tags .val{ font-weight:400; }
            </style>
            </div>
        `;
    }


    // -------- TEMPLATE ANIME (monitor) --------
    // tags um pouco menores aqui pra não dominar
    const tagsBoxWidth = 350;
    const organizedTagsAnime = smartTagOrganization(tagsArray, tagsBoxWidth, 5);

    const tagsHTMLAnime = `
        <div style="
            display:inline-flex;
            flex-wrap:wrap;
            gap:6px;
            width:max-content;   /* cresce com o conteúdo */
            max-width:550px;     /* teto */
        ">
        ${organizedTagsAnime.flat().map(t => `
        <span class="tag-chip" style="display:inline-block;">
            ${t.text}
        </span>
        `).join('')}
        </div>
    `;

    const backgroundUrl = '/static/img/card-Anime.png';

    const sinopse = (item.sinopse || '').replace(/<[^>]*>/g, '').trim(); // limpa HTML se vier do AniList
    const sinopseSafe = sinopse || ' '; // mantém o slot “vivo” mesmo vazio

    return `
    <div class="template-container" style="width:850px;height:490px;position:relative;font-family:Arial,sans-serif;background:transparent;overflow:hidden;">
      <img src="${backgroundUrl}"
        style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;"
        alt="Background" crossorigin="anonymous">

      <!-- Overlay layout (3 sessões) -->
      <div style="position:absolute;inset:5px;z-index:2;display:flex;gap:14px;">
        
        <!-- ESQUERDA + MEIO -->
        <div style="flex:1;padding:13px;display:flex;flex-direction:column;gap:10px;min-width:0;">
          
            <!-- Top row: Capa (esq) + Nome/Infos (meio) -->
            <div style="display:flex;gap:12px;align-items:flex-start;">
                
                <!-- Capa (3x4) -->
                <div style="width:auto;height:280px;border-radius:10px;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,0.45);flex:0 0 auto;">
                <img src="${coverUrl}" alt="Capa" crossorigin="anonymous"
                    style="width:100%;height:100%;object-fit:cover;">
                </div>

                <!-- Nome + Infos + Tags -->
                <div style="display:flex;flex-direction:column;gap:25px;width:380px;">
                
                    <!-- Nome (sem faixa laranja) -->
                    <div style="padding:10px 12px;border-radius:10px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);">
                        <div style="font-size:16px;font-weight:800;color:#fff;line-height:1.15;overflow:hidden;text-overflow:ellipsis;">
                        ${item.nome}
                        </div>
                    </div>

                    <!-- Infos 2x2 (status|ep / conteudo|op) -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div class="info-box">
                        <div class="info-label">Status</div>
                        <div class="info-value">${item.status ?? ''}</div>
                        </div>
                        <div class="info-box">
                        <div class="info-label">Eps</div>
                        <div class="info-value">${item.episodio ?? ''}</div>
                        </div>
                        <div class="info-box">
                        <div class="info-label">Conteúdo</div>
                        <div class="info-value">${item.conteudo ?? ''}</div>
                        </div>
                        <div class="info-box">
                        <div class="info-label">Opinião</div>
                        <div class="info-value">${item.opiniao ?? ''}</div>
                        </div>
                    </div>

                </div>
                
                
            </div>
            <div style="padding:10px 12px;border-radius:10px;background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.10);position:absolute;max-height:150px;top:300px;">
                <div style="font-size:12px;font-weight:800;color:rgba(255,255,255,0.9);margin-bottom:8px;">
                Tags
                </div>
                <div style="width:fit-content;max-width:550px;">
                ${tagsHTMLAnime}
                </div>
            </div>

            <div style="padding:10px 12px;border-radius:10px;background:rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.10);position:absolute;max-height:150px;bottom:185px;left:220px;">
                <div style="font-size:12px;font-weight:800;color:rgba(255,255,255,0.9);margin-bottom:4px;">
                Sinônimo
                </div>
                <div style="font-size:11px;color:rgba(255,255,255,0.85);">
                ${getSmartSinonimo(item.nome, item.sinonimos)}
                </div>
            </div>

        </div>

        <!-- SIDEBAR (direita) -->
        <div style="width:222px;flex:0 0 auto;height:450px;padding:12px;border-radius:4px;box-shadow:0 10px 25px rgba(0,0,0,0.35);display:flex;flex-direction:column;min-height:0;">
          <div style="margin-top:55px;font-size:11px;line-height:1.25;color:rgba(255,255,255,0.88);overflow:hidden;display:-webkit-box;-webkit-line-clamp:18;-webkit-box-orient:vertical;">
            ${sinopseSafe}
          </div>
        </div>

      </div>

      <style>
        img { display:block; }
        .template-container * { box-sizing:border-box; }

        .info-box{
          border-radius:10px;
          background:rgba(0,0,0,0.28);
          border:1px solid rgba(255,255,255,0.10);
          padding:8px 10px;
          min-width:0;
        }
        .info-label{
          font-size:10px;
          font-weight:800;
          color:rgba(255,255,255,0.75);
          margin-bottom:3px;
        }
        .info-value{
          font-size:12px;
          font-weight:800;
          color:#fff;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        .tag-chip{
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 800;
          color: rgba(255,255,255,0.92);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      </style>
    </div>
  `;
}

// ---------------------------- EXPORTAÇÃO ----------------------------
async function exportItemAsImage(item, forcedType = null) {
    const loader = document.getElementById('imageCreatorLoader');
    if (loader) loader.style.display = 'flex';

    try {
        // Limpar export-card antigo completamente
        const oldExportCard = document.getElementById('export-card');
        if (oldExportCard) {
            oldExportCard.remove();
        }

        // Determinar tamanho baseado no tipo
        const exportType = forcedType ?? getExportType(item);
        const exportSizes = {
            'anime': { width: 850, height: 490 },
            'manga': { width: 800, height: 490 }
        };
        const { width: exportWidth, height: exportHeight } = exportSizes[exportType] || { width: 850, height: 490 };

        // Criar novo elemento sempre
        const exportCard = document.createElement('div');
        exportCard.id = 'export-card';
        document.body.appendChild(exportCard);

        exportCard.style.position = 'fixed';
        exportCard.style.left = '0';
        exportCard.style.top = '0';
        exportCard.style.width = exportWidth + 'px';
        exportCard.style.height = exportHeight + 'px';
        exportCard.style.zIndex = '99999';
        exportCard.style.transform = 'translateX(-200vw) translateY(0)';
        exportCard.style.opacity = '1';
        exportCard.style.visibility = 'visible';
        exportCard.style.background = 'transparent';
        exportCard.style.pointerEvents = '';

        exportCard.innerHTML = generateTemplateHTML(item, forcedType);

        await new Promise(resolve => setTimeout(resolve, 500));

        // Força recarregamento agressivo de todas as imagens
        const allImages = Array.from(exportCard.querySelectorAll('img'));
        allImages.forEach(img => {
            if (img.src && img.src.includes('proxy_image')) {
                // Atualiza ou adiciona o parâmetro cache-buster sem remover outros params (ex: url=...)
                try {
                    const timestamp = Date.now() + Math.random();
                    const urlObj = new URL(img.src, window.location.origin);
                    urlObj.searchParams.set('_t', timestamp);
                    img.src = urlObj.toString();
                } catch (e) {
                    // Fallback simples: apenas concatena sem remover query existente
                    const timestamp = Date.now() + Math.random();
                    const separator = img.src.includes('?') ? '&' : '?';
                    img.src = img.src + `${separator}_t=${timestamp}`;
                }
            }
        });

        await new Promise(resolve => setTimeout(resolve, 800));

        // Aguarda todas as imagens carregarem completamente
        await Promise.all(
            Array.from(exportCard.querySelectorAll('img')).map(img => {
                if (!img.src) return Promise.resolve();
                return new Promise(resolve => {
                    img.crossOrigin = 'anonymous';
                    if (img.complete && img.naturalWidth > 0) {
                        resolve();
                    } else {
                        const onLoad = () => resolve();
                        const onError = () => resolve();
                        img.addEventListener('load', onLoad, { once: true });
                        img.addEventListener('error', onError, { once: true });
                        setTimeout(resolve, 15000);
                    }
                });
            })
        );

        await new Promise(resolve => setTimeout(resolve, 1500));

        if (typeof htmlToImage === 'undefined') {
            throw new Error('Biblioteca html-to-image não carregada');
        }

        const dataUrl = await htmlToImage.toPng(exportCard, {
            width: exportWidth,
            height: exportHeight,
            style: { transform: 'none', margin: '0', padding: '0' },
            quality: 1.0,
            pixelRatio: 2,
            skipAutoScale: false,
            backgroundColor: 'transparent',
            cacheBust: false,
            imageTimeout: 60000,
            allowTaint: true,
            useCORS: true,
            filter: (node) => {
                if (node.classList && node.classList.contains('template-preview-modal')) return false;
                return true;
            }
        });

        const link = document.createElement('a');
        link.href = dataUrl;

        const suffix = (forcedType ?? getExportType(item)) === 'anime' ? '_anime' : '_manga';
        link.download = `${item.nome.replace(/\s+/g, '_')}${suffix}_card.png`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        refreshSequenceDisplay();
        bindSinopseButton(item);

    } catch (error) {
        console.error('Erro na exportação com html-to-image:', error);
        alert('Erro ao exportar imagem: ' + error.message);
    } finally {
        const exportCard = document.getElementById('export-card');
        if (exportCard) {
            exportCard.remove();
        }
        if (loader) loader.style.display = 'none';
    }
}

// ---------------------------- PREVIEW (com seletor) ----------------------------
let currentPreviewModal = null;

function showTemplatePreview(item) {
    if (currentPreviewModal) {
        document.body.removeChild(currentPreviewModal);
        currentPreviewModal = null;
    }

    const autoType = getExportType(item);

    const previewModal = document.createElement('div');
    previewModal.id = 'template-preview-modal';
    previewModal.className = 'template-preview-modal';

    previewModal.innerHTML = `
    <div class="preview-overlay">
      <div class="preview-container">
        <div class="preview-header">
          <div style="display:flex;flex-direction:column;gap:10px;">
            <h3 style="margin:0;color:white;font-size:1.4rem;font-weight:600;">Preview: ${item.nome}</h3>

            <!-- seletor -->
            <div class="template-switch">
              <label><input type="radio" name="exportTemplateMode" value="auto" checked> Automático (${autoType})</label>
              <label><input type="radio" name="exportTemplateMode" value="anime"> Anime</label>
              <label><input type="radio" name="exportTemplateMode" value="manga"> Manga</label>
            </div>
          </div>

          <button class="close-btn" id="closePreviewBtn">&times;</button>
        </div>

        <div class="preview-body">
          <div id="preview-content" data-template="auto" style="width:800px;height:490px;">
            ${generateTemplateHTML(item, null)}
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
      .template-preview-modal { position:fixed; top:0; left:0; width:100%; height:100%; z-index:10000; }
      .preview-overlay {
        position:absolute; inset:0;
        background: rgba(0,0,0,0.85);
        display:flex; justify-content:center; align-items:center;
        padding: 20px; box-sizing:border-box;
      }
      .preview-container {
        background:#1a1a1a;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        max-width: 900px;
        width: 100%;
        max-height: 95vh;
        display:flex; flex-direction:column;
        overflow:hidden;
        border: 1px solid #333;
      }
      .preview-header {
        display:flex; justify-content:space-between; align-items:flex-start;
        padding: 18px 22px;
        background:#2d2d2d;
        border-bottom: 1px solid #444;
        gap: 16px;
      }
      .template-switch{
        display:flex; gap:14px; flex-wrap:wrap;
        font-size: 0.95rem; color: #ddd;
      }
      .template-switch label{
        display:flex; align-items:center; gap:8px;
        padding: 6px 10px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 999px;
        cursor: pointer;
        user-select:none;
      }
      .template-switch input{ accent-color: #ff6a2c; }

      .close-btn {
        background:none; border:none;
        color:#999; font-size:2rem;
        cursor:pointer;
        width:40px; height:40px;
        display:flex; align-items:center; justify-content:center;
        border-radius:50%;
        transition: all 0.2s ease;
        flex: 0 0 auto;
      }
      .close-btn:hover { background: rgba(255,255,255,0.1); color:white; }

      .preview-body {
        flex:1;
        padding: 26px;
        display:flex; justify-content:center; align-items:center;
        background:#1a1a1a;
      }

      .preview-footer {
        padding: 16px 22px;
        background:#2d2d2d;
        border-top:1px solid #444;
        text-align:center;
      }
      .export-btn {
        background: linear-gradient(135deg, #007bff, #0056b3);
        color:white; border:none;
        padding: 12px 30px;
        border-radius: 8px;
        cursor:pointer;
        font-size:1rem;
        font-weight:600;
        transition: all 0.3s ease;
        display:inline-flex; align-items:center; gap:8px;
      }
      .export-btn:hover {
        background: linear-gradient(135deg, #0056b3, #004494);
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0,123,255,0.3);
      }
    </style>
  `;

    document.body.appendChild(previewModal);
    currentPreviewModal = previewModal;

    const closePreviewBtn = document.getElementById('closePreviewBtn');
    const closeModal = () => {
        if (currentPreviewModal) {
            document.body.removeChild(currentPreviewModal);
            currentPreviewModal = null;
        }
    };

    closePreviewBtn.addEventListener('click', closeModal);

    const previewContent = document.getElementById('preview-content');
    const radios = Array.from(document.querySelectorAll('input[name="exportTemplateMode"]'));

    const getForced = () => {
        const mode = radios.find(r => r.checked)?.value || 'auto';
        if (mode === 'auto') return null;
        return mode; // 'anime' | 'manga'
    };

    // Definir larguras diferentes por template
    const templateWidths = {
        'auto': '800px',
        'anime': '855px',
        'manga': '800px'
    };

    const updatePreviewWidth = (mode) => {
        const width = templateWidths[mode] || '800px';
        previewContent.style.width = width;
        previewContent.setAttribute('data-template', mode);
    };

    const rerender = () => {
        const forced = getForced();
        const mode = radios.find(r => r.checked)?.value || 'auto';
        updatePreviewWidth(mode);
        previewContent.innerHTML = generateTemplateHTML(item, forced);
    };

    radios.forEach(r => r.addEventListener('change', rerender));

    document.getElementById('exportFromPreviewBtn').addEventListener('click', async () => {
        const forced = getForced();
        await exportItemAsImage(item, forced);
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

export { exportItemAsImage, generateTemplateHTML, showTemplatePreview };
