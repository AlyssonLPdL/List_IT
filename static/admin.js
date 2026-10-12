/* ==========================================================================
   ADMIN — Gerenciamento de Itens
   ========================================================================== */

const CONTENT_TYPES = ["Anime", "Filme", "Manga", "Manhwa", "Webtoon", "Novel"];
const STATUSES = ["Vendo", "Lendo", "Assistir", "Ler", "Concluido", "Dropado", "Cancelado", "Conheço"];
const OPINIONS = ["Favorito", "Muito Bom", "Recomendo", "Bom", "Mediano", "Ruim", "Horrivel", "Não vi"];
const OPINION_PRIORITY = { "Favorito":0, "Muito Bom":1, "Recomendo":2, "Bom":3, "Mediano":4, "Ruim":5, "Horrivel":6, "Não vi":7 };

const AppState = {
    items: [],
    filtered: [],
    listas: [],
    sequencias: [],
    selected: new Set(),
    lastClickedId: null,
    filters: {
        search: "",
        lists: new Set(),
        contents: new Set(),
        statuses: new Set(),
        opinions: new Set(),
        tagStates: new Map(),   // tag -> "and" | "or" | "not"
        hasSequence: null,
        hasImage: null,
        hasSinopse: null,
    },
    sort: "name-asc",
    view: "grid",
};

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* ========== Utilities ========== */
function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function normalize(s) {
    return String(s || "").toLowerCase()
        .replace(/\b(i{1,3}|iv|v|vi{0,3}|ix|x)\b/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function debounce(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    const icon = type === "success" ? "fa-check-circle" : type === "error" ? "fa-exclamation-circle" : "fa-info-circle";
    el.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(msg)}</span>`;
    $("#toast-stack").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, 3000);
}

/* ========== Load ========== */
async function loadData() {
    try {
        const res = await fetch("/admin/data");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        AppState.items = data.items;
        AppState.listas = data.listas;
        AppState.sequencias = data.sequencias;
        renderStats();
        renderFilters();
        applyFilters();
    } catch (e) {
        console.error(e);
        $("#items-wrap").innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erro ao carregar</h3><p>${escapeHtml(e.message)}</p></div>`;
    }
}

/* ========== Stats ========== */
function computeStats() {
    const items = AppState.items;
    const missingImg = items.filter(i => !i.imagem_url || i.imagem_url.includes("placeholder")).length;
    const missingSin = items.filter(i => !i.sinopse || i.sinopse.trim() === "").length;
    const noSeq = items.filter(i => !i.sequencias || i.sequencias.length === 0).length;
    return { total: items.length, missingImg, missingSin, noSeq };
}

function renderStats() {
    const s = computeStats();
    const stats = [
        { key: "total",       icon: "fa-database", label: "Total",         value: s.total,       filter: null },
        { key: "missingImg",  icon: "fa-image",    label: "Sem Imagem",    value: s.missingImg,  filter: () => toggleFilter("hasImage", "missing") },
        { key: "missingSin",  icon: "fa-book",     label: "Sem Sinopse",   value: s.missingSin,  filter: () => toggleFilter("hasSinopse", "missing") },
        { key: "noSeq",       icon: "fa-unlink",   label: "Sem Sequência", value: s.noSeq,       filter: () => toggleFilter("hasSequence", "no") },
    ];
    $("#stats-bar").innerHTML = stats.map((s, i) => `
        <div class="stat-chip" data-stat="${s.key}">
            <div class="stat-icon"><i class="fas ${s.icon}"></i></div>
            <div class="stat-info">
                <span class="stat-value">${s.value}</span>
                <span class="stat-label">${s.label}</span>
            </div>
        </div>
    `).join("");

    $$("#stats-bar .stat-chip").forEach((el, idx) => {
        el.addEventListener("click", () => {
            const fn = stats[idx].filter;
            if (fn) fn();
        });
    });
}

function toggleFilter(key, value) {
    const cur = AppState.filters[key];
    AppState.filters[key] = (cur === value) ? null : value;
    renderFilters();
    applyFilters();
}

/* ========== Filters ========== */
function countBy(arr, fn) {
    const m = {};
    arr.forEach(x => { const k = fn(x); if (k) m[k] = (m[k] || 0) + 1; });
    return m;
}

