#!/usr/bin/env python3
"""
cli.py — CLI interativo (atualizado com sort_* na camada open_)
- Pergunta QUANTOS ITENS POR PÁGINA antes de mostrar resultados (máx 15)
- Paginação: next, prev, número da página
- sort_0-9, sort_9-0, sort_a-z, sort_z-a, sort_rate (aplica sobre a exibição atual)
- Robustez: normaliza tags/opiniões (case + acentos)
"""

import os
import shlex
import sys
import time
import threading
import unicodedata
import random
from openpyxl import Workbook
from openpyxl.styles import PatternFill

try:
    import requests
except Exception:
    print("Dependência 'requests' não encontrada. Instale com: pip install requests")
    sys.exit(1)

API_BASE = os.environ.get("API_BASE", "http://localhost:5000")
PROMPT_MAIN = "menu> "

OPINIAO_PRIORIDADES = {
    "Favorito": 0,
    "Muito Bom": 1,
    "Recomendo": 2,
    "Bom": 3,
    "Mediano": 4,
    "Ruim": 5,
    "Horrível": 6,
    "Horrivel": 6,
    "Não Vi": 7,
    "Nao Vi": 7
}

# -------------------------
# Utilitários visuais/UX
# -------------------------
def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")

def spinner_worker(text, stop_event):
    symbols = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
    i = 0
    while not stop_event.is_set():
        sys.stdout.write(f"\r{text} {symbols[i % len(symbols)]}")
        sys.stdout.flush()
        time.sleep(0.12)
        i += 1
    sys.stdout.write("\r" + " " * (len(text) + 6) + "\r")
    sys.stdout.flush()

def with_minimum_spinner(fn, text="Processando", min_seconds=0.5, *args, **kwargs):
    stop_event = threading.Event()
    t = threading.Thread(target=spinner_worker, args=(text, stop_event), daemon=True)
    start = time.time()
    t.start()
    try:
        result = fn(*args, **kwargs)
    finally:
        elapsed = time.time() - start
        remaining = max(0, min_seconds - elapsed)
        if remaining > 0:
            time.sleep(remaining)
        stop_event.set()
        t.join()
    return result

def typewriter_print(text, speed=0.002):
    for ch in str(text):
        sys.stdout.write(ch)
        sys.stdout.flush()
        time.sleep(speed)
    sys.stdout.write("\n")
    sys.stdout.flush()

def fancy_header(lines):
    clear_screen()
    print("=" * 80)
    for ln in lines:
        typewriter_print(ln, speed=0.004)
    print("=" * 80)

# -------------------------
# Helpers: normalização
# -------------------------
def _strip_accents(s: str) -> str:
    if not isinstance(s, str):
        return ""
    nk = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in nk if not unicodedata.combining(ch))

def _norm(s: str) -> str:
    """Lowercase + remove acentos + strip"""
    if not isinstance(s, str):
        return ""
    return _strip_accents(s).lower().strip()

def search_items(itens, termo):
    termo_norm = _norm(termo)
    resultados = []
    for it in itens:
        if not isinstance(it, dict):
            continue
        nome = it.get("nome") or it.get("name") or ""
        if termo_norm in _norm(nome):
            resultados.append(it)
    return resultados

def _split_tags_field(tags_field):
    """Dado campo tags (string), retorna lista de tags normalizadas"""
    if not isinstance(tags_field, str):
        return []
    parts = [p.strip() for p in tags_field.split(",") if p.strip()]
    return [(_norm(p), p) for p in parts]  # (normalized, original)

def tags_contains(item, tag_check):
    """Checa se item (dict) tem tag igual a tag_check (case/acentos-insensitive)"""
    if not isinstance(item, dict):
        return False
    tags_field = item.get("tags") or ""
    norm_tag_check = _norm(tag_check)
    for norm, orig in _split_tags_field(tags_field):
        if norm == norm_tag_check:
            return True
    return False

# -------------------------
# HTTP Requests
# -------------------------
def fetch_lists_request():
    url = f"{API_BASE.rstrip('/')}/listas"
    try:
        r = requests.get(url, timeout=6)
        if r.status_code >= 400:
            return None, f"Erro {r.status_code}: {r.text}"
        return r.json(), None
    except Exception as e:
        return None, f"Erro de rede: {e}"

def fetch_lines_request(list_id):
    url = f"{API_BASE.rstrip('/')}/linhas/{list_id}"
    try:
        r = requests.get(url, timeout=8)
        if r.status_code >= 400:
            return None, f"Erro {r.status_code}: {r.text}"
        return r.json(), None
    except Exception as e:
        return None, f"Erro de rede: {e}"

