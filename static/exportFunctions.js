import { refreshSequenceDisplay } from './sequenceManagement.js';
import { bindSinopseButton } from './lineManagement.js';
// ---------------------------- FUNÇÕES DE EXPORTAÇÃO ----------------------------
async function exportItemAsImage(item) {
    const loader = document.getElementById('imageCreatorLoader');
    if (loader) loader.style.display = 'flex';
    // 1) Se não tiver URL, busca uma
    try {
        if (!item.imagem_url || item.imagem_url === "undefined" || item.imagem_url === "null") {
            let contentType;
            switch (item.conteudo) {
                case "Anime":
                case "Filme":
                    contentType = "anime";
                    break;
                case "Manga":
                case "Manhwa":
                case "Webtoon":
                case "Novel":
                    contentType = "manga";
                    break;
                default:
                    contentType = "anime";
            }
            const fetchedUrl = await fetchImageUrl(item.nome, contentType);
            if (fetchedUrl && !fetchedUrl.includes('via.placeholder.com')) {
                item.imagem_url = fetchedUrl;
                // opcional: salve no banco
                await fetch(`/linhas/${item.id}/imagem`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imagem_url: fetchedUrl })
                });
            } else {
                return alert("Imagem indisponível para exportação.");
            }
        }

        const exportCard = document.getElementById('export-card');
        const imgEl = exportCard.querySelector('img');

        // 2) Use sempre o proxy para evitar CORS
        imgEl.src = `/proxy_image?url=${encodeURIComponent(item.imagem_url)}`;

        // 3) Aguarde o load antes de capturar
        await new Promise(resolve => {
            imgEl.onload = resolve;
            imgEl.onerror = resolve;
        });

        // 4) Agora gera o canvas
        const canvas = await html2canvas(exportCard);
        const finalDataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = finalDataURL;
        link.download = `${item.nome.replace(/\s+/g, '_')}.png`;
        link.click();

        refreshSequenceDisplay();
        bindSinopseButton(item);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// Chamada inicial para carregar a sequência

export { exportItemAsImage };