function renderFilters() {
    const items = AppState.items;
    const listsCount = countBy(items, i => i.lista_nome);
    const contentsCount = countBy(items, i => i.conteudo);
    const statusesCount = countBy(items, i => i.status);
    const opinionsCount = countBy(items, i => i.opiniao);

    // tags
    const tagsCount = {};
    items.forEach(i => (i.tags || "").split(",").forEach(t => {
        const v = t.trim(); if (v) tagsCount[v] = (tagsCount[v] || 0) + 1;
    }));
    const allTags = Object.keys(tagsCount).sort((a, b) => a.localeCompare(b, "pt-BR"));

    const sidebar = $("#filters-container");
    sidebar.innerHTML = "";

    const mkCheckGroup = (title, key, mapObj, isSet) => {
        const g = document.createElement("div");
        g.className = "filter-group";
        const entries = Object.entries(mapObj).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
        g.innerHTML = `
            <div class="filter-group-title"><span>${title}</span><i class="fas fa-chevron-down"></i></div>
            <div class="filter-group-body">
                ${entries.map(([k, c]) => `
                    <label class="filter-item ${isSet(k) ? "active" : ""}">
                        <input type="checkbox" ${isSet(k) ? "checked" : ""} data-group="${key}" data-value="${escapeHtml(k)}">
                        <span>${escapeHtml(k)}</span>
                        <span class="badge-count">${c}</span>
                    </label>
                `).join("")}
            </div>
        `;
        g.querySelector(".filter-group-title").addEventListener("click", () => g.classList.toggle("collapsed"));
        return g;
    };

    // LISTAS
    sidebar.appendChild(mkCheckGroup("Listas", "lists", listsCount, v => AppState.filters.lists.has(v)));
    // TIPO
    sidebar.appendChild(mkCheckGroup("Tipo de Conteúdo", "contents", contentsCount, v => AppState.filters.contents.has(v)));
    // STATUS
    sidebar.appendChild(mkCheckGroup("Status", "statuses", statusesCount, v => AppState.filters.statuses.has(v)));
    // OPINIÃO
    sidebar.appendChild(mkCheckGroup("Opinião", "opinions", opinionsCount, v => AppState.filters.opinions.has(v)));

    // ============================================================
    // TAGS — sistema AND / OR / NOT (4 estados por chip)
    // ============================================================
    const tagsGroup = document.createElement("div");
    tagsGroup.className = "filter-group";
    tagsGroup.id = "tags-group";

    tagsGroup.innerHTML = `
        <div class="filter-group-title">
            <span>Tags <span style="color:var(--text-dim); font-weight:400;">(${allTags.length})</span></span>
            <div class="group-actions">
                <button class="mini-btn" id="tags-clear-btn" type="button">Limpar</button>
                <i class="fas fa-chevron-down"></i>
            </div>
        </div>
        <div class="filter-group-body">
            <div class="tag-expression">
                <span class="expr-label">Filtro:</span>
                <span class="expr-text" id="tag-expression-text">—</span>
            </div>

            <div class="tag-legend">
                <span class="legend-item"><span class="legend-badge and">&amp;</span> Incluir (todas)</span>
                <span class="legend-item"><span class="legend-badge or">|</span> Alternativa</span>
                <span class="legend-item"><span class="legend-badge not">!</span> Excluir</span>
            </div>

            <input type="text" class="tag-search" id="tag-search-input" placeholder="Filtrar tags...">

            <div class="tag-filter-grid" id="tag-grid">
                ${allTags.slice(0, 300).map(t => {
                    const state = AppState.filters.tagStates.get(t);
                    const cls = state ? `state-${state}` : "";
                    const badgeText = state === "and" ? "&" : state === "or" ? "|" : state === "not" ? "!" : "";
                    const badgeHtml = state
                        ? `<span class="tag-state-badge">${badgeText}</span>`
                        : "";
                    return `<span class="tag-chip ${cls}" data-tag="${escapeHtml(t)}" title="Clique para alternar: & → | → ! → off">${badgeHtml}${escapeHtml(t)}</span>`;
                }).join("")}
            </div>
        </div>
    `;

    // Toggle collapsible
    tagsGroup.querySelector(".filter-group-title").addEventListener("click", (e) => {
        if (e.target.closest(".group-actions")) return;
        tagsGroup.classList.toggle("collapsed");
    });

    // Click nos chips — cicla estado
    tagsGroup.querySelectorAll(".tag-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const tag = chip.dataset.tag;
            const cur = AppState.filters.tagStates.get(tag);
            const next = !cur ? "and" : cur === "and" ? "or" : cur === "or" ? "not" : null;

            if (!next) AppState.filters.tagStates.delete(tag);
            else AppState.filters.tagStates.set(tag, next);

            // Atualiza visual do chip sem re-renderizar tudo
            chip.classList.remove("state-and", "state-or", "state-not");
            let badge = chip.querySelector(".tag-state-badge");
            if (next) {
                chip.classList.add(`state-${next}`);
                const symbol = next === "and" ? "&" : next === "or" ? "|" : "!";
                if (!badge) {
                    badge = document.createElement("span");
                    badge.className = "tag-state-badge";
                    chip.insertBefore(badge, chip.firstChild);
                }
                badge.textContent = symbol;
            } else if (badge) {
                badge.remove();
            }

            updateTagExpression();
            applyFilters();
        });
    });

    // Filtro de tags por nome (só esconde chips, não re-renderiza)
    const tagSearchInput = tagsGroup.querySelector("#tag-search-input");
    tagSearchInput.addEventListener("input", () => {
        const q = tagSearchInput.value.toLowerCase().trim();
        tagsGroup.querySelectorAll(".tag-chip").forEach(chip => {
            const t = (chip.dataset.tag || "").toLowerCase();
            chip.style.display = (!q || t.includes(q)) ? "" : "none";
        });
    });

    // Botão "Limpar"
    tagsGroup.querySelector("#tags-clear-btn").addEventListener("click", () => {
        AppState.filters.tagStates.clear();
        tagsGroup.querySelectorAll(".tag-chip").forEach(chip => {
            chip.classList.remove("state-and", "state-or", "state-not");
            const b = chip.querySelector(".tag-state-badge");
            if (b) b.remove();
        });
        updateTagExpression();
        applyFilters();
    });

    sidebar.appendChild(tagsGroup);
    updateTagExpression();

    // Special filters
    const special = document.createElement("div");
    special.className = "filter-group";
    special.innerHTML = `
        <div class="filter-group-title"><span>Extras</span><i class="fas fa-chevron-down"></i></div>
        <div class="filter-group-body">
            <label class="filter-item ${AppState.filters.hasImage==='missing'?'active':''}">
                <input type="checkbox" data-special="hasImage" ${AppState.filters.hasImage==='missing'?'checked':''}>
                <span>Só sem imagem</span>
            </label>
            <label class="filter-item ${AppState.filters.hasSinopse==='missing'?'active':''}">
                <input type="checkbox" data-special="hasSinopse" ${AppState.filters.hasSinopse==='missing'?'checked':''}>
                <span>Só sem sinopse</span>
            </label>
            <label class="filter-item ${AppState.filters.hasSequence==='has'?'active':''}">
                <input type="checkbox" data-special="hasSequence" data-val="has" ${AppState.filters.hasSequence==='has'?'checked':''}>
                <span>Só com sequência</span>
            </label>
            <label class="filter-item ${AppState.filters.hasSequence==='no'?'active':''}">
                <input type="checkbox" data-special="hasSequence" data-val="no" ${AppState.filters.hasSequence==='no'?'checked':''}>
                <span>Só sem sequência</span>
            </label>
        </div>
    `;
    special.querySelector(".filter-group-title").addEventListener("click", () => special.classList.toggle("collapsed"));
    special.querySelectorAll('input[data-special]').forEach(inp => {
        inp.addEventListener("change", () => {
            const k = inp.dataset.special;
            const v = inp.dataset.val || "missing";
            AppState.filters[k] = inp.checked ? v : null;
            renderFilters();
            applyFilters();
        });
    });
    sidebar.appendChild(special);

    // Delegated handler for checkbox groups
    sidebar.querySelectorAll('.filter-item input[data-group]').forEach(inp => {
        inp.addEventListener("change", () => {
            const group = inp.dataset.group;
            const val = inp.dataset.value;
            if (inp.checked) AppState.filters[group].add(val);
            else AppState.filters[group].delete(val);
            applyFilters();
        });
    });
}