# -------------------------
# Paginação (com pedido ANTES)
# -------------------------
class PaginatedDisplay:
    def __init__(self, items, title, items_per_page=None):
        self.items = items or []
        self.title = title
        self.items_per_page = None if items_per_page is None else self._clamp(items_per_page)
        self.pagination_confirmed = self.items_per_page is not None
        self.current_page = 1
        self.total_pages = 1

    def _clamp(self, n):
        try:
            n = int(n)
        except Exception:
            return 5
        if n < 1:
            return 1
        return min(15, n)

    def _recalc_pages(self):
        ipp = self.items_per_page or 5
        self.total_pages = max(1, (len(self.items) + ipp - 1) // ipp)
        self.current_page = max(1, min(self.current_page, self.total_pages))

    def ask_items_per_page(self):
        prompt_default = 5
        while True:
            try:
                raw = input(f"Quantos itens por página? [1-15] (enter={prompt_default}): ").strip()
            except (KeyboardInterrupt, EOFError):
                print()
                raw = ""
            if raw == "":
                chosen = prompt_default
                break
            try:
                chosen = int(raw)
            except Exception:
                print("Entrada inválida — informe um número entre 1 e 15.")
                continue
            if 1 <= chosen <= 15:
                break
            else:
                print("Valor fora do intervalo. Informe entre 1 e 15.")
        return chosen

    def render_page(self, page_num=None):
        if not self.pagination_confirmed:
            chosen = self.ask_items_per_page()
            self.items_per_page = self._clamp(chosen)
            self.pagination_confirmed = True
            self._recalc_pages()

        if page_num:
            try:
                self.current_page = max(1, int(page_num))
            except Exception:
                self.current_page = 1

        self._recalc_pages()
        start_idx = (self.current_page - 1) * self.items_per_page
        end_idx = start_idx + self.items_per_page
        page_items = self.items[start_idx:end_idx]

        fancy_header([
            "════════════════════════════════════════════════════════════════════════════════",
            f"         {self.title}",
            f"         Página {self.current_page} de {self.total_pages}  (itens/pg: {self.items_per_page})",
            "════════════════════════════════════════════════════════════════════════════════",
        ])

        if not page_items:
            typewriter_print("(nenhum item encontrado nesta seleção)", speed=0.004)
        else:
            for idx, item in enumerate(page_items, start=start_idx + 1):
                self._pretty_print_item(idx, item)

        # Rodapé
        print("-" * 80)
        typewriter_print(self._compact_page_display(), speed=0.003)
        typewriter_print("Navegue com 'next', 'prev' ou digite o número da página. Use 'back' para voltar.", speed=0.003)
        typewriter_print(f"Total: {len(self.items)} itens. (mostrando {self.items_per_page} por página)", speed=0.003)
        print("=" * 80)

    def _compact_page_display(self):
        if self.total_pages <= 12:
            parts = []
            for p in range(1, self.total_pages + 1):
                parts.append(f"[{p}]" if p == self.current_page else str(p))
            return " ".join(parts)
        parts = []
        parts.append("1" if self.current_page != 1 else "[1]")
        if self.current_page > 4:
            parts.append("...")
        start = max(2, self.current_page - 2)
        end = min(self.total_pages - 1, self.current_page + 2)
        for p in range(start, end + 1):
            parts.append(f"[{p}]" if p == self.current_page else str(p))
        if self.current_page < self.total_pages - 3:
            parts.append("...")
        parts.append(str(self.total_pages) if self.current_page != self.total_pages else f"[{self.total_pages}]")
        return " ".join(parts)

    def _pretty_print_item(self, idx, item):
        if isinstance(item, dict):
            name = item.get("nome") or item.get("name") or str(item.get("id", "N/A"))
            extra_info = []
            if item.get("status"):
                extra_info.append(f"Status: {item['status']}")
            if extra_info:
                name += f" [{', '.join(extra_info)}]"
        else:
            name = str(item)
        typewriter_print(f"{idx}. {name}", speed=0.002)

    def handle_command(self, cmd, args):
        cmd = str(cmd).strip().lower()
        if cmd == "next" and self.current_page < self.total_pages:
            self.render_page(self.current_page + 1)
            return True
        if cmd == "prev" and self.current_page > 1:
            self.render_page(self.current_page - 1)
            return True
        if cmd.isdigit():
            page_num = int(cmd)
            if 1 <= page_num <= self.total_pages:
                self.render_page(page_num)
                return True
        return False

    # -------------------------
    # Sorting: aplica sobre self.items e re-renderiza (se necessário)
    # -------------------------
    def apply_sort(self, method):
        """
        method: one of "0-9","9-0","a-z","z-a","rate"
        Retorna mensagem de confirmação ou erro.
        """
        if not self.items:
            return "Nenhum item para ordenar."

        method = method.lower()
        try:
            if method == "0-9":
                # ordenar por id crescente (tenta int)
                def key_id(x):
                    if isinstance(x, dict):
                        v = x.get("id", x.get("Id", None))
                    else:
                        v = x
                    try:
                        return int(v)
                    except Exception:
                        return _norm(str(v))
                self.items = sorted(self.items, key=key_id)
                self.current_page = 1
                return "Ordenado por id crescente (0-9)."

            if method == "9-0":
                def key_id(x):
                    if isinstance(x, dict):
                        v = x.get("id", x.get("Id", None))
                    else:
                        v = x
                    try:
                        return int(v)
                    except Exception:
                        return _norm(str(v))
                self.items = sorted(self.items, key=key_id, reverse=True)
                self.current_page = 1
                return "Ordenado por id decrescente (9-0)."

            if method == "a-z":
                def key_name(x):
                    if isinstance(x, dict):
                        return _norm(x.get("nome") or x.get("name") or str(x.get("id","")))
                    return _norm(str(x))
                self.items = sorted(self.items, key=key_name)
                self.current_page = 1
                return "Ordenado A→Z."

            if method == "z-a":
                def key_name(x):
                    if isinstance(x, dict):
                        return _norm(x.get("nome") or x.get("name") or str(x.get("id","")))
                    return _norm(str(x))
                self.items = sorted(self.items, key=key_name, reverse=True)
                self.current_page = 1
                return "Ordenado Z→A."

            if method in ("rate", "rate -r"):
                opiniao_order = ["Favorito", "Muito Bom", "Recomendo", "Bom", "Mediano", "Ruim", "Horrivel", "Horrível", "Não Vi", "Nao Vi"]

                def get_priority(item):
                    tags_field = item.get("tags") if isinstance(item, dict) else ""
                    tags_norm = [t for (t, orig) in _split_tags_field(tags_field)]
                    def has_tag(t): return _norm(t) in tags_norm

                    has_relation = any(has_tag(x) for x in ("namoro", "casamento", "noivado"))
                    is_bestlove = has_tag("goat") and has_tag("beijo") and has_tag("romance do bom") and has_relation
                    if is_bestlove:
                        return 0
                    is_love = (has_tag("beijo") and has_tag("romance do bom") and has_relation)
                    if is_love and has_tag("goat"):
                        return 1
                    if has_tag("goat"):
                        return 2
                    opiniao_raw = item.get("opiniao") if isinstance(item, dict) else ""
                    opiniao_norm = _norm(opiniao_raw)
                    if is_love and opiniao_norm == _norm("Favorito"):
                        return 3
                    for idx, op in enumerate(opiniao_order):
                        if _norm(op) == opiniao_norm:
                            return 4 + idx
                    return 99

                def key_rate(x):
                    try:
                        return (get_priority(x), _norm(x.get("nome") or x.get("name") or str(x.get("id",""))))
                    except Exception:
                        return (99, _norm(str(x)))

                reverse = (method == "rate -r")
                self.items = sorted(self.items, key=key_rate, reverse=reverse)
                self.current_page = 1
                return "Ordenado por 'rate' (reverse)." if reverse else "Ordenado por 'rate'."

            return "Método de ordenação desconhecido."
        except Exception as e:
            return f"Erro ao ordenar: {e}"

# -------------------------
# Funções auxiliares de filtro e parser (mantive as anteriores)
# -------------------------
def extrair_tags_dos_itens(itens):
    todas_tags = set()
    for item in itens:
        if isinstance(item, dict) and item.get("tags"):
            tags = [tag.strip() for tag in item["tags"].split(",") if tag.strip()]
            todas_tags.update(tags)
    return sorted(todas_tags)

def filtrar_por_tag(itens, tag_procurada):
    tag_procurada = tag_procurada.lower()
    resultados = []
    for item in itens:
        if isinstance(item, dict) and item.get("tags"):
            tags_item = [tag.strip().lower() for tag in item["tags"].split(",")]
            if tag_procurada in tags_item:
                resultados.append(item)
    return resultados

def filtrar_por_status(itens, status_procurado):
    status_procurado = status_procurado.lower()
    return [it for it in itens if isinstance(it, dict) and it.get("status","").lower() == status_procurado]

def filtrar_por_opiniao(itens, opiniao_procurada):
    opiniao_procurada = opiniao_procurada.lower()
    return [it for it in itens if isinstance(it, dict) and it.get("opiniao","").lower() == opiniao_procurada]

def filtrar_por_comparacao_opiniao(itens, expressao):
    operadores = [">=", "<=", ">", "<", "="]
    operador = None
    opiniao_ref = expressao
    for op in operadores:
        if expressao.startswith(op):
            operador = op
            opiniao_ref = expressao[len(op):].strip()
            break
    if opiniao_ref not in OPINIAO_PRIORIDADES:
        return []
    valor_ref = OPINIAO_PRIORIDADES[opiniao_ref]
    resultados = []
    for item in itens:
        if not isinstance(item, dict) or "opiniao" not in item:
            continue
        opiniao_item = item["opiniao"]
        if opiniao_item not in OPINIAO_PRIORIDADES:
            continue
        valor_item = OPINIAO_PRIORIDADES[opiniao_item]
        if operador == ">":
            if valor_item < valor_ref:
                resultados.append(item)
        elif operador == ">=":
            if valor_item <= valor_ref:
                resultados.append(item)
        elif operador == "<":
            if valor_item > valor_ref:
                resultados.append(item)
        elif operador == "<=":
            if valor_item >= valor_ref:
                resultados.append(item)
        elif operador == "=" or operador is None:
            if valor_item == valor_ref:
                resultados.append(item)
    return resultados

def parse_search_expression(expr_str):
    import shlex
    if not expr_str:
        return {
            "required_tags": set(),
            "excluded_tags": set(),
            "statuses": set(),
            "content_types": set(),
            "opiniao_cmp": None
        }
    CONTENT_TYPES = {"anime", "filme", "manga", "manhwa", "webtoon"}
    STATUS_SET = {"concluido", "vendo", "cancelado", "dropado", "lendo", "assistir", "conheço", "assistindo", "finished"}
    tokens = shlex.split(expr_str)
    required_tags = set()
    excluded_tags = set()
    content_types = set()
    statuses = set()
    opiniao_cmp = None
    opiniao_map = {k.casefold(): k for k in OPINIAO_PRIORIDADES.keys()}
    i = 0
    while i < len(tokens):
        tk = tokens[i]
        i += 1
        for op in (">=", "<=", ">", "<", "="):
            if tk.startswith(op):
                val = tk[len(op):].strip()
                if not val and i < len(tokens):
                    val = tokens[i]; i += 1
                key = val.casefold()
                if key in opiniao_map:
                    opiniao_cmp = op + opiniao_map[key]
                else:
                    opiniao_cmp = op + val
                tk = None
                break
        if tk is None:
            continue
        if tk.startswith("+") or tk.startswith("-"):
            sign = tk[0]
            val = tk[1:].strip()
            if "|" in val:
                parts = [p.strip().casefold() for p in val.split("|") if p.strip()]
                for p in parts:
                    if p in CONTENT_TYPES:
                        content_types.add(p)
                    elif p in STATUS_SET:
                        statuses.add(p)
                    elif p in opiniao_map:
                        opiniao_cmp = "=" + opiniao_map[p]
                continue
            plain = val.replace("_", " ").strip()
            low = plain.casefold()
            if low in CONTENT_TYPES:
                if sign == "+":
                    content_types.add(low)
                else:
                    excluded_tags.add(f"__conteudo__:{low}")
                continue
            if low in STATUS_SET:
                if sign == "+":
                    statuses.add(low)
                continue
            if low in opiniao_map:
                if sign == "+":
                    opiniao_cmp = "=" + opiniao_map[low]
                continue
            if sign == "+":
                required_tags.add(low)
            else:
                excluded_tags.add(low)
            continue
        plain = tk.replace("_", " ").strip()
        low = plain.casefold()
        if "|" in tk:
            parts = [p.strip().casefold() for p in tk.split("|") if p.strip()]
            for p in parts:
                if p in CONTENT_TYPES:
                    content_types.add(p)
                else:
                    required_tags.add(p)
            continue
        if low in CONTENT_TYPES:
            content_types.add(low)
            continue
        if low in STATUS_SET:
            statuses.add(low)
            continue
        if low in opiniao_map:
            opiniao_cmp = "=" + opiniao_map[low]
            continue
        required_tags.add(low)
    return {
        "required_tags": required_tags,
        "excluded_tags": excluded_tags,
        "statuses": statuses,
        "content_types": content_types,
        "opiniao_cmp": opiniao_cmp
    }

# -------------------------
# OpenListContext (com integração a PaginatedDisplay e sort)
# -------------------------
class OpenListContext:
    def __init__(self, list_obj):
        self.list_obj = list_obj
        self.id = str(list_obj.get("id") or "")
        self.name = list_obj.get("nome") or self.id or "lista"
        self.lines = []
        self.current_display = None

    def fetch_and_cache_lines(self):
        lines, err = with_minimum_spinner(lambda: fetch_lines_request(self.id), text=f"Buscando linhas da lista '{self.name}'...", min_seconds=0.6)
        if err:
            return False, err
        if not isinstance(lines, list):
            return False, "Resposta inesperada."
        def keyfn(it):
            if isinstance(it, dict):
                return (it.get("nome") or it.get("name") or "").casefold()
            return str(it).casefold()
        self.lines = sorted(lines, key=keyfn)
        return True, None
    
    def open_item_by_index(self, one_based_index):
        """
        Retorna um ItemContext para o item na posição one_based_index
        (1-based) da exibição atual (current_display.items) ou da lista completa.
        """
        items = None
        if getattr(self, "current_display", None) and getattr(self.current_display, "items", None):
            items = self.current_display.items
        else:
            items = self.lines
        try:
            idx = int(one_based_index)
        except Exception:
            return None, "Índice inválido."
        if idx < 1 or idx > len(items):
            return None, f"Índice fora do intervalo (1..{len(items)})"
        item = items[idx - 1]
        return ItemContext(self, item, idx), None

    def search_items_by_name(self, termo):
        itens = search_items(self.lines, termo)
        titulo = f"RESULTADOS DE BUSCA: \"{termo}\" - {self.name}"
        self.current_display = PaginatedDisplay(itens, titulo, items_per_page=None)
        self.current_display.render_page()

    def show_lines(self, filtro_expresao=None):
        itens = list(self.lines)
        parsed = parse_search_expression(filtro_expresao) if filtro_expresao else None
        if parsed:
            if parsed["content_types"]:
                allowed = set(parsed["content_types"])
                itens = [it for it in itens if isinstance(it, dict) and it.get("conteudo") and it.get("conteudo").casefold() in allowed]
            if parsed["opiniao_cmp"]:
                itens = filtrar_por_comparacao_opiniao(itens, parsed["opiniao_cmp"])
            if parsed["statuses"]:
                sts = set(parsed["statuses"])
                itens = [it for it in itens if isinstance(it, dict) and it.get("status","").casefold() in sts]
            if parsed["excluded_tags"]:
                excl = set(parsed["excluded_tags"])
                def has_excluded(it):
                    if not isinstance(it, dict):
                        return False
                    tags = [t.strip().casefold() for t in (it.get("tags") or "").split(",") if t.strip()]
                    for ex in excl:
                        if ex.startswith("__conteudo__:"):
                            need = ex.split(":",1)[1]
                            if (it.get("conteudo") or "").casefold() == need:
                                return True
                        if ex in tags:
                            return True
                    return False
                itens = [it for it in itens if not has_excluded(it)]
            if parsed["required_tags"]:
                req = set(parsed["required_tags"])
                def has_all_required(it):
                    if not isinstance(it, dict):
                        return False
                    tags = [t.strip().casefold() for t in (it.get("tags") or "").split(",") if t.strip()]
                    return req.issubset(set(tags))
                itens = [it for it in itens if has_all_required(it)]
        titulo = f"LINHAS DA LISTA: {self.name}"
        if filtro_expresao:
            titulo += f" [Filtro: {filtro_expresao}]"
        self.current_display = PaginatedDisplay(itens, titulo, items_per_page=None)
        self.current_display.render_page()

    def show_tags(self):
        tags = extrair_tags_dos_itens(self.lines)
        self.current_display = PaginatedDisplay(tags, f"TAGS DISPONÍVEIS - {self.name}", items_per_page=None)
        self.current_display.render_page()

    def show_por_tag(self, tag):
        itens = filtrar_por_tag(self.lines, tag)
        self.current_display = PaginatedDisplay(itens, f"ITENS COM TAG: {tag} - {self.name}", items_per_page=None)
        self.current_display.render_page()

    def show_por_status(self, status):
        itens = filtrar_por_status(self.lines, status)
        self.current_display = PaginatedDisplay(itens, f"ITENS {status.capitalize()} - {self.name}", items_per_page=None)
        self.current_display.render_page()

    def show_por_opiniao(self, opiniao):
        itens = filtrar_por_opiniao(self.lines, opiniao)
        self.current_display = PaginatedDisplay(itens, f"ITENS COM OPINIÃO: {opiniao.capitalize()} - {self.name}", items_per_page=None)
        self.current_display.render_page()

    def show_por_content(self, content_type_or_iter):
        if isinstance(content_type_or_iter, str):
            types = {content_type_or_iter.casefold()}
        else:
            types = {t.casefold() for t in content_type_or_iter}
        itens = [it for it in self.lines if isinstance(it, dict) and (it.get("conteudo") or "").casefold() in types]
        caps = ", ".join([t.capitalize() for t in types])
        self.current_display = PaginatedDisplay(itens, f"ITENS ({caps}) - {self.name}", items_per_page=None)
        self.current_display.render_page()
    
    def export_current_display(self, filename_arg=None):
        """
        Exporta os itens da exibição atual (self.current_display.items) para um .xlsx.
        Pergunta interativamente:
        - nome do arquivo (default: <lista>.xlsx)
        - quais colunas incluir (pergunta Y/n para cada)
        Gera uma linha por TAG (se houver múltiplas tags) — mesma lógica do JS.
        """
        if not getattr(self, "current_display", None):
            return False, "Nenhuma exibição ativa. Use 'show_lines' primeiro."

        items = list(self.current_display.items or [])
        if not items:
            return False, "Nenhum item visível para exportar."

        # Pergunta nome do arquivo (se não passado)
        default_fname = f"{self.name}.xlsx"
        if filename_arg:
            filename = filename_arg.strip()
        else:
            raw = input(f"Nome do arquivo (enter={default_fname}): ").strip()
            filename = raw or default_fname
        if not filename.lower().endswith(".xlsx"):
            filename = filename + ".xlsx"

        # Perguntas de opções (Y/n)
        def ask_opt(prompt, default=True):
            yn = "Y/n" if default else "y/N"
            raw = input(f"{prompt} [{yn}]: ").strip().lower()
            if raw == "":
                return default
            return raw[0] == "y"

        opts = {
            "id": ask_opt("Incluir ID?", True),
            "nome": ask_opt("Incluir Nome?", True),
            "sinonimos": ask_opt("Incluir Sinônimos?", True),
            "tag": ask_opt("Incluir Tag?", True),
            "opiniao": ask_opt("Incluir Opinião?", True),
            "episodio": ask_opt("Incluir Ep/Cap?", True),
            "status": ask_opt("Incluir Status?", True),
            "sinopse": ask_opt("Incluir Sinopse?", True),
            "conteudo": ask_opt("Incluir Conteúdo?", True),
            "image": ask_opt("Incluir Imagem (URL)?", True),
        }

        # Cria mapa de cores único por item.id (hex ARGB esperado pelo openpyxl: 'FFRRGGBB')
        color_map = {}
        used = set()
        def rand_color():
            # evitar branco total
            while True:
                r = random.randint(0, 200)
                g = random.randint(0, 200)
                b = random.randint(0, 200)
                hexc = "{:02X}{:02X}{:02X}".format(r, g, b)
                if hexc not in used:
                    used.add(hexc)
                    return "FF" + hexc
        for it in items:
            key = str(it.get("id", str(id(it)))) if isinstance(it, dict) else str(it)
            color_map[key] = rand_color()

        # Monta cabeçalho
        header_keys = []
        if opts["id"]: header_keys.append("ID")
        if opts["nome"]: header_keys.append("Nome")
        if opts["sinonimos"]: header_keys.append("Sinonimos")
        if opts["tag"]: header_keys.append("Tag")
        if opts["opiniao"]: header_keys.append("Opinião")
        if opts["episodio"]: header_keys.append("Ep/Cap")
        if opts["status"]: header_keys.append("Status")
        if opts["sinopse"]: header_keys.append("Sinopse")
        if opts["conteudo"]: header_keys.append("Conteudo")
        if opts["image"]: header_keys.append("Imagem")

        wb = Workbook()
        ws = wb.active
        ws.title = "Export"

        ws.append(header_keys)

        total = len(items)
        current = 0

        for it in items:
            # id chave para color_map
            key = str(it.get("id", str(id(it)))) if isinstance(it, dict) else str(it)
            bg = color_map.get(key, "FFDDDDDD")

            # tags: se não existir, cria uma lista com uma string vazia para uma única linha
            tags_field = ""
            if isinstance(it, dict):
                tags_field = it.get("tags") or ""
            if tags_field:
                tags = [t.strip() for t in tags_field.split(",") if t.strip()]
                if not tags:
                    tags = [""]
            else:
                tags = [""]

            for tag in tags:
                row = []
                if opts["id"]:
                    row.append(it.get("id") if isinstance(it, dict) else "")
                if opts["nome"]:
                    row.append(it.get("nome") if isinstance(it, dict) else str(it))
                if opts["sinonimos"]:
                    val = ""
                    if isinstance(it, dict):
                        s = it.get("sinonimos")
                        if isinstance(s, (list, tuple)):
                            val = "; ".join(s)
                        else:
                            val = s or ""
                    row.append(val)
                if opts["tag"]:
                    row.append(tag)
                if opts["opiniao"]:
                    row.append(it.get("opiniao") if isinstance(it, dict) else "")
                if opts["episodio"]:
                    row.append(it.get("episodio") if isinstance(it, dict) else "")
                if opts["status"]:
                    row.append(it.get("status") if isinstance(it, dict) else "")
                if opts["sinopse"]:
                    row.append(it.get("sinopse") if isinstance(it, dict) else "")
                if opts["conteudo"]:
                    row.append(it.get("conteudo") if isinstance(it, dict) else "")
                if opts["image"]:
                    row.append(it.get("imagem_url") if isinstance(it, dict) else "")

                ws.append(row)
                # aplica fill na última linha adicionada
                last_row_idx = ws.max_row
                fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
                for col_idx in range(1, len(header_keys) + 1):
                    cell = ws.cell(row=last_row_idx, column=col_idx)
                    cell.fill = fill

            current += 1
            # progresso simples
            pct = int((current / total) * 100)
            sys.stdout.write(f"\rExportando... {current}/{total} ({pct}%)")
            sys.stdout.flush()

        # salva e finaliza
        wb.save(filename)
        print()  # nova linha depois do progresso
        return True, f"Arquivo salvo: {os.path.abspath(filename)}"
    
class ItemContext:
    """
    Contexto para um item aberto a partir da exibição atual.
    Prompt ficará: "<item_id> >"
    """
    def __init__(self, parent_ctx, item, idx_in_view):
        self.parent = parent_ctx              # instância OpenListContext
        self.item = dict(item) if isinstance(item, dict) else {"nome": str(item)}
        self.index_in_view = int(idx_in_view) # 1-based posição na exibição atual
        self.name = str(self.item.get("id") or self.item.get("nome") or f"item{self.index_in_view}")
        self.modified = False

    # Mostrar tudo de forma clara
    def show_details(self):
        i = self.item
        lines = [
            f"DETALHES DO ITEM — posição na exibição: {self.index_in_view}",
            f"ID: {i.get('id')}",
            f"Nome: {i.get('nome')}",
            f"Conteúdo: {i.get('conteudo')}",
            f"Status: {i.get('status')}",
            f"Opinião: {i.get('opiniao')}",
            f"Episódio / Capítulo: {i.get('episodio')}",
            f"Tags: {i.get('tags')}",
            f"Sinônimos: {i.get('sinonimos')}",
            f"Imagem URL: {i.get('imagem_url') or i.get('image') or ''}",
            "Sinopse:",
            (i.get('sinopse') or "").strip()
        ]
        fancy_header(["="*72, *lines, "="*72])

    # editar um campo simples
    def edit_field(self, field, new_value):
        field = field.strip()
        if not field:
            return "Campo inválido."
        self.item[field] = new_value
        self.modified = True
        return f"Campo '{field}' atualizado localmente."

    # modo interativo de edição (pergunta campo por campo)
    def interactive_edit(self):
        editable = ["nome","conteudo","status","episodio","opiniao","tags","sinopse","imagem_url","sinonimos"]
        print("Modo interativo — deixe em branco para manter o valor atual.")
        for f in editable:
            cur = self.item.get(f, "")
            raw = input(f"{f} (atual: {cur}) => ").rstrip("\n")
            if raw != "":
                # manter listas de sinônimos se input com ; -> transformar em lista?
                if f == "sinonimos" and ";" in raw:
                    self.item[f] = [s.strip() for s in raw.split(";") if s.strip()]
                else:
                    self.item[f] = raw
                self.modified = True
        return "Edição local concluída."

    # salvar no servidor (aplica PUT em /linhas/<id>)
    def save(self):
        if "id" not in self.item:
            return False, "Item sem ID, não é possível salvar."
        payload = {
            "nome": self.item.get("nome"),
            "conteudo": self.item.get("conteudo"),
            "status": self.item.get("status"),
            "episodio": self.item.get("episodio"),
            "opiniao": self.item.get("opiniao"),
            "tags": self.item.get("tags"),
            "sinopse": self.item.get("sinopse"),
            "imagem_url": self.item.get("imagem_url"),
            "sinonimos": self.item.get("sinonimos")
        }
        # remove chaves None
        payload = {k: v for k, v in payload.items() if v is not None}
        url = f"{API_BASE.rstrip('/')}/linhas/{self.item['id']}"
        try:
            r = requests.put(url, json=payload, timeout=8)
            if r.status_code >= 400:
                return False, f"Erro {r.status_code}: {r.text}"
            self.modified = False
            return True, f"Salvo com sucesso: {self.item['id']}"
        except Exception as e:
            return False, f"Erro de rede: {e}"

    # refresh (GET /linhas/<id>) e atualiza local
    def refresh(self):
        if "id" not in self.item:
            return False, "Item sem ID."
        url = f"{API_BASE.rstrip('/')}/linhas/{self.item['id']}"
        try:
            r = requests.get(url, timeout=6)
            if r.status_code >= 400:
                return False, f"Erro {r.status_code}: {r.text}"
            new = r.json()
            if isinstance(new, dict):
                self.item = new
                return True, "Dados atualizados do servidor."
            return False, "Resposta inesperada do servidor."
        except Exception as e:
            return False, f"Erro de rede: {e}"

    # excluir
    def delete(self):
        if "id" not in self.item:
            return False, "Item sem ID."
        url = f"{API_BASE.rstrip('/')}/linhas/{self.item['id']}"
        try:
            r = requests.delete(url, timeout=6)
            if r.status_code >= 400:
                return False, f"Erro {r.status_code}: {r.text}"
            return True, "Excluído com sucesso."
        except Exception as e:
            return False, f"Erro de rede: {e}"

    # mover para próximo/prev (retorna novo ItemContext ou None)
    def open_adjacent(self, offset):
        target_idx = self.index_in_view - 1 + offset
        items = self.parent.current_display.items if getattr(self.parent, "current_display", None) else self.parent.lines
        if target_idx < 0 or target_idx >= len(items):
            return None
        return ItemContext(self.parent, items[target_idx], target_idx + 1)

def cmd_open_list(raw_name):
    key = raw_name.strip()
    (listas, err) = with_minimum_spinner(lambda: fetch_lists_request(), text=f"Procurando lista '{key}'...", min_seconds=0.6)
    if err:
        fancy_header([f"Erro: {err}"])
        return None
    match = None
    for item in listas or []:
        if isinstance(item, dict):
            if str(item.get("id")) == key or (item.get("nome") and item["nome"].casefold() == key.casefold()):
                match = item
                break
    if not match:
        fancy_header([f"Não encontrei a lista '{key}'."])
        return None
    ctx = OpenListContext(match)
    ok, fetch_err = ctx.fetch_and_cache_lines()
    if not ok:
        fancy_header([f"❌ Erro ao carregar linhas: {fetch_err}"])
        return None
    fancy_header([f"✅ LISTA '{match.get('nome') or match.get('id')}' ABERTA"])
    return ctx

# -------------------------
# Loop principal
# -------------------------
def main():
    current_ctx = None
    fancy_header(["BEM VINDO AO CLI INTERATIVO"])
    while True:
        try:
            prompt = f"{current_ctx.name}> " if current_ctx else PROMPT_MAIN
            line = input(prompt).strip()
            if not line:
                continue
            parts = shlex.split(line)
            cmd = parts[0].lower()
            args = parts[1:]

            if not current_ctx:
                if cmd == "show_lists":
                    (listas, err) = with_minimum_spinner(lambda: fetch_lists_request(), text="Buscando listas...", min_seconds=0.6)
                    fancy_header(["LISTAS DISPONÍVEIS"])
                    if err:
                        typewriter_print(f"Erro: {err}", speed=0.002)
                    else:
                        display = PaginatedDisplay(listas or [], "LISTAS DISPONÍVEIS", items_per_page=None)
                        display.render_page()
                elif cmd == "create_new_list":
                    if not args:
                        print("Uso: create_new_list <nome>")
                        continue
                    name = " ".join(args)
                    def do_post():
                        url = f"{API_BASE.rstrip('/')}/listas"
                        try:
                            r = requests.post(url, json={"nome": name}, timeout=6)
                            if r.status_code >= 400:
                                return False, f"Erro {r.status_code}: {r.text}"
                            return True, r.json()
                        except Exception as e:
                            return False, f"Erro de rede: {e}"
                    ok, data = with_minimum_spinner(do_post, text=f"Criando lista '{name}'...", min_seconds=0.6)
                    fancy_header([f"CRIANDO LISTA"])
                    if not ok:
                        typewriter_print(f"Problema: {data}", speed=0.004)
                    else:
                        typewriter_print("Lista criada com sucesso.", speed=0.004)
                elif cmd.startswith("open_"):
                    listkey = cmd[len("open_"):] or (args[0] if args else "")
                    ctx = cmd_open_list(listkey)
                    if ctx:
                        current_ctx = ctx
                elif cmd in ("clear", "cls"):
                    clear_screen()
                elif cmd in ("exit", "quit"):
                    break
                else:
                    typewriter_print(f"Comando inválido: {cmd}", speed=0.003)
            else:
                # Só deixa a exibição tratar se for um contexto de lista (não item!)
                if isinstance(current_ctx, OpenListContext) and current_ctx.current_display and current_ctx.current_display.handle_command(cmd, args):
                    continue

                # --- SORT HANDLER (aplica à exibição atual) ---
                if cmd.startswith("sort_"):
                    if not current_ctx.current_display:
                        typewriter_print("Nenhuma exibição ativa para ordenar. Use 'show_lines' primeiro.", speed=0.003)
                        continue

                    # método base extraído do comando (ex: "rate" de "sort_rate")
                    method = cmd[len("sort_"):]

                    # Detecta flag -r / --reverse nos argumentos (ex: sort_rate -r)
                    reverse_flag = False
                    if args:
                        # permite usar -r ou --reverse em qualquer posição dos args
                        if "-r" in args or "--reverse" in args:
                            reverse_flag = True

                    # Construir chave passada para apply_sort; aplicamos "-r" apenas para 'rate'
                    method_key = method
                    if method == "rate" and reverse_flag:
                        method_key = "rate -r"

                    # aceitar variações suportadas
                    if method_key in ("0-9", "9-0", "a-z", "z-a", "rate", "rate -r"):
                        msg = current_ctx.current_display.apply_sort(method_key)
                        typewriter_print(msg, speed=0.003)
                        # re-render a página 1 com nova ordenação
                        current_ctx.current_display.render_page(1)
                    else:
                        typewriter_print("Método de sort desconhecido. Use: sort_0-9, sort_9-0, sort_a-z, sort_z-a, sort_rate [-r]", speed=0.003)
                    continue

                # --- abrir item por posição na exibição atual: open_3 (quando estamos em OpenListContext) ---
                if isinstance(current_ctx, OpenListContext) and cmd.startswith("open_") and cmd[len("open_"):].isdigit():
                    idx = int(cmd[len("open_"):])
                    item_ctx, err = current_ctx.open_item_by_index(idx)
                    if err:
                        typewriter_print(f"Erro: {err}", speed=0.003)
                    else:
                        current_ctx = item_ctx
                        # mostra automaticamente detalhes ao abrir
                        current_ctx.show_details()
                    continue

                # --- se estamos num ItemContext, tratar comandos do item ---
                if isinstance(current_ctx, ItemContext):
                    # nav next/prev entre itens da exibição
                    if cmd in ("next", "n"):
                        nxt = current_ctx.open_adjacent(1)
                        if nxt:
                            current_ctx = nxt
                            current_ctx.show_details()
                        else:
                            typewriter_print("Não há próximo item.", speed=0.003)
                        continue
                    if cmd in ("prev", "p"):
                        prev = current_ctx.open_adjacent(-1)
                        if prev:
                            current_ctx = prev
                            current_ctx.show_details()
                        else:
                            typewriter_print("Não há item anterior.", speed=0.003)
                        continue

                    # show details
                    if cmd == "show_details":
                        current_ctx.show_details()
                        continue

                    # edit field (inline): edit tags nova_tag1,nova_tag2
                    if cmd == "edit" and args:
                        field = args[0]
                        newval = " ".join(args[1:]) if len(args) > 1 else ""
                        if newval == "":
                            typewriter_print("Uso: edit <campo> <novo_valor>  (ou só 'edit' para modo interativo)", speed=0.003)
                            continue
                        msg = current_ctx.edit_field(field, newval)
                        typewriter_print(msg, speed=0.003)
                        continue

                    # modo interativo de edição
                    if cmd == "edit":
                        msg = current_ctx.interactive_edit()
                        typewriter_print(msg, speed=0.003)
                        continue

                    # salvar (PUT)
                    if cmd == "save":
                        ok, msg = current_ctx.save()
                        if ok:
                            typewriter_print(msg, speed=0.003)
                            # Atualiza a lista pai localmente (se existir) substituindo o item
                            try:
                                pid = current_ctx.item.get("id")
                                parent_items = current_ctx.parent.lines
                                for i, it in enumerate(parent_items):
                                    if str(it.get("id")) == str(pid):
                                        parent_items[i] = current_ctx.item
                                        break
                            except Exception:
                                pass
                        else:
                            typewriter_print(f"Erro ao salvar: {msg}", speed=0.003)
                        continue

                    if cmd == "refresh":
                        ok, msg = current_ctx.refresh()
                        typewriter_print(msg if ok else f"Erro: {msg}", speed=0.003)
                        continue

                    if cmd == "delete":
                        confirm = input("Confirmar exclusão deste item? (y/N): ").strip().lower()
                        if confirm == "y":
                            ok, msg = current_ctx.delete()
                            if ok:
                                typewriter_print("Item excluído.", speed=0.003)
                                # após excluir, volta ao contexto da lista e recarrega linhas
                                parent = current_ctx.parent
                                parent.fetch_and_cache_lines()
                                current_ctx = parent
                            else:
                                typewriter_print(f"Erro: {msg}", speed=0.003)
                        else:
                            typewriter_print("Exclusão cancelada.", speed=0.003)
                        continue

                    # voltar ao contexto da lista
                    if cmd in ("back", "b"):
                        fancy_header([f"Voltando para '{current_ctx.parent.name}'"])
                        current_ctx = current_ctx.parent
                        continue

                    # se não for nenhum dos comandos acima, cair para o processamento normal de comandos     

                if cmd == "show_lines":
                    filtro = " ".join(args) if args else None
                    current_ctx.show_lines(filtro)

                elif cmd == "show_tags":
                    current_ctx.show_tags()

                elif cmd.startswith("search_"):
                    termo = cmd[len("search_"):] or (args[0] if args else "")
                    if not termo:
                        typewriter_print("Uso: search_<nome> (ex.: search_Naruto)", speed=0.003)
                    else:
                        current_ctx.search_items_by_name(termo)

                elif cmd.startswith("show_"):
                    resto_comando = cmd[5:]
                    if resto_comando:
                        tags_disponiveis = [tag.lower() for tag in extrair_tags_dos_itens(current_ctx.lines)]
                        tag_correspondente = None
                        for tag in tags_disponiveis:
                            if resto_comando.replace('_', ' ').lower() == tag.lower():
                                tag_correspondente = tag
                                break
                        if tag_correspondente:
                            current_ctx.show_por_tag(tag_correspondente)
                            continue
                    content_commands = {"anime":"anime","filme":"filme","manga":"manga","manhwa":"manhwa","webtoon":"webtoon"}
                    if resto_comando in content_commands:
                        current_ctx.show_por_content(content_commands[resto_comando])
                        continue
                    status_commands = {"seeing":"vendo","finished":"concluido","canceled":"cancelado","see":"assistir","know":"conheço","dropped":"dropado","lendo":"lendo"}
                    if resto_comando in status_commands:
                        current_ctx.show_por_status(status_commands[resto_comando])
                        continue
                    opiniao_commands = {"favorito":"Favorito","muito_bom":"Muito Bom","recomendo":"Recomendo","bom":"Bom","mediano":"Mediano","ruim":"Ruim","horrivel":"Horrível","nao_vi":"Não Vi"}
                    if resto_comando in opiniao_commands:
                        current_ctx.show_por_opiniao(opiniao_commands[resto_comando])
                        continue
                    typewriter_print(f"Comando não reconhecido: {cmd}", speed=0.003)

                elif cmd == "export_list":
                    filename_arg = args[0] if args else None
                    ok, msg = current_ctx.export_current_display(filename_arg)
                    if ok:
                        typewriter_print(msg, speed=0.003)
                    else:
                        typewriter_print(f"Erro: {msg}", speed=0.003)

                elif cmd == "next":
                    if current_ctx.current_display:
                        current_ctx.current_display.handle_command("next", [])
                    else:
                        typewriter_print("Nenhuma exibição ativa. Use 'show_lines' primeiro.", speed=0.003)

                elif cmd == "prev":
                    if current_ctx.current_display:
                        current_ctx.current_display.handle_command("prev", [])
                    else:
                        typewriter_print("Nenhuma exibição ativa. Use 'show_lines' primeiro.", speed=0.003)

                elif cmd.isdigit():
                    if current_ctx.current_display:
                        current_ctx.current_display.handle_command(cmd, [])
                    else:
                        typewriter_print("Nenhuma exibição ativa. Use 'show_lines' primeiro.", speed=0.003)

                elif cmd in ("back", "b"):
                    fancy_header([f"Saindo do contexto '{current_ctx.name}'"])
                    current_ctx = None

                elif cmd in ("clear", "cls"):
                    clear_screen()

                elif cmd in ("exit", "quit"):
                    break

                else:
                    typewriter_print(f"Comando inválido em '{current_ctx.name}': {cmd}", speed=0.003)

        except (KeyboardInterrupt, EOFError):
            print()
            break

if __name__ == "__main__":
    main()