function updateTagExpression() {
    const el = document.getElementById("tag-expression-text");
    if (!el) return;

    const andTags = [], orTags = [], notTags = [];
    for (const [tag, state] of AppState.filters.tagStates.entries()) {
        if (state === "and") andTags.push(tag);
        else if (state === "or") orTags.push(tag);
        else if (state === "not") notTags.push(tag);
    }

    const parts = [];
    if (andTags.length) parts.push(`<span class="expr-term expr-and">${andTags.map(escapeHtml).join(" &amp; ")}</span>`);
    if (orTags.length)  parts.push(`<span class="expr-term expr-or">(${orTags.map(escapeHtml).join(" | ")})</span>`);
    if (notTags.length) parts.push(`<span class="expr-term expr-not">!${notTags.map(escapeHtml).join(" &amp; !")}</span>`);

    el.innerHTML = parts.length ? parts.join(` <span class="expr-op">&amp;</span> `) : "—";
}

/* ========== Filter logic ========== */
function applyFilters() {
    const f = AppState.filters;
    const q = f.search.trim().toLowerCase();

    let filtered = AppState.items.filter(it => {
        // Search: nome / sinonimos / tags
        if (q) {
            const n = it.nome.toLowerCase();
            const s = (it.sinonimos || []).some(x => x.toLowerCase().includes(q));
            const t = (it.tags || "").toLowerCase().includes(q);
            const l = (it.lista_nome || "").toLowerCase().includes(q);
            if (!n.includes(q) && !s && !t && !l) return false;
        }

        // Listas
        if (f.lists.size && !f.lists.has(it.lista_nome)) return false;
        // Tipo
        if (f.contents.size && !f.contents.has(it.conteudo)) return false;
        // Status
        if (f.statuses.size && !f.statuses.has(it.status)) return false;
        // Opiniao
        if (f.opinions.size && !f.opinions.has(it.opiniao)) return false;

        // Tags — sistema AND / OR / NOT
        if (f.tagStates.size > 0) {
            const itemTags = (it.tags || "").split(",").map(t => t.trim()).filter(Boolean);

            const andTags = [], orTags = [], notTags = [];
            for (const [tag, state] of f.tagStates.entries()) {
                if (state === "and") andTags.push(tag);
                else if (state === "or") orTags.push(tag);
                else if (state === "not") notTags.push(tag);
            }

            // AND: precisa ter TODAS
            if (andTags.length && !andTags.every(t => itemTags.includes(t))) return false;

            // OR: precisa ter PELO MENOS UMA
            if (orTags.length && !orTags.some(t => itemTags.includes(t))) return false;

            // NOT: não pode ter NENHUMA
            if (notTags.length && notTags.some(t => itemTags.includes(t))) return false;
        }

        // Extras
        if (f.hasImage === "missing" && it.imagem_url && !it.imagem_url.includes("placeholder")) return false;
        if (f.hasSinopse === "missing" && it.sinopse && it.sinopse.trim() !== "") return false;
        if (f.hasSequence === "has" && (!it.sequencias || it.sequencias.length === 0)) return false;
        if (f.hasSequence === "no" && it.sequencias && it.sequencias.length > 0) return false;

        return true;
    });

    // Sort
    filtered = sortItems(filtered, AppState.sort);

    AppState.filtered = filtered;
    renderItems();
}

function sortItems(arr, mode) {
    const a = [...arr];
    switch (mode) {
        case "name-asc":   return a.sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR", { sensitivity: "base" }));
        case "name-desc":  return a.sort((x, y) => y.nome.localeCompare(x.nome, "pt-BR", { sensitivity: "base" }));
        case "ep-asc":     return a.sort((x, y) => (parseInt(x.episodio) || 0) - (parseInt(y.episodio) || 0));
        case "ep-desc":    return a.sort((x, y) => (parseInt(y.episodio) || 0) - (parseInt(x.episodio) || 0));
        case "opinion":    return a.sort((x, y) => (OPINION_PRIORITY[x.opiniao] ?? 99) - (OPINION_PRIORITY[y.opiniao] ?? 99));
        case "recent":     return a.sort((x, y) => String(y.created_at || "").localeCompare(String(x.created_at || "")));
        case "list":       return a.sort((x, y) => (x.lista_nome || "").localeCompare(y.lista_nome || "", "pt-BR") || x.nome.localeCompare(y.nome, "pt-BR"));
    }
    return a;
}

/* ========== Render items ========== */
function renderItems() {
    const wrap = $("#items-wrap");
    const items = AppState.filtered;

    $("#count-info").textContent = `${items.length} de ${AppState.items.length} itens`;

    if (items.length === 0) {
        wrap.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><h3>Nenhum item encontrado</h3><p>Ajuste seus filtros ou limpe a busca</p></div>`;
        return;
    }

    const isGrid = AppState.view === "grid";
    wrap.innerHTML = `<div class="${isGrid ? "items-grid" : "items-list"}">${items.map(renderCard).join("")}</div>`;

    // Attach handlers
    wrap.querySelectorAll(".item-card").forEach(card => {
        const id = parseInt(card.dataset.id);
        const cb = card.querySelector(".item-checkbox");
        if (cb) {
            cb.addEventListener("click", e => e.stopPropagation());
            cb.addEventListener("change", () => toggleSelect(id));
        }
        card.addEventListener("click", e => {
            if (e.target.closest(".item-checkbox")) return;
            if (e.shiftKey && AppState.lastClickedId != null) {
                selectRange(AppState.lastClickedId, id);
            } else {
                toggleSelect(id);
                AppState.lastClickedId = id;
            }
        });
        card.addEventListener("dblclick", () => openPreview(id));
    });
}

function renderCard(it) {
    const selected = AppState.selected.has(it.id) ? "selected" : "";
    const checked = AppState.selected.has(it.id) ? "checked" : "";
    const img = it.imagem_url || "https://via.placeholder.com/300x450/1a1e28/6a7184?text=Sem+Capa";
    const tags = (it.tags || "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 4);
    const hasImg = it.imagem_url && !it.imagem_url.includes("placeholder");

    const badges = [];
    badges.push(`<span class="badge list-name"><i class="fas fa-folder"></i> ${escapeHtml(it.lista_nome)}</span>`);
    if (it.sequencias?.length) badges.push(`<span class="badge seq"><i class="fas fa-project-diagram"></i> ${it.sequencias.length}</span>`);
    if (!hasImg) badges.push(`<span class="badge missing"><i class="fas fa-image"></i></span>`);

    return `
    <div class="item-card ${selected}" data-id="${it.id}">
        <input type="checkbox" class="item-checkbox" ${checked}>
        <div class="item-badges">${badges.join("")}</div>
        <div class="item-card-image">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(it.nome)}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450/1a1e28/6a7184?text=Erro'">
        </div>
        <div class="item-card-content">
            <h3 class="item-card-title">${escapeHtml(it.nome)}</h3>
            <div class="item-card-meta">
                <span><i class="fas fa-hashtag"></i> ${escapeHtml(it.episodio || "—")}</span>
                <span>${escapeHtml(it.conteudo || "")}</span>
            </div>
            <div class="item-card-meta">
                <span>${escapeHtml(it.status || "")}</span>
                <span>${escapeHtml(it.opiniao || "")}</span>
            </div>
            ${tags.length ? `<div class="item-tags">${tags.map(t => `<span class="item-tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
        </div>
    </div>`;
}

/* ========== Selection ========== */
function toggleSelect(id) {
    if (AppState.selected.has(id)) AppState.selected.delete(id);
    else AppState.selected.add(id);
    updateSelectionUI();
}

function selectRange(fromId, toId) {
    const ids = AppState.filtered.map(i => i.id);
    const i1 = ids.indexOf(fromId), i2 = ids.indexOf(toId);
    if (i1 < 0 || i2 < 0) return;
    const [a, b] = [Math.min(i1, i2), Math.max(i1, i2)];
    for (let i = a; i <= b; i++) AppState.selected.add(ids[i]);
    updateSelectionUI();
}

function updateSelectionUI() {
    const bar = $("#bulk-bar");
    const count = AppState.selected.size;
    $("#bulk-count-text").textContent = count;
    bar.classList.toggle("hidden", count === 0);

    document.querySelectorAll(".item-card").forEach(card => {
        const id = parseInt(card.dataset.id);
        const cb = card.querySelector(".item-checkbox");
        const sel = AppState.selected.has(id);
        card.classList.toggle("selected", sel);
        if (cb) cb.checked = sel;
    });
}

function clearSelection() {
    AppState.selected.clear();
    updateSelectionUI();
}

/* ========== Bulk Modal ========== */
function openBulkModal(op) {
    const ids = [...AppState.selected];
    if (ids.length === 0) return;

    const panel = $("#modal-panel");
    const overlay = $("#modal-overlay");

    // ============================================================
    // ANÁLISE DOS ITENS SELECIONADOS
    // ============================================================
    const selectedItems = AppState.items.filter(i => ids.includes(i.id));
    const isSingle = ids.length === 1;
    const singleItem = isSingle ? selectedItems[0] : null;

    // Tags presentes em pelo menos um dos selecionados
    const tagsInSelected = new Set();
    selectedItems.forEach(it => (it.tags || "").split(",").forEach(t => {
        const v = t.trim(); if (v) tagsInSelected.add(v);
    }));
    const tagsInSelectedSorted = [...tagsInSelected].sort((a, b) => a.localeCompare(b, "pt-BR"));

    // Todas as tags do sistema (para sugestão de "adicionar")
    const allTagsGlobal = [...new Set(
        AppState.items.flatMap(i => (i.tags || "").split(",").map(t => t.trim()).filter(Boolean))
    )].sort((a, b) => a.localeCompare(b, "pt-BR"));

    // Sugestões de ADICIONAR:
    //   - 1 item: tags que ele NÃO tem
    //   - vários: todas as tags do sistema
    const addSuggestions = isSingle
        ? allTagsGlobal.filter(t => !tagsInSelected.has(t))
        : allTagsGlobal;

    // Sugestões de REMOVER:
    //   - 1 item: tags que ele TEM
    //   - vários: união das tags dos selecionados
    const removeSuggestions = tagsInSelectedSorted;

    // ============================================================

    let body = "";
    let footer = "";

    const mkChips = (id) =>
        `<div class="chip-input" id="${id}">
            <input type="text" placeholder="Digite e pressione Enter...">
            <div class="chips"></div>
         </div>`;

    switch (op) {
        // ------------------------------------------------------------
        case "tags-add": {
            const headerText = isSingle
                ? `Adicionar tags a <strong>${escapeHtml(singleItem.nome)}</strong>`
                : `Adicionar uma ou mais tags aos <strong>${ids.length}</strong> itens selecionados`;

            body = `
                <p style="margin:0 0 12px;color:var(--text-dim);font-size:.85rem;">${headerText}</p>
                <label class="form-label">Tags</label>
                ${mkChips("bulk-chips")}
                <div class="suggestions"
                     style="max-height:220px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;">
                    ${addSuggestions.length === 0
                        ? `<span style="color:var(--text-dim);font-size:.85rem;">
                             ${isSingle ? "Este item já possui todas as tags do sistema." : "Nenhuma tag cadastrada no sistema."}
                           </span>`
                        : addSuggestions.slice(0, 200).map(t =>
                            `<span class="tag-chip suggest" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`
                        ).join("")}
                </div>
            `;
            footer = `
                <button class="btn" data-close>Cancelar</button>
                <div class="right">
                    <button class="btn primary" data-apply="add_tags">Adicionar</button>
                </div>
            `;
            break;
        }

        // ------------------------------------------------------------
        case "tags-remove": {
            if (isSingle) {
                // ---- MODO 1 ITEM: checklist das tags atuais ----
                body = `
                    <p style="margin:0 0 12px;color:var(--text-dim);font-size:.85rem;">
                        Remover tags de <strong>${escapeHtml(singleItem.nome)}</strong>
                    </p>
                    <label class="form-label">Tags atuais (${removeSuggestions.length})</label>
                    ${removeSuggestions.length === 0
                        ? `<p style="color:var(--text-dim);font-size:.85rem;">Este item não possui tags.</p>`
                        : `<div id="remove-checklist"
                                style="display:flex;flex-wrap:wrap;gap:6px;max-height:280px;overflow-y:auto;padding:4px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);">
                             ${removeSuggestions.map(t => `
                                <label class="tag-chip"
                                       style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:5px 10px;">
                                    <input type="checkbox" value="${escapeHtml(t)}"
                                           style="accent-color:var(--danger);">
                                    ${escapeHtml(t)}
                                </label>
                             `).join("")}
                           </div>`}
                `;
                footer = `
                    <button class="btn" data-close>Cancelar</button>
                    <div class="right">
                        <button class="btn danger" data-apply="remove_tags"
                                ${removeSuggestions.length === 0 ? "disabled" : ""}>
                            Remover selecionadas
                        </button>
                    </div>
                `;
            } else {
                // ---- MODO VÁRIOS ITENS: campo livre + sugestões ----
                body = `
                    <p style="margin:0 0 12px;color:var(--text-dim);font-size:.85rem;">
                        Remover tags dos <strong>${ids.length}</strong> itens selecionados
                    </p>
                    <label class="form-label">Tags</label>
                    ${mkChips("bulk-chips")}
                    <div class="suggestions"
                         style="max-height:220px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;">
                        ${removeSuggestions.length === 0
                            ? `<span style="color:var(--text-dim);font-size:.85rem;">Nenhum dos itens selecionados possui tags.</span>`
                            : removeSuggestions.map(t =>
                                `<span class="tag-chip suggest" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`
                              ).join("")}
                    </div>
                `;
                footer = `
                    <button class="btn" data-close>Cancelar</button>
                    <div class="right">
                        <button class="btn danger" data-apply="remove_tags">Remover</button>
                    </div>
                `;
            }
            break;
        }

        // ------------------------------------------------------------
        case "status":
            body = `<label class="form-label">Novo status</label>
                    <select class="form-select" id="bulk-value">${STATUSES.map(s => `<option>${s}</option>`).join("")}</select>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn primary" data-apply="set_status">Aplicar</button></div>`;
            break;

        case "opiniao":
            body = `<label class="form-label">Nova opinião</label>
                    <select class="form-select" id="bulk-value">${OPINIONS.map(s => `<option>${s}</option>`).join("")}</select>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn primary" data-apply="set_opiniao">Aplicar</button></div>`;
            break;

        case "conteudo":
            body = `<label class="form-label">Novo tipo</label>
                    <select class="form-select" id="bulk-value">${CONTENT_TYPES.map(s => `<option>${s}</option>`).join("")}</select>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn primary" data-apply="set_conteudo">Aplicar</button></div>`;
            break;

        case "episodio":
            body = `<label class="form-check" style="margin-bottom:12px;">
                        <input type="radio" name="ep-mode" value="set" checked> Definir
                    </label>
                    <input type="number" class="form-input" id="ep-set" placeholder="Ex: 12" style="margin-bottom:16px;">
                    <label class="form-check" style="margin-bottom:12px;">
                        <input type="radio" name="ep-mode" value="inc"> Incrementar
                    </label>
                    <input type="number" class="form-input" id="ep-inc" placeholder="Ex: +1" value="1" disabled>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn primary" data-apply="set_episodio">Aplicar</button></div>`;
            break;

        case "move":
            body = `<label class="form-label">Mover para lista</label>
                    <select class="form-select" id="bulk-value">${AppState.listas.map(l => `<option value="${l.id}">${escapeHtml(l.nome)}</option>`).join("")}</select>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn primary" data-apply="move_to_lista">Mover</button></div>`;
            break;

        case "seq-add":
            body = `<label class="form-label">Adicionar à sequência</label>
                    <select class="form-select" id="bulk-value">${AppState.sequencias.map(l => `<option value="${l.id}">${escapeHtml(l.nome)}</option>`).join("")}</select>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn primary" data-apply="add_to_sequence">Adicionar</button></div>`;
            break;

        case "seq-rm":
            body = `<label class="form-label">Remover da sequência</label>
                    <select class="form-select" id="bulk-value">${AppState.sequencias.map(l => `<option value="${l.id}">${escapeHtml(l.nome)}</option>`).join("")}</select>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn danger" data-apply="remove_from_sequence">Remover</button></div>`;
            break;

        case "refresh":
            body = `<p style="margin:0;color:var(--text-dim);font-size:.85rem;">Buscar imagem, sinopse e sinônimos novamente para ${ids.length} itens?<br>Isso pode demorar alguns segundos.</p>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn primary" data-apply="refresh_media">Atualizar</button></div>`;
            break;

        case "delete":
            body = `<p style="margin:0;color:var(--danger);font-size:.9rem;font-weight:600;">⚠️ Você está prestes a excluir ${ids.length} itens.</p>
                    <p style="color:var(--text-dim);font-size:.82rem;margin-top:8px;">Esta ação não pode ser desfeita.</p>`;
            footer = `<button class="btn" data-close>Cancelar</button>
                      <div class="right"><button class="btn danger" data-apply="delete">Excluir Definitivamente</button></div>`;
            break;
    }

    panel.innerHTML = `
        <header>
            <h3>Ação em massa · ${ids.length} item(ns)</h3>
            <button class="close-x" data-close>×</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer>${footer}</footer>
    `;

    overlay.classList.remove("hidden");

    // ---- Chip input (só existe quando NÃO é o caso single-remove) ----
    const chipsWrap = panel.querySelector("#bulk-chips");
    if (chipsWrap) setupChipInput(chipsWrap);

    // ---- Clique nas sugestões: joga a tag dentro do chip input ----
    if (chipsWrap) {
        panel.querySelectorAll(".tag-chip.suggest").forEach(chip => {
            chip.addEventListener("click", () => {
                const inp = chipsWrap.querySelector("input");
                inp.value = chip.dataset.tag;
                inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
            });
        });
    }

    // ---- Modo episódio ----
    if (op === "episodio") {
        const setInp = panel.querySelector("#ep-set");
        const incInp = panel.querySelector("#ep-inc");
        panel.querySelectorAll('input[name="ep-mode"]').forEach(r => {
            r.addEventListener("change", () => {
                const isSet = panel.querySelector('input[name="ep-mode"]:checked').value === "set";
                setInp.disabled = !isSet; incInp.disabled = isSet;
            });
        });
    }

    // ---- Close handlers ----
    const close = () => { overlay.classList.add("hidden"); panel.innerHTML = ""; };
    panel.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    const escHandler = e => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); } };
    document.addEventListener("keydown", escHandler);

    // ---- Apply ----
    panel.querySelector("[data-apply]")?.addEventListener("click", async () => {
        const action = panel.querySelector("[data-apply]").dataset.apply;
        let operation;

        if (action === "add_tags") {
            const tags = getChips(panel);
            if (!tags.length) return toast("Adicione ao menos uma tag", "error");
            operation = { type: action, value: tags };

        } else if (action === "remove_tags") {
            let tags;
            if (isSingle) {
                // lê das checkboxes do checklist
                tags = Array.from(
                    panel.querySelectorAll('#remove-checklist input[type="checkbox"]:checked')
                ).map(c => c.value);
            } else {
                tags = getChips(panel);
            }
            if (!tags.length) return toast("Selecione ao menos uma tag", "error");
            operation = { type: action, value: tags };

        } else if (action === "set_episodio") {
            const mode = panel.querySelector('input[name="ep-mode"]:checked').value;
            const val = mode === "set"
                ? panel.querySelector("#ep-set").value
                : panel.querySelector("#ep-inc").value;
            operation = {
                type: mode === "set" ? "set_episodio" : "increment_episodio",
                value: parseInt(val) || 0
            };

        } else if (["move_to_lista", "add_to_sequence", "remove_from_sequence"].includes(action)) {
            const v = panel.querySelector("#bulk-value").value;
            operation = { type: action, value: parseInt(v) };

        } else if (action === "refresh_media") {
            operation = { type: "refresh_media" };

        } else if (action === "delete") {
            if (!confirm(`Excluir ${ids.length} item(ns)? Isso não pode ser desfeito.`)) return;
            operation = { type: "delete" };

        } else {
            operation = { type: action, value: panel.querySelector("#bulk-value").value };
        }

        await applyBulk(ids, [operation]);
        close();
    });
}

function setupChipInput(wrap) {
    const inp = wrap.querySelector("input");
    const chipsBox = wrap.querySelector(".chips");
    const chips = [];

    const addChip = (val) => {
        val = val.trim(); if (!val || chips.includes(val)) return;
        chips.push(val);
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `${escapeHtml(val)} <button type="button">×</button>`;
        chip.querySelector("button").addEventListener("click", () => {
            const i = chips.indexOf(val); if (i > -1) chips.splice(i, 1);
            chip.remove();
        });
        chipsBox.appendChild(chip);
    };

    inp.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addChip(inp.value);
            inp.value = "";
        } else if (e.key === "Backspace" && !inp.value && chips.length) {
            const last = chipsBox.lastChild;
            if (last) { last.querySelector("button")?.click(); }
        }
    });

    wrap._getChips = () => [...chips];
}

function getChips(panel) {
    const wrap = panel.querySelector("#bulk-chips");
    return wrap?._getChips ? wrap._getChips() : [];
}

async function applyBulk(ids, operations) {
    try {
        const res = await fetch("/admin/bulk-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item_ids: ids, operations }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro");

        if (data.errors?.length) {
            toast(`${data.updated} atualizados, ${data.errors.length} erro(s)`, "error");
            console.warn(data.errors);
        } else {
            toast(`${data.updated} item(ns) atualizado(s)`, "success");
        }

        clearSelection();
        await loadData();
    } catch (e) {
        console.error(e);
        toast("Erro: " + e.message, "error");
    }
}

/* ========== Dup finder ========== */
function findDuplicates() {
    const groups = {};
    AppState.items.forEach(i => {
        const k = normalize(i.nome);
        (groups[k] = groups[k] || []).push(i);
    });
    const dups = Object.values(groups).filter(g => g.length > 1);

    const panel = $("#modal-panel");
    const overlay = $("#modal-overlay");

    panel.innerHTML = `
        <header>
            <h3>Possíveis duplicados (${dups.length} grupo${dups.length!==1?"s":""})</h3>
            <button class="close-x" data-close>×</button>
        </header>
        <div class="modal-body">
            ${dups.length === 0 ? '<p style="color:var(--text-dim);">Nenhum duplicado encontrado. 🎉</p>' :
                dups.map(g => `
                    <div style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;padding:10px;">
                        <div style="font-size:.72rem;color:var(--text-dim);margin-bottom:6px;">NORMALIZADO: ${escapeHtml(normalize(g[0].nome))}</div>
                        ${g.map(i => `
                            <label class="filter-item" style="display:flex;gap:10px;align-items:center;">
                                <input type="checkbox" class="dup-cb" value="${i.id}" checked>
                                <img src="${escapeHtml(i.imagem_url || "")}" style="width:32px;height:44px;object-fit:cover;border-radius:4px;" onerror="this.style.display='none'">
                                <span>#${i.id} · ${escapeHtml(i.nome)} <span style="color:var(--text-dim);font-size:.75rem;">(${escapeHtml(i.lista_nome)})</span></span>
                            </label>
                        `).join("")}
                    </div>
                `).join("")}
        </div>
        <footer>
            <button class="btn" data-close>Fechar</button>
            <div class="right">
                ${dups.length ? `<button class="btn danger" id="dup-delete">Excluir selecionados</button>` : ""}
            </div>
        </footer>
    `;
    overlay.classList.remove("hidden");

    const close = () => { overlay.classList.add("hidden"); panel.innerHTML = ""; };
    panel.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    panel.querySelector("#dup-delete")?.addEventListener("click", async () => {
        const ids = Array.from(panel.querySelectorAll(".dup-cb:checked")).map(c => parseInt(c.value));
        if (!ids.length) return;
        if (!confirm(`Excluir ${ids.length} item(ns)?`)) return;
        await applyBulk(ids, [{ type: "delete" }]);
        close();
    });
}

/* ========== Preview (open in main app) ========== */
function openPreview(id) {
    // Opcional: abrir em nova aba a lista que contém o item
    const item = AppState.items.find(i => i.id === id);
    if (!item) return;
    window.open(`/?list=${item.lista_id}&item=${item.id}`, "_blank");
}

/* ========== Export JSON ========== */
function exportSelectedJSON() {
    const ids = [...AppState.selected];
    const data = AppState.items.filter(i => ids.includes(i.id));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `itens-selecionados-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast(`${data.length} itens exportados`, "success");
}

/* ========== Init ========== */
function init() {
    // Theme
    const savedTheme = localStorage.getItem("admin-theme") || "dark";
    if (savedTheme === "light") document.body.setAttribute("data-theme", "light");

    $("#btn-theme").addEventListener("click", () => {
        const isLight = document.body.getAttribute("data-theme") === "light";
        document.body.setAttribute("data-theme", isLight ? "dark" : "light");
        localStorage.setItem("admin-theme", isLight ? "dark" : "light");
    });

    $("#btn-refresh").addEventListener("click", loadData);
    $("#btn-dup").addEventListener("click", findDuplicates);

    // Search
    const search = $("#global-search");
    search.addEventListener("input", debounce(() => {
        AppState.filters.search = search.value;
        applyFilters();
    }, 200));

    // Ctrl/Cmd + K
    document.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            search.focus();
            search.select();
        }
        if (e.key === "Escape" && document.activeElement === search) {
            search.value = ""; AppState.filters.search = ""; applyFilters(); search.blur();
        }
    });

    // Select all / clear
    $("#btn-select-all").addEventListener("click", () => {
        AppState.filtered.forEach(i => AppState.selected.add(i.id));
        updateSelectionUI();
    });
    $("#btn-clear-sel").addEventListener("click", clearSelection);

    // Sort
    $("#sort-select").addEventListener("change", e => {
        AppState.sort = e.target.value;
        applyFilters();
    });

    // View
    $$(".view-toggle button").forEach(b => {
        b.addEventListener("click", () => {
            $$(".view-toggle button").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
            AppState.view = b.dataset.view;
            renderItems();
        });
    });

    // Clear filters
    $("#btn-clear-filters").addEventListener("click", () => {
        AppState.filters = {
            search: $("#global-search").value = "",
            lists: new Set(), contents: new Set(), statuses: new Set(), opinions: new Set(),
            tagStates: new Map(),
            hasSequence: null, hasImage: null, hasSinopse: null,
        };
        renderFilters();
        applyFilters();
    });

    // Bulk bar actions
    $$("#bulk-bar .bulk-actions button").forEach(btn => {
        btn.addEventListener("click", () => {
            const op = btn.dataset.op;
            if (op === "export") return exportSelectedJSON();
            openBulkModal(op);
        });
    });

    loadData();
}

document.addEventListener("DOMContentLoaded", init);