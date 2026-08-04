#!/usr/bin/env python3
"""
cli.py — CLI interativo com suporte a banco de espera, criação interativa de linhas,
verificação da API AniList e migração.
"""

import os
import shlex
import sys
import time
import threading
import unicodedata
import random
import json
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
    if not isinstance(s, str):
        return ""
    return _strip_accents(s).lower().strip()

def _norm_command_name(s: str) -> str:
    if not isinstance(s, str):
        return ""
    return _norm(s.replace("_", " ").replace("-", " "))

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
    if not isinstance(tags_field, str):
        return []
    parts = [p.strip() for p in tags_field.split(",") if p.strip()]
    return [(_norm(p), p) for p in parts]

def tags_contains(item, tag_check):
    if not isinstance(item, dict):
        return False
    tags_field = item.get("tags") or ""
    norm_tag_check = _norm(tag_check)
    for norm, orig in _split_tags_field(tags_field):
        if norm == norm_tag_check:
            return True
    return False

# ============================================================
# SISTEMA DE TAGS LOCAL (do tagsSystem.js)

TAG_CATEGORIES = {
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
        "Drama", "Tristeza", "Vergonhoso", "Fofo"
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
}


def get_all_tags_flat():
    """Retorna todas as tags em uma lista plana."""
    tags = []
    for category_tags in TAG_CATEGORIES.values():
        tags.extend(category_tags)
    return tags


def print_tags_table(tags, cols=3):
    """Exibe tags em 3 colunas com numeração."""
    if not tags:
        print("Nenhuma tag encontrada.")
        return
    
    # Ordena as tags alfabeticamente
    sorted_tags = sorted(tags)
    rows = (len(sorted_tags) + cols - 1) // cols
    
    for r in range(rows):
        line = ""
        for c in range(cols):
            idx = r + c * rows
            if idx < len(sorted_tags):
                tag = sorted_tags[idx]
                # Trunca tags longas para manter alinhamento
                display_tag = tag[:18] + ".." if len(tag) > 18 else tag
                line += f"{idx+1:3d} - {display_tag:20s}"
            else:
                line += " " * 24
        print(line)

# -------------------------
# Help / documentação
# -------------------------
def print_help_main():
    fancy_header(["COMANDOS - MENU PRINCIPAL"])
    commands = [
        "show_lists                   - Lista todas as listas disponíveis.",
        "show_wait_lists              - Lista todas as listas no banco de espera.",
        "create_list <nome>           - Cria uma nova lista no banco principal.",
        "create_wait_list <nome>      - Cria uma nova lista no banco de espera.",
        "open <id|nome>               - Abre uma lista pelo ID ou nome (principal).",
        "open_wait <id|nome>          - Abre uma lista do banco de espera.",
        "delete_list <id|nome>        - Deleta uma lista (principal).",
        "migrate_wait <id>            - Migra seletivamente itens de uma lista de espera para o principal.",
        "clear_wait                   - Limpa todo o banco de espera (com confirmação).",
        "verify_api                   - Verifica se a API do AniList está respondendo.",
        "help | ?                     - Mostra este help.",
        "clear | cls                  - Limpa a tela.",
        "exit | quit                  - Sai do CLI.",
        "move                         - Move itens entre listas do banco principal.",
    ]
    for line in commands:
        print(line)

def print_help_list():
    fancy_header(["COMANDOS - LISTA ABERTA"])
    commands = [
        "show_lines [filtro]           - Exibe as linhas da lista.",
        "show_tags                     - Mostra todas as tags disponíveis.",
        "search_<termo>                - Busca itens pelo nome.",
        "open <nome>|<numero>          - Abre item por nome ou posição exibida.",
        "show_<tag>                    - Exibe itens da tag indicada.",
        "show_anime|show_filme|show_manga|show_manhwa|show_webtoon - Filtra por conteúdo.",
        "show_<status>                 - Filtra por status.",
        "sort_0-9 | sort_9-0           - Ordena por ID.",
        "sort_a-z | sort_z-a           - Ordena por nome.",
        "sort_rate [-r]                - Ordena por opinião.",
        "next | prev                   - Navega páginas.",
        "<numero>                      - Vai para a página indicada.",
        "export_list [arquivo.xlsx]    - Exporta a exibição atual para XLSX.",
        "create_line <nome>            - Cria uma nova linha interativamente na lista atual.",
        "back | b                      - Volta ao menu principal.",
        "help | ?                      - Mostra este help.",
        "clear | cls                   - Limpa a tela.",
        "exit | quit                   - Sai do CLI.",
    ]
    for line in commands:
        print(line)

def print_help_item():
    fancy_header(["COMANDOS - ITEM ABERTO"])
    commands = [
        "next | n                      - Abre o próximo item.",
        "prev | p                      - Abre o item anterior.",
        "show_details                  - Mostra detalhes completos.",
        "edit <campo> <novo_valor>     - Edita um campo localmente.",
        "edit                          - Modo interativo de edição.",
        "save                          - Salva as alterações no servidor.",
        "refresh                       - Recarrega o item do servidor.",
        "delete                        - Exclui o item (com confirmação).",
        "check                         - Atualiza o highlight.",
        "back | b                      - Volta para a lista.",
        "help | ?                      - Mostra este help.",
        "clear | cls                   - Limpa a tela.",
        "exit | quit                   - Sai do CLI.",
    ]
    for line in commands:
        print(line)

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
    except requests.exceptions.ConnectionError:
        return None, f"Erro de rede: não foi possível conectar ao servidor em {url}."
    except requests.exceptions.RequestException as e:
        return None, f"Erro de rede: {e}"

def fetch_wait_lists_request():
    url = f"{API_BASE.rstrip('/')}/wait/listas"
    try:
        r = requests.get(url, timeout=6)
        if r.status_code >= 400:
            return None, f"Erro {r.status_code}: {r.text}"
        return r.json(), None
    except Exception as e:
        return None, f"Erro: {e}"

def fetch_lines_request(list_id):
    url = f"{API_BASE.rstrip('/')}/linhas/{list_id}"
    try:
        r = requests.get(url, timeout=8)
        if r.status_code >= 400:
            return None, f"Erro {r.status_code}: {r.text}"
        return r.json(), None
    except Exception as e:
        return None, f"Erro: {e}"

def fetch_wait_lines_request(list_id):
    url = f"{API_BASE.rstrip('/')}/wait/linhas/{list_id}"
    try:
        r = requests.get(url, timeout=8)
        if r.status_code >= 400:
            return None, f"Erro {r.status_code}: {r.text}"
        return r.json(), None
    except Exception as e:
        return None, f"Erro: {e}"

def verify_anilist_api():
    import time
    from datetime import datetime
    
    url = "https://graphql.anilist.co"
    test_title = "Naruto"
    
    # Cabeçalho
    print("\n" + "╔" + "═" * 78 + "╗")
    print("║" + " " * 20 + "🔍 VERIFICAÇÃO DA API ANILIST" + " " * 30 + "║")
    print("╚" + "═" * 78 + "╝")
    print(f"  📅 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    
    resultados = {
        "conectividade": False,
        "busca": False,
        "imagem": False,
        "sinopse": False,
        "sinonimos": False,
        "tempo_resposta": 0,
        "status_code": None,
        "erro": None,
        "detalhes": []
    }
    
    # 1) Teste de conectividade - CORRIGIDO
    print("\n  📡 Testando conectividade...")
    try:
        start_time = time.time()
        
        # Query mínima para testar conectividade
        test_query = """
        query {
          __typename
        }
        """
        
        r = requests.post(
            url,
            json={"query": test_query},
            timeout=5,
            headers={"Content-Type": "application/json"}
        )
        
        resultados["tempo_resposta"] = round((time.time() - start_time) * 1000, 2)
        resultados["status_code"] = r.status_code
        
        if r.status_code == 200:
            resultados["conectividade"] = True
            print(f"     ✅ Conectividade OK ({resultados['tempo_resposta']}ms)")
        else:
            print(f"     ⚠️ Resposta inesperada: HTTP {r.status_code}")
            print(f"     📄 {r.text[:100]}")
            resultados["erro"] = f"HTTP {r.status_code}"
            
    except requests.exceptions.ConnectionError:
        print("     ❌ FALHA - Sem conexão com a internet ou servidor bloqueado")
        resultados["erro"] = "Sem conexão com a internet"
    except requests.exceptions.Timeout:
        print("     ❌ FALHA - Tempo limite excedido (timeout)")
        resultados["erro"] = "Timeout"
    except Exception as e:
        print(f"     ❌ FALHA - {str(e)}")
        resultados["erro"] = str(e)
    
    # Se não houver conectividade, já exibe o relatório
    if not resultados["conectividade"]:
        print("\n" + "╔" + "═" * 78 + "╗")
        print("║" + " " * 25 + "📊 RELATÓRIO DA API" + " " * 33 + "║")
        print("╚" + "═" * 78 + "╝")
        
        print("\n  🔴 STATUS GERAL: ❌ API INDISPONÍVEL")
        print(f"  🔴 Motivo: {resultados['erro']}")
        print("  🔴 Testes passados: 0/5")
        print(f"  🔴 Tempo de resposta: {resultados['tempo_resposta']}ms")
        
        print("\n  📋 Detalhamento:")
        print("     ❌ Conectividade com a API")
        print("     ❌ Busca por título")
        print("     ❌ Retorno de imagem")
        print("     ❌ Retorno de sinopse")
        print("     ❌ Retorno de sinônimos")
        
        print("\n  💡 RECOMENDAÇÃO:")
        print("     ⚠️ A API do AniList está inacessível no momento.")
        print("     📌 Use o banco de ESPERA para adicionar itens.")
        print("     📌 Depois execute 'migrate_wait' quando a API voltar.")
        print("     📌 Verifique sua conexão com a internet.")
        print("\n" + "═" * 80)
        return False, resultados
    
    # 2) Query de busca
    query = """
    query($search: String) {
      Page(page: 1, perPage: 3) {
        media(search: $search, type: ANIME) {
          title { romaji english native }
          coverImage { large extraLarge }
          description
          synonyms
          status
          episodes
          averageScore
        }
      }
    }
    """
    
    print(f"\n  🔎 Buscando por: '{test_title}'...")
    
    try:
        start_time = time.time()
        response = requests.post(
            url,
            json={"query": query, "variables": {"search": test_title}},
            timeout=10,
            headers={"Content-Type": "application/json"}
        )
        response_time = round((time.time() - start_time) * 1000, 2)
        
        if response.status_code != 200:
            print(f"     ❌ Erro na busca: HTTP {response.status_code}")
            print(f"     📄 Resposta: {response.text[:150]}...")
            resultados["erro"] = f"HTTP {response.status_code} na busca"
            resultados["status_code"] = response.status_code
            
            print("\n" + "╔" + "═" * 78 + "╗")
            print("║" + " " * 25 + "📊 RELATÓRIO DA API" + " " * 33 + "║")
            print("╚" + "═" * 78 + "╝")
            
            print("\n  🔴 STATUS GERAL: ⚠️ API RESPONDEU MAS FALHOU NA BUSCA")
            print(f"  🔴 Motivo: {resultados['erro']}")
            print("  🔴 Testes passados: 1/5")
            print(f"  🔴 Tempo de resposta: {resultados['tempo_resposta']}ms")
            
            print("\n  📋 Detalhamento:")
            print("     ✅ Conectividade com a API")
            print("     ❌ Busca por título")
            print("     ❌ Retorno de imagem")
            print("     ❌ Retorno de sinopse")
            print("     ❌ Retorno de sinônimos")
            
            print("\n  💡 RECOMENDAÇÃO:")
            print("     ⚠️ A API está respondendo mas a busca falhou.")
            print("     📌 Pode ser um problema temporário. Tente novamente em alguns minutos.")
            print("     📌 Use o banco de ESPERA para adicionar itens agora.")
            print("\n" + "═" * 80)
            return False, resultados
        
        data = response.json()
        resultados["busca"] = True
        print(f"     ✅ Busca realizada com sucesso ({response_time}ms)")
        
    except requests.exceptions.Timeout:
        print("     ❌ Timeout na busca")
        resultados["erro"] = "Timeout na busca"
        
        print("\n" + "╔" + "═" * 78 + "╗")
        print("║" + " " * 25 + "📊 RELATÓRIO DA API" + " " * 33 + "║")
        print("╚" + "═" * 78 + "╝")
        
        print("\n  🔴 STATUS GERAL: ⚠️ TIMEOUT NA BUSCA")
        print("  🔴 Testes passados: 1/5")
        print(f"  🔴 Tempo de resposta: {resultados['tempo_resposta']}ms")
        
        print("\n  📋 Detalhamento:")
        print("     ✅ Conectividade com a API")
        print("     ❌ Busca por título (timeout)")
        print("     ❌ Retorno de imagem")
        print("     ❌ Retorno de sinopse")
        print("     ❌ Retorno de sinônimos")
        
        print("\n  💡 RECOMENDAÇÃO:")
        print("     ⚠️ A API está lenta. Tente novamente mais tarde.")
        print("     📌 Use o banco de ESPERA para adicionar itens agora.")
        print("\n" + "═" * 80)
        return False, resultados
        
    except Exception as e:
        print(f"     ❌ Erro: {e}")
        resultados["erro"] = str(e)
        
        print("\n" + "╔" + "═" * 78 + "╗")
        print("║" + " " * 25 + "📊 RELATÓRIO DA API" + " " * 33 + "║")
        print("╚" + "═" * 78 + "╝")
        
        print("\n  🔴 STATUS GERAL: ⚠️ ERRO NA BUSCA")
        print(f"  🔴 Motivo: {resultados['erro']}")
        print("  🔴 Testes passados: 1/5")
        
        print("\n  📋 Detalhamento:")
        print("     ✅ Conectividade com a API")
        print("     ❌ Busca por título (erro)")
        print("     ❌ Retorno de imagem")
        print("     ❌ Retorno de sinopse")
        print("     ❌ Retorno de sinônimos")
        
        print("\n  💡 RECOMENDAÇÃO:")
        print("     ⚠️ Ocorreu um erro inesperado.")
        print("     📌 Use o banco de ESPERA para adicionar itens.")
        print("\n" + "═" * 80)
        return False, resultados
    
    # 3) Analisar resultados da busca
    media = data.get("data", {}).get("Page", {}).get("media", [])
    
    if not media:
        print("     ⚠️ Nenhum resultado encontrado")
        resultados["erro"] = "Nenhum resultado encontrado"
        
        print("\n" + "╔" + "═" * 78 + "╗")
        print("║" + " " * 25 + "📊 RELATÓRIO DA API" + " " * 33 + "║")
        print("╚" + "═" * 78 + "╝")
        
        print("\n  🔴 STATUS GERAL: ⚠️ BUSCA SEM RESULTADOS")
        print("  🔴 Testes passados: 2/5")
        print(f"  🔴 Tempo de resposta: {resultados['tempo_resposta']}ms")
        
        print("\n  📋 Detalhamento:")
        print("     ✅ Conectividade com a API")
        print("     ✅ Busca por título (mas sem resultados)")
        print("     ❌ Retorno de imagem")
        print("     ❌ Retorno de sinopse")
        print("     ❌ Retorno de sinônimos")
        
        print("\n  💡 RECOMENDAÇÃO:")
        print("     ⚠️ A API respondeu mas não encontrou o título de teste.")
        print("     📌 Pode ser um problema nos dados da API.")
        print("     📌 Use o banco de ESPERA para adicionar itens.")
        print("\n" + "═" * 80)
        return False, resultados
    
    # 4) Analisar dados do primeiro resultado
    primeiro = media[0]
    titulos = primeiro.get("title", {})
    romaji = titulos.get("romaji", "N/A")
    english = titulos.get("english", "")
    native = titulos.get("native", "")
    
    print(f"\n  📋 Resultado encontrado:")
    print(f"     📖 Título: {romaji}")
    if english:
        print(f"     🌐 Inglês: {english}")
    if native:
        print(f"     🇯🇵 Nativo: {native}")
    
    # 4.1) Imagem
    cover = primeiro.get("coverImage", {})
    large = cover.get("large", "")
    extra = cover.get("extraLarge", "")
    
    if large:
        resultados["imagem"] = True
        print(f"     🖼️ Imagem: ✅ Disponível (large)")
        # Testa se a URL da imagem é válida
        try:
            img_check = requests.head(large, timeout=3)
            if img_check.status_code == 200:
                print(f"        📸 URL válida (HTTP {img_check.status_code})")
            else:
                print(f"        ⚠️ URL retornou HTTP {img_check.status_code}")
        except:
            print(f"        ⚠️ Não foi possível verificar a URL")
    elif extra:
        resultados["imagem"] = True
        print(f"     🖼️ Imagem: ✅ Disponível (extraLarge)")
    else:
        print(f"     🖼️ Imagem: ❌ NÃO DISPONÍVEL")
        resultados["detalhes"].append("Imagem não disponível")
    
    # 4.2) Sinopse
    desc = primeiro.get("description", "")
    if desc and len(desc) > 50:
        resultados["sinopse"] = True
        print(f"     📝 Sinopse: ✅ Disponível ({len(desc)} caracteres)")
        # Mostra preview mais limpo
        preview = desc[:120].replace("\n", " ").strip()
        print(f"        📄 {preview}...")
    elif desc:
        resultados["sinopse"] = True
        print(f"     📝 Sinopse: ✅ Disponível (curta, {len(desc)} caracteres)")
    else:
        print(f"     📝 Sinopse: ❌ NÃO DISPONÍVEL")
        resultados["detalhes"].append("Sinopse não disponível")
    
    # 4.3) Sinônimos
    synonyms = primeiro.get("synonyms", [])
    if synonyms and len(synonyms) > 0:
        resultados["sinonimos"] = True
        print(f"     🔤 Sinônimos: ✅ Disponível ({len(synonyms)} sinônimo(s))")
        display = ", ".join(synonyms[:3])
        if len(synonyms) > 3:
            display += f" (+{len(synonyms)-3} mais)"
        print(f"        📌 {display}")
    else:
        print(f"     🔤 Sinônimos: ❌ NÃO DISPONÍVEL")
        resultados["detalhes"].append("Sinônimos não disponíveis")
    
    # 4.4) Informações extras
    status = primeiro.get("status", "N/A")
    episodes = primeiro.get("episodes", "N/A")
    score = primeiro.get("averageScore", "N/A")
    
    print(f"\n  📊 Informações adicionais:")
    print(f"     📌 Status: {status}")
    print(f"     📌 Episódios: {episodes}")
    print(f"     📌 Score médio: {score}/100")
    
    # 5) Sumário final
    print("\n" + "╔" + "═" * 78 + "╗")
    print("║" + " " * 28 + "📊 RELATÓRIO DA API" + " " * 33 + "║")
    print("╚" + "═" * 78 + "╝")
    
    total_tests = 5
    passed = sum([
        resultados["conectividade"],
        resultados["busca"],
        resultados["imagem"],
        resultados["sinopse"],
        resultados["sinonimos"]
    ])
    
    if passed == 5:
        status_emoji = "🟢"
        status_text = "COMPLETAMENTE FUNCIONAL"
    elif passed >= 3:
        status_emoji = "🟡"
        status_text = "PARCIALMENTE FUNCIONAL"
    else:
        status_emoji = "🔴"
        status_text = "COM PROBLEMAS"
    
    print(f"\n  {status_emoji} STATUS GERAL: {status_text}")
    print(f"  📊 Testes passados: {passed}/{total_tests}")
    print(f"  ⏱️ Tempo de resposta: {resultados['tempo_resposta']}ms")
    
    if resultados.get("status_code"):
        print(f"  📡 HTTP Status: {resultados['status_code']}")
    
    print("\n  📋 Detalhamento:")
    print(f"     {'✅' if resultados['conectividade'] else '❌'} Conectividade com a API")
    print(f"     {'✅' if resultados['busca'] else '❌'} Busca por título")
    print(f"     {'✅' if resultados['imagem'] else '❌'} Retorno de imagem")
    print(f"     {'✅' if resultados['sinopse'] else '❌'} Retorno de sinopse")
    print(f"     {'✅' if resultados['sinonimos'] else '❌'} Retorno de sinônimos")
    
    if resultados["detalhes"]:
        print("\n  📌 Observações:")
        for det in resultados["detalhes"]:
            print(f"     ⚠️ {det}")
    
    # 6) Recomendações
    print("\n  💡 RECOMENDAÇÃO:")
    if passed == 5:
        print("     ✅ Tudo funcionando perfeitamente!")
        print("     ✅ Pode usar o banco PRINCIPAL normalmente.")
        print("     ✅ As imagens, sinopse e sinônimos estão disponíveis.")
    elif passed >= 3:
        print("     ⚠️ API está funcionando parcialmente.")
        print("     📌 Alguns dados podem não estar disponíveis.")
        print("     📌 Use o banco PRINCIPAL com cautela.")
        if not resultados["imagem"]:
            print("     📌 Imagens não disponíveis. Considere adicionar manualmente.")
        if not resultados["sinopse"]:
            print("     📌 Sinopse não disponível.")
        if not resultados["sinonimos"]:
            print("     📌 Sinônimos não disponíveis.")
    else:
        print("     🔴 API com problemas ou indisponível.")
        print("     📌 Use o banco de ESPERA para adicionar itens.")
        print("     📌 Execute 'migrate_wait' quando a API normalizar.")
        if resultados.get("erro"):
            print(f"     📌 Motivo: {resultados['erro']}")
    
    print("\n" + "═" * 80)
    
    return passed >= 3, resultados


# -------------------------
# Paginação
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
        if not isinstance(item, dict):
            typewriter_print(f"{idx}. {item}", speed=0.002)
            return
        nome = item.get("nome") or item.get("name") or str(item.get("id", "N/A"))
        migrated = item.get("migrated", 0)
        prefix = "[M] " if migrated else ""
        status = item.get("status")
        status_str = f"[Status: {status}]" if status else ""
        WIDTH = 80
        left_part = f"{idx}. {prefix}{nome}"
        if status_str:
            total_len = len(left_part) + len(status_str) + 2
            if total_len > WIDTH:
                max_name_len = WIDTH - len(status_str) - 4 - len(prefix)
                if max_name_len < 10:
                    max_name_len = 10
                left_part = f"{idx}. {prefix}{nome[:max_name_len]}..."
            padding = WIDTH - len(left_part) - len(status_str)
            if padding < 1:
                padding = 1
            line = f"{left_part}{' ' * padding}{status_str}"
        else:
            line = left_part.ljust(WIDTH)
        typewriter_print(line, speed=0.002)

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

    def apply_sort(self, method):
        if not self.items:
            return "Nenhum item para ordenar."
        method = method.lower()
        try:
            if method == "0-9":
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
# Funções auxiliares de filtro e parser
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
# Contextos
# -------------------------
class OpenListContext:
    def __init__(self, list_obj, is_waiting=False):
        self.list_obj = list_obj
        self.id = str(list_obj.get("id") or "")
        self.name = list_obj.get("nome") or self.id or "lista"
        self.is_waiting = is_waiting
        self.lines = []
        self.current_display = None

    def fetch_and_cache_lines(self):
        if self.is_waiting:
            lines, err = with_minimum_spinner(
                lambda: fetch_wait_lines_request(self.id),
                text=f"Buscando linhas da lista de espera '{self.name}'...",
                min_seconds=0.6
            )
        else:
            lines, err = with_minimum_spinner(
                lambda: fetch_lines_request(self.id),
                text=f"Buscando linhas da lista '{self.name}'...",
                min_seconds=0.6
            )
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

    def open_item_by_name(self, nome):
        if not isinstance(nome, str) or not nome.strip():
            return None, "Nome inválido."
        nome_normalizado = _norm_command_name(nome)
        exact_match = None
        partial_matches = []
        for idx, item in enumerate(self.lines, start=1):
            if not isinstance(item, dict):
                continue
            item_name = item.get("nome") or item.get("name") or ""
            item_norm = _norm_command_name(item_name)
            if item_norm == nome_normalizado:
                exact_match = (idx, item)
                break
            if nome_normalizado in item_norm:
                partial_matches.append((idx, item))
        if exact_match:
            idx, item = exact_match
            return ItemContext(self, item, idx), None
        if len(partial_matches) == 1:
            idx, item = partial_matches[0]
            return ItemContext(self, item, idx), None
        if len(partial_matches) > 1:
            nomes = [f"{idx}:{item.get('nome') or item.get('name')}" for idx, item in partial_matches[:5]]
            return None, f"Vários itens correspondem a '{nome}': {', '.join(nomes)}"
        return None, f"Nenhum item encontrado com nome '{nome}'."

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
        if not getattr(self, "current_display", None):
            return False, "Nenhuma exibição ativa. Use 'show_lines' primeiro."
        items = list(self.current_display.items or [])
        if not items:
            return False, "Nenhum item visível para exportar."
        default_fname = f"{self.name}.xlsx"
        if filename_arg:
            filename = filename_arg.strip()
        else:
            raw = input(f"Nome do arquivo (enter={default_fname}): ").strip()
            filename = raw or default_fname
        if not filename.lower().endswith(".xlsx"):
            filename = filename + ".xlsx"

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

        color_map = {}
        used = set()
        def rand_color():
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
            key = str(it.get("id", str(id(it)))) if isinstance(it, dict) else str(it)
            bg = color_map.get(key, "FFDDDDDD")
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
                last_row_idx = ws.max_row
                fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
                for col_idx in range(1, len(header_keys) + 1):
                    cell = ws.cell(row=last_row_idx, column=col_idx)
                    cell.fill = fill

            current += 1
            pct = int((current / total) * 100)
            sys.stdout.write(f"\rExportando... {current}/{total} ({pct}%)")
            sys.stdout.flush()

        wb.save(filename)
        print()
        return True, f"Arquivo salvo: {os.path.abspath(filename)}"

    # ============================================================
    # Criação interativa de linha (CORRIGIDA)
    # ============================================================

    def interactive_create_line(self, nome, is_waiting=False):
        """
        Realiza o fluxo interativo de criação de uma nova linha.
        USANDO TAGS DO ARQUIVO LOCAL (não busca do banco).
        """
        
        # 1) Usar tags do arquivo local
        all_tags = get_all_tags_flat()
        
        # 2) Exibir tags em colunas (5 colunas)
        clear_screen()
        print("=" * 80)
        print(f"CRIANDO NOVA LINHA: {nome}")
        print("=" * 80)
        print("\n📋 TAGS DISPONÍVEIS (do sistema):")
        print("-" * 80)
        
        # Pergunta tags
        print_tags_table(all_tags)
        print("-" * 80)
        tag_choice = input("Quais tags essa linha vai ter? (digite os números separados por vírgula, ou deixe em branco): ").strip()
        selected_tags = []
        if tag_choice:
            # Processa números
            sorted_tags = sorted(all_tags)
            for part in tag_choice.split(','):
                part = part.strip()
                if part.isdigit():
                    idx = int(part) - 1
                    if 0 <= idx < len(sorted_tags):
                        selected_tags.append(sorted_tags[idx])
                    else:
                        print(f"⚠️ Número {part} inválido (fora do range). Ignorando.")
            if selected_tags:
                print(f"✅ Tags selecionadas: {', '.join(selected_tags)}")
            else:
                print("ℹ️ Nenhuma tag válida selecionada.")
        
        tags_str = ", ".join(selected_tags) if selected_tags else ""
        input("\nPressione ENTER para continuar...")

        # 3) Tipo de mídia
        clear_screen()
        print("=" * 80)
        print(f"TIPO DE MÍDIA para '{nome}'")
        print("=" * 80)
        media_options = [
            ("Anime", "anime"),
            ("Filme", "filme"),
            ("Manga", "manga"),
            ("Manhwa", "manhwa"),
            ("Webtoon", "webtoon")
        ]
        for i, (label, _) in enumerate(media_options, 1):
            print(f"{i} - {label}")
        while True:
            choice = input("Escolha o tipo (número): ").strip()
            if choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(media_options):
                    conteudo = media_options[idx][1]
                    break
            print("Opção inválida. Tente novamente.")

        # 4) Status (baseado no tipo)
        clear_screen()
        print("=" * 80)
        print(f"STATUS para '{nome}'")
        print("=" * 80)
        # Define opções baseadas no conteúdo
        if conteudo in ["anime", "filme"]:
            status_options = [
                ("Assistindo", "assistindo"),
                ("Concluído", "concluido"),
                ("Assistir", "assistir"),
                ("Cancelado", "cancelado"),
                ("Dropado", "dropado")
            ]
        else:  # manga, manhwa, webtoon
            status_options = [
                ("Lendo", "lendo"),
                ("Concluído", "concluido"),
                ("Ler", "ler"),
                ("Cancelado", "cancelado"),
                ("Dropado", "dropado")
            ]
        for i, (label, _) in enumerate(status_options, 1):
            print(f"{i} - {label}")
        while True:
            choice = input("Escolha o status (número): ").strip()
            if choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(status_options):
                    status = status_options[idx][1]
                    break
            print("Opção inválida. Tente novamente.")

        # 5) Episódio/Capítulo
        clear_screen()
        print("=" * 80)
        print(f"EPISÓDIO/CAPÍTULO para '{nome}'")
        print("=" * 80)
        episodio_input = input("Em qual episódio/capítulo você parou? (deixe em branco se não aplicável): ").strip()
        episodio = None
        if episodio_input:
            try:
                episodio = int(episodio_input)
            except ValueError:
                try:
                    episodio = float(episodio_input)
                except ValueError:
                    print("⚠️ Valor inválido. Será salvo como vazio.")
                    episodio = None

        # 6) Opinião
        clear_screen()
        print("=" * 80)
        print(f"OPINIÃO sobre '{nome}'")
        print("=" * 80)
        opiniao_options = [
            ("Favorito", "Favorito"),
            ("Muito Bom", "Muito Bom"),
            ("Recomendo", "Recomendo"),
            ("Bom", "Bom"),
            ("Mediano", "Mediano"),
            ("Ruim", "Ruim"),
            ("Horrível", "Horrível"),
            ("Não Vi", "Não Vi")
        ]
        for i, (label, _) in enumerate(opiniao_options, 1):
            print(f"{i} - {label}")
        while True:
            choice = input("Escolha a opinião (número): ").strip()
            if choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(opiniao_options):
                    opiniao = opiniao_options[idx][1]
                    break
            print("Opção inválida. Tente novamente.")

        # 7) Confirmar e enviar
        clear_screen()
        print("=" * 80)
        print("RESUMO DA CRIAÇÃO")
        print("=" * 80)
        print(f"📌 Nome: {nome}")
        print(f"🏷️ Tags: {tags_str or '(nenhuma)'}")
        print(f"📺 Tipo: {conteudo}")
        print(f"📊 Status: {status}")
        print(f"📖 Episódio/Cap: {episodio if episodio is not None else '(não informado)'}")
        print(f"⭐ Opinião: {opiniao}")
        print("=" * 80)
        confirm = input("Criar esta linha? (s/N): ").strip().lower()
        if confirm != 's':
            print("❌ Criação cancelada.")
            return

        # 8) Enviar para o servidor
        payload = {
            "lista_id": self.id,
            "nome": nome,
            "tags": tags_str,
            "conteudo": conteudo,
            "status": status,
            "episodio": episodio,
            "opiniao": opiniao
        }
        
        if is_waiting:
            url = f"{API_BASE.rstrip('/')}/wait/linhas"
        else:
            url = f"{API_BASE.rstrip('/')}/linhas"

        try:
            print("\n⏳ Enviando para o servidor...")
            r = requests.post(url, json=payload, timeout=8)
            if r.status_code >= 400:
                print(f"❌ Erro ao criar linha: {r.status_code} - {r.text}")
            else:
                print("✅ Linha criada com sucesso!")
                # Atualiza a lista de linhas
                self.fetch_and_cache_lines()
                self.show_lines()
        except Exception as e:
            print(f"❌ Erro de rede: {e}")

    def _print_tags_table(self, tags):
        """Exibe tags em 3 colunas com numeração."""
        if not tags:
            print("Nenhuma tag encontrada no sistema.")
            return
        # Divide em 3 colunas
        cols = 3
        rows = (len(tags) + cols - 1) // cols
        for r in range(rows):
            line = ""
            for c in range(cols):
                idx = r + c * rows
                if idx < len(tags):
                    tag = tags[idx]
                    display_tag = tag[:18] + ".." if len(tag) > 18 else tag
                    line += f"{idx+1:2d} - {display_tag:20s}"
                else:
                    line += " " * 24
            print(line)

class ItemContext:
    def __init__(self, parent_ctx, item, idx_in_view):
        self.parent = parent_ctx
        self.item = dict(item) if isinstance(item, dict) else {"nome": str(item)}
        self.index_in_view = int(idx_in_view)
        self.name = str(self.item.get("id") or self.item.get("nome") or f"item{self.index_in_view}")
        self.modified = False

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

    def edit_field(self, field, new_value):
        field = field.strip().lower()
        if not field:
            return "Campo inválido."
        aliases = {
            "ep": "episodio",
            "episode": "episodio",
            "image": "imagem_url",
            "imagem": "imagem_url",
            "sinonyms": "sinonimos",
            "sinonym": "sinonimos",
            "name": "nome",
        }
        field = aliases.get(field, field)
        self.item[field] = new_value
        self.modified = True
        return f"Campo '{field}' atualizado localmente."

    def interactive_edit(self):
        editable = ["nome","conteudo","status","episodio","opiniao","tags","sinopse","imagem_url","sinonimos"]
        print("Modo interativo — deixe em branco para manter o valor atual.")
        for f in editable:
            cur = self.item.get(f, "")
            raw = input(f"{f} (atual: {cur}) => ").rstrip("\n")
            if raw != "":
                if f == "sinonimos" and ";" in raw:
                    self.item[f] = [s.strip() for s in raw.split(";") if s.strip()]
                else:
                    self.item[f] = raw
                self.modified = True
        return "Edição local concluída."

    def save(self):
        if "id" not in self.item:
            return False, "Item sem ID, não é possível salvar."
        tags_value = self.item.get("tags")
        if isinstance(tags_value, (list, tuple)):
            tags_value = ", ".join(str(x).strip() for x in tags_value if x is not None)
        episodio_value = self.item.get("episodio")
        if isinstance(episodio_value, str):
            episodio_value = episodio_value.strip()
            try:
                episodio_value = int(episodio_value)
            except ValueError:
                try:
                    episodio_value = float(episodio_value)
                except ValueError:
                    pass
        payload = {
            "nome": self.item.get("nome"),
            "conteudo": self.item.get("conteudo"),
            "status": self.item.get("status"),
            "episodio": episodio_value,
            "opiniao": self.item.get("opiniao"),
            "tags": tags_value,
            "sinopse": self.item.get("sinopse"),
            "imagem_url": self.item.get("imagem_url"),
            "sinonimos": self.item.get("sinonimos")
        }
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

    def check(self):
        if "id" not in self.item:
            return False, "Item sem ID."
        url = f"{API_BASE.rstrip('/')}/highlighted/{self.item['id']}"
        try:
            r = requests.post(url, timeout=8)
            if r.status_code >= 400:
                return False, f"Erro {r.status_code}: {r.text}"
            try:
                payload = r.json()
                if isinstance(payload, dict) and "mensagem" in payload:
                    self.item["last_highlight"] = payload.get("last_highlight", self.item.get("last_highlight"))
            except Exception:
                pass
            return True, "Highlight atualizado com sucesso."
        except Exception as e:
            return False, f"Erro de rede: {e}"

    def open_adjacent(self, offset):
        target_idx = self.index_in_view - 1 + offset
        items = self.parent.current_display.items if getattr(self.parent, "current_display", None) else self.parent.lines
        if target_idx < 0 or target_idx >= len(items):
            return None
        return ItemContext(self.parent, items[target_idx], target_idx + 1)

# -------------------------
# Funções de abertura e criação de listas
# -------------------------
def cmd_open_list(raw_name, is_waiting=False):
    key = raw_name.strip()
    key_norm = _norm_command_name(key)
    if is_waiting:
        (listas, err) = with_minimum_spinner(
            lambda: fetch_wait_lists_request(),
            text=f"Procurando lista de espera '{key}'...",
            min_seconds=0.6
        )
    else:
        (listas, err) = with_minimum_spinner(
            lambda: fetch_lists_request(),
            text=f"Procurando lista '{key}'...",
            min_seconds=0.6
        )
    if err:
        fancy_header([f"Erro: {err}"])
        return None
    match = None
    partial_matches = []
    for item in listas or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("id")) == key:
            match = item
            break
        nome = item.get("nome") or ""
        nome_norm = _norm_command_name(nome)
        if nome_norm == key_norm:
            match = item
            break
        if key_norm and key_norm in nome_norm:
            partial_matches.append(item)
    if not match:
        if len(partial_matches) == 1:
            match = partial_matches[0]
        elif len(partial_matches) > 1:
            nomes = [item.get('nome') or str(item.get('id')) for item in partial_matches[:5]]
            fancy_header([f"Várias listas correspondem a '{key}': {', '.join(nomes)}"])
            return None
    if not match:
        fancy_header([f"Não encontrei a lista '{key}'."])
        return None
    ctx = OpenListContext(match, is_waiting=is_waiting)
    ok, fetch_err = ctx.fetch_and_cache_lines()
    if not ok:
        fancy_header([f"❌ Erro ao carregar linhas: {fetch_err}"])
        return None
    fancy_header([f"✅ LISTA '{match.get('nome') or match.get('id')}' ABERTA" +
                  (" (ESPERA)" if is_waiting else "")])
    return ctx

def cmd_delete_list(raw_name):
    key = raw_name.strip()
    key_norm = _norm_command_name(key)
    (listas, err) = with_minimum_spinner(lambda: fetch_lists_request(), text=f"Procurando lista '{key}'...", min_seconds=0.6)
    if err:
        print(f"Erro ao buscar listas: {err}")
        return False
    match = None
    partial_matches = []
    for item in listas or []:
        if not isinstance(item, dict):
            continue
        id_str = str(item.get("id") or "")
        name = item.get("nome") or item.get("name") or ""
        if key_norm == _norm_command_name(id_str) or key_norm == _norm_command_name(name):
            match = item
            break
        if key_norm in _norm_command_name(name) or key_norm in _norm_command_name(id_str):
            partial_matches.append(item)
    if not match:
        if len(partial_matches) == 1:
            match = partial_matches[0]
        elif partial_matches:
            print("Várias correspondências encontradas:")
            for it in partial_matches:
                print(f" - {it.get('id')} : {it.get('nome')}")
            print("Seja mais específico.")
            return False
        else:
            print("Lista não encontrada.")
            return False
    confirm = input(f"Tem certeza que deseja deletar a lista '{match.get('nome')}' (ID {match.get('id')})? [y/N]: ").strip().lower()
    if confirm != 'y':
        print("Operação cancelada.")
        return False
    url = f"{API_BASE.rstrip('/')}/listas/{match.get('id')}"
    try:
        r = requests.delete(url, timeout=8)
        if r.status_code >= 400:
            print(f"Erro ao deletar lista: HTTP {r.status_code} - {getattr(r, 'text', '')}")
            return False
        print(f"Lista '{match.get('nome')}' deletada com sucesso.")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Erro de requisição: {e}")
        return False

def cmd_create_list(nome, is_waiting=False):
    """Cria uma nova lista (principal ou espera)."""
    url = f"{API_BASE.rstrip('/')}/wait/listas" if is_waiting else f"{API_BASE.rstrip('/')}/listas"
    try:
        r = requests.post(url, json={"nome": nome}, timeout=6)
        if r.status_code >= 400:
            print(f"Erro ao criar lista: {r.status_code} - {r.text}")
        else:
            data = r.json()
            print(f"Lista '{nome}' criada com sucesso (ID: {data.get('id')})")
    except Exception as e:
        print(f"Erro de rede: {e}")

def cmd_migrate_wait(wait_list_id=None):
    """
    Migração seletiva: exibe linhas da lista de espera, usuário escolhe quais
    pela posição (número) e para qual lista principal.
    """
    if not wait_list_id:
        print("Uso: migrate_wait <id_lista_espera>")
        return

    # 1. Buscar lista de espera
    listas_espera, err = fetch_wait_lists_request()
    if err:
        print(f"Erro ao buscar listas de espera: {err}")
        return
    wait_list = next((l for l in listas_espera if str(l.get('id')) == str(wait_list_id)), None)
    if not wait_list:
        print(f"Lista de espera com ID {wait_list_id} não encontrada.")
        return

    # 2. Buscar linhas da lista de espera
    linhas, err = fetch_wait_lines_request(wait_list_id)
    if err:
        print(f"Erro ao buscar linhas: {err}")
        return
    if not linhas:
        print("Esta lista de espera está vazia.")
        return

    # Ordenar para exibição consistente
    linhas_ordenadas = sorted(linhas, key=lambda x: x.get('nome', '').casefold())

    # 3. Exibir linhas numeradas com indicador de migração
    clear_screen()
    print("=" * 80)
    print(f"LISTA DE ESPERA: {wait_list['nome']} (ID {wait_list_id})")
    print("=" * 80)
    for idx, linha in enumerate(linhas_ordenadas, start=1):
        migrado = linha.get('migrated', 0)
        marcador = "[M] " if migrado else "    "
        print(f"{idx:3d}. {marcador}{linha['nome']} (ID:{linha['id']})")
    print("-" * 80)

    # 4. Perguntar quais linhas migrar (por POSIÇÃO)
    while True:
        raw = input("Quais linhas você quer migrar? (digite os números de posição separados por vírgula, ex: 1,3,5): ").strip()
        if not raw:
            print("Nenhum número informado. Operação cancelada.")
            return
        indices = []
        for part in raw.split(','):
            part = part.strip()
            if part.isdigit():
                indices.append(int(part))
        if not indices:
            print("Números inválidos. Tente novamente.")
            continue
        # Validar intervalos
        invalidos = [i for i in indices if i < 1 or i > len(linhas_ordenadas)]
        if invalidos:
            print(f"Números fora do intervalo (1..{len(linhas_ordenadas)}): {', '.join(map(str, invalidos))}")
            continue
        # Pegar os objetos das linhas selecionadas
        linhas_selecionadas = [linhas_ordenadas[i-1] for i in indices]
        # Verificar se já foram migradas
        ja_migrados = [l for l in linhas_selecionadas if l.get('migrated', 0) == 1]
        if ja_migrados:
            nomes = [l['nome'] for l in ja_migrados]
            print(f"As seguintes linhas já foram migradas anteriormente: {', '.join(nomes)}")
            continuar = input("Deseja continuar apenas com as não migradas? (s/N): ").strip().lower()
            if continuar != 's':
                continue
            # Filtrar apenas as não migradas
            linhas_selecionadas = [l for l in linhas_selecionadas if l.get('migrated', 0) == 0]
        if not linhas_selecionadas:
            print("Nenhuma linha válida para migrar. Cancelando.")
            return
        break

    # 5. Buscar listas principais
    listas_principais, err = fetch_lists_request()
    if err:
        print(f"Erro ao buscar listas principais: {err}")
        return
    if not listas_principais:
        print("Nenhuma lista principal disponível. Crie uma primeiro.")
        return

    # 6. Exibir listas principais numeradas
    clear_screen()
    print("=" * 80)
    print("LISTAS PRINCIPAIS DISPONÍVEIS")
    print("=" * 80)
    for idx, lista in enumerate(listas_principais, start=1):
        print(f"{idx:3d}. {lista['nome']} (ID:{lista['id']})")
    print("-" * 80)

    while True:
        escolha = input("Para qual lista do banco principal você deseja migrar? (número): ").strip()
        if escolha.isdigit():
            idx = int(escolha) - 1
            if 0 <= idx < len(listas_principais):
                main_list = listas_principais[idx]
                break
        print("Opção inválida. Tente novamente.")

    # 7. Confirmar
    clear_screen()
    print("=" * 80)
    print("RESUMO DA MIGRAÇÃO SELETIVA")
    print("=" * 80)
    print(f"Lista de espera: {wait_list['nome']}")
    print(f"Linhas a migrar: {', '.join(l['nome'] for l in linhas_selecionadas)}")
    print(f"Lista destino: {main_list['nome']} (ID {main_list['id']})")
    print("=" * 80)
    confirm = input("Confirmar migração? (s/N): ").strip().lower()
    if confirm != 's':
        print("Migração cancelada.")
        return

    # 8. Chamar o endpoint seletivo
    url = f"{API_BASE.rstrip('/')}/migrate/wait/to/main/selective"
    payload = {
        "wait_list_id": wait_list_id,
        "linha_ids": [l['id'] for l in linhas_selecionadas],
        "main_list_id": main_list['id']
    }
    try:
        print("\n⏳ Migrando...")
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code != 200:
            print(f"Erro na migração: {r.status_code} - {r.text}")
            return
        data = r.json()
        print(f"✅ Migrados com sucesso: {data.get('migrados', 0)} itens.")
        if data.get('erros'):
            print("⚠️ Erros:")
            for erro in data['erros']:
                print(f"  - {erro}")
    except Exception as e:
        print(f"Erro de rede: {e}")

def cmd_move():
    """
    Comando interativo para mover itens entre listas do banco principal.
    O usuário escolhe os itens pelo número de ordem (posição) exibido na lista.
    """
    # Buscar listas principais
    listas, err = fetch_lists_request()
    if err:
        print(f"Erro ao buscar listas: {err}")
        return
    if not listas:
        print("Nenhuma lista principal disponível.")
        return

    # Exibir listas numeradas
    clear_screen()
    print("=" * 80)
    print("LISTAS PRINCIPAIS DISPONÍVEIS")
    print("=" * 80)
    for idx, lista in enumerate(listas, start=1):
        print(f"{idx:3d}. {lista['nome']} (ID:{lista['id']})")
    print("-" * 80)

    # Escolher lista de origem
    while True:
        escolha = input("Qual lista você quer usar como ORIGEM? (número): ").strip()
        if escolha.isdigit():
            idx = int(escolha) - 1
            if 0 <= idx < len(listas):
                origem = listas[idx]
                break
        print("Opção inválida. Tente novamente.")

    # Buscar linhas da lista origem
    linhas, err = fetch_lines_request(origem['id'])
    if err:
        print(f"Erro ao buscar linhas: {err}")
        return
    if not linhas:
        print("Esta lista está vazia.")
        return

    # Exibir linhas numeradas (ordenadas por nome para consistência)
    linhas_ordenadas = sorted(linhas, key=lambda x: x.get('nome', '').casefold())
    clear_screen()
    print("=" * 80)
    print(f"LISTA ORIGEM: {origem['nome']} (ID {origem['id']})")
    print("=" * 80)
    for idx, linha in enumerate(linhas_ordenadas, start=1):
        print(f"{idx:3d}. {linha['nome']} (ID:{linha['id']})")
    print("-" * 80)

    # Perguntar quais linhas mover (por POSIÇÃO, não ID)
    while True:
        raw = input("Quais itens você quer mover? (digite os números de posição separados por vírgula, ex: 1,3,5): ").strip()
        if not raw:
            print("Nenhum número informado. Operação cancelada.")
            return
        indices = []
        for part in raw.split(','):
            part = part.strip()
            if part.isdigit():
                indices.append(int(part))
        if not indices:
            print("Números inválidos. Tente novamente.")
            continue
        # Validar se todos os índices estão dentro do range
        invalidos = [i for i in indices if i < 1 or i > len(linhas_ordenadas)]
        if invalidos:
            print(f"Números fora do intervalo (1..{len(linhas_ordenadas)}): {', '.join(map(str, invalidos))}")
            continue
        # Converter índices para IDs reais
        ids_selecionados = [linhas_ordenadas[i-1]['id'] for i in indices]
        break

    # Escolher lista de destino (excluindo a origem)
    listas_destino = [l for l in listas if l['id'] != origem['id']]
    if not listas_destino:
        print("Não há outra lista para mover. Operação cancelada.")
        return

    clear_screen()
    print("=" * 80)
    print("LISTAS DESTINO DISPONÍVEIS (excluindo origem)")
    print("=" * 80)
    for idx, lista in enumerate(listas_destino, start=1):
        print(f"{idx:3d}. {lista['nome']} (ID:{lista['id']})")
    print("-" * 80)

    while True:
        escolha = input("Para qual lista você deseja mover? (número): ").strip()
        if escolha.isdigit():
            idx = int(escolha) - 1
            if 0 <= idx < len(listas_destino):
                destino = listas_destino[idx]
                break
        print("Opção inválida. Tente novamente.")

    # Confirmar
    clear_screen()
    print("=" * 80)
    print("RESUMO DA MOVIMENTAÇÃO")
    print("=" * 80)
    print(f"Origem: {origem['nome']} (ID {origem['id']})")
    print(f"Itens a mover (posições): {', '.join(str(i) for i in indices)}")
    print(f"Destino: {destino['nome']} (ID {destino['id']})")
    print("=" * 80)
    confirm = input("Confirmar movimentação? (s/N): ").strip().lower()
    if confirm != 's':
        print("Movimentação cancelada.")
        return

    # Chamar endpoint
    url = f"{API_BASE.rstrip('/')}/move/items"
    payload = {
        "origem_lista_id": origem['id'],
        "destino_lista_id": destino['id'],
        "item_ids": ids_selecionados
    }
    try:
        print("\n⏳ Movendo...")
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code != 200:
            print(f"Erro na movimentação: {r.status_code} - {r.text}")
            return
        data = r.json()
        print(f"✅ Movidos com sucesso: {data.get('movidos', 0)} itens.")
        if data.get('erros'):
            print("⚠️ Erros:")
            for erro in data['erros']:
                print(f"  - {erro}")
    except Exception as e:
        print(f"Erro de rede: {e}")

def cmd_clear_wait():
    confirm = input("⚠️ Tem certeza que deseja limpar todo o banco de espera? (y/N): ").strip().lower()
    if confirm == "y":
        url = f"{API_BASE.rstrip('/')}/wait/clear?confirm=true"
        try:
            r = requests.delete(url, timeout=10)
            if r.status_code == 200:
                print("Banco de espera limpo com sucesso.")
            else:
                print(f"Erro: {r.status_code}")
        except Exception as e:
            print(f"Erro: {e}")
    else:
        print("Operação cancelada.")

# DEPOIS - Parser mais robusto

def parse_command(line):
    """
    Parseia o comando de forma mais robusta.
    Suporta comandos com aspas simples e duplas.
    """
    line = line.strip()
    if not line:
        return None, []
    
    # Se o comando começa com create_line, open, etc, trata de forma especial
    # Primeiro, identifica o comando (primeira palavra)
    parts = line.split(' ', 1)
    cmd = parts[0].lower()
    
    if len(parts) == 1:
        return cmd, []
    
    # Para o resto, tenta parsear respeitando aspas
    args_str = parts[1]
    args = []
    current = ''
    in_quotes = False
    quote_char = ''
    i = 0
    
    while i < len(args_str):
        ch = args_str[i]
        
        if not in_quotes:
            if ch == '"' or ch == "'":
                in_quotes = True
                quote_char = ch
                i += 1
                continue
            elif ch == ' ':
                if current:
                    args.append(current)
                    current = ''
                i += 1
                continue
            else:
                current += ch
                i += 1
        else:
            if ch == quote_char:
                in_quotes = False
                quote_char = ''
                i += 1
                continue
            else:
                current += ch
                i += 1
    
    if current:
        args.append(current)
    
    return cmd, args

# -------------------------
# Loop principal
# -------------------------
def main():
    current_ctx = None
    fancy_header(["BEM VINDO AO CLI INTERATIVO"])
    while True:
        try:
            if current_ctx:
                prompt = f"{current_ctx.name}> "
            else:
                prompt = PROMPT_MAIN
            line = input(prompt).strip()
            if not line:
                continue
            cmd, args = parse_command(line)

            if cmd in ("help", "?"):
                if current_ctx is None:
                    print_help_main()
                elif isinstance(current_ctx, ItemContext):
                    print_help_item()
                else:
                    print_help_list()
                continue

            # --- Comandos globais ---
            if not current_ctx:
                if cmd == "show_lists":
                    (listas, err) = with_minimum_spinner(lambda: fetch_lists_request(), text="Buscando listas...", min_seconds=0.6)
                    fancy_header(["LISTAS DISPONÍVEIS"])
                    if err:
                        typewriter_print(f"Erro: {err}", speed=0.002)
                    else:
                        display = PaginatedDisplay(listas or [], "LISTAS DISPONÍVEIS", items_per_page=None)
                        display.render_page()
                    continue

                if cmd == "show_wait_lists":
                    (listas, err) = with_minimum_spinner(lambda: fetch_wait_lists_request(), text="Buscando listas de espera...", min_seconds=0.6)
                    fancy_header(["LISTAS DE ESPERA"])
                    if err:
                        typewriter_print(f"Erro: {err}", speed=0.002)
                    else:
                        display = PaginatedDisplay(listas or [], "LISTAS DE ESPERA", items_per_page=None)
                        display.render_page()
                    continue

                if cmd == "create_list":
                    if not args:
                        print("Uso: create_list <nome>")
                        continue
                    nome = " ".join(args)
                    cmd_create_list(nome, is_waiting=False)
                    continue

                if cmd == "create_wait_list":
                    if not args:
                        print("Uso: create_wait_list <nome>")
                        continue
                    nome = " ".join(args)
                    cmd_create_list(nome, is_waiting=True)
                    continue

                if cmd == "delete_list":
                    if not args:
                        print("Uso: delete_list <id|nome>")
                        continue
                    key = " ".join(args)
                    cmd_delete_list(key)
                    continue

                if cmd == "open":
                    if not args:
                        print("Uso: open <id|nome>")
                        continue
                    listkey = " ".join(args)
                    ctx = cmd_open_list(listkey, is_waiting=False)
                    if ctx:
                        current_ctx = ctx
                    continue

                if cmd == "open_wait":
                    if not args:
                        print("Uso: open_wait <id|nome>")
                        continue
                    listkey = " ".join(args)
                    ctx = cmd_open_list(listkey, is_waiting=True)
                    if ctx:
                        current_ctx = ctx
                    continue

                if cmd == "verify_api":
                    verify_anilist_api()
                    continue

                if cmd == "migrate_wait":
                    lista_id = args[0] if args else None
                    cmd_migrate_wait(lista_id, dry_run=False)
                    continue

                if cmd == "move":
                    cmd_move()
                    continue

                if cmd == "clear_wait":
                    cmd_clear_wait()
                    continue

                if cmd in ("clear", "cls"):
                    clear_screen()
                    continue

                if cmd in ("exit", "quit"):
                    break

                typewriter_print(f"Comando inválido: {cmd}", speed=0.003)
                continue

            # --- Contexto de lista ou item ---

            # Comandos de criação de linha (dentro do contexto)
            if cmd == "create_line":
                if not args:
                    print("Uso: create_line <nome>")
                    continue
                nome = " ".join(args)
                if isinstance(current_ctx, OpenListContext):
                    current_ctx.interactive_create_line(nome, is_waiting=current_ctx.is_waiting)
                else:
                    print("Este comando só pode ser usado dentro de uma lista aberta.")
                continue

            if cmd == "create_wait_line":
                if not args:
                    print("Uso: create_wait_line <nome>")
                    continue
                nome = " ".join(args)
                if isinstance(current_ctx, OpenListContext):
                    print("Use create_line; a lista atual já define se será criado no banco principal ou de espera.")
                    current_ctx.interactive_create_line(nome, is_waiting=current_ctx.is_waiting)
                else:
                    print("Este comando só pode ser usado dentro de uma lista aberta.")
                continue

            # Se estamos dentro de um ItemContext, tratar comandos específicos
            if isinstance(current_ctx, ItemContext):
                # nav
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

                if cmd == "show_details":
                    current_ctx.show_details()
                    continue

                if cmd == "edit" and args:
                    field = args[0]
                    newval = " ".join(args[1:]) if len(args) > 1 else ""
                    if newval == "":
                        typewriter_print("Uso: edit <campo> <novo_valor>  (ou só 'edit' para modo interativo)", speed=0.003)
                        continue
                    msg = current_ctx.edit_field(field, newval)
                    typewriter_print(msg, speed=0.003)
                    continue

                if cmd == "edit":
                    msg = current_ctx.interactive_edit()
                    typewriter_print(msg, speed=0.003)
                    continue

                if cmd == "save":
                    ok, msg = current_ctx.save()
                    if ok:
                        typewriter_print(msg, speed=0.003)
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
                            parent = current_ctx.parent
                            parent.fetch_and_cache_lines()
                            current_ctx = parent
                        else:
                            typewriter_print(f"Erro: {msg}", speed=0.003)
                    else:
                        typewriter_print("Exclusão cancelada.", speed=0.003)
                    continue

                if cmd == "check":
                    ok, msg = current_ctx.check()
                    if ok:
                        typewriter_print(msg, speed=0.003)
                    else:
                        typewriter_print(f"Erro: {msg}", speed=0.003)
                    continue

                if cmd in ("back", "b"):
                    fancy_header([f"Voltando para '{current_ctx.parent.name}'"])
                    current_ctx = current_ctx.parent
                    continue

                # se não tratado, cai no próximo bloco

            # Comandos de lista (OpenListContext)
            if isinstance(current_ctx, OpenListContext):
                # Tratamento de navegação da exibição atual
                if current_ctx.current_display and current_ctx.current_display.handle_command(cmd, args):
                    continue

                if cmd.startswith("sort_"):
                    if not current_ctx.current_display:
                        typewriter_print("Nenhuma exibição ativa para ordenar. Use 'show_lines' primeiro.", speed=0.003)
                        continue
                    method = cmd[len("sort_"):]
                    reverse_flag = False
                    if args:
                        if "-r" in args or "--reverse" in args:
                            reverse_flag = True
                    method_key = method
                    if method == "rate" and reverse_flag:
                        method_key = "rate -r"
                    if method_key in ("0-9", "9-0", "a-z", "z-a", "rate", "rate -r"):
                        msg = current_ctx.current_display.apply_sort(method_key)
                        typewriter_print(msg, speed=0.003)
                        current_ctx.current_display.render_page(1)
                    else:
                        typewriter_print("Método de sort desconhecido.", speed=0.003)
                    continue

                if cmd.startswith("open_"):
                    key = line[len("open_"):].strip()
                    if not key and args:
                        key = " ".join(args)
                    if key.isdigit():
                        item_ctx, err = current_ctx.open_item_by_index(int(key))
                    else:
                        item_ctx, err = current_ctx.open_item_by_name(key)
                    if err:
                        typewriter_print(f"Erro: {err}", speed=0.003)
                    else:
                        current_ctx = item_ctx
                        current_ctx.show_details()
                    continue

                if cmd == "show_lines":
                    filtro = " ".join(args) if args else None
                    current_ctx.show_lines(filtro)
                    continue

                if cmd == "show_tags":
                    current_ctx.show_tags()
                    continue

                if cmd.startswith("search_"):
                    termo = cmd[len("search_"):] or (args[0] if args else "")
                    if not termo:
                        typewriter_print("Uso: search_<nome> (ex.: search_Naruto)", speed=0.003)
                    else:
                        current_ctx.search_items_by_name(termo)
                    continue

                if cmd.startswith("show_"):
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
                    continue

                if cmd == "export_list":
                    filename_arg = args[0] if args else None
                    ok, msg = current_ctx.export_current_display(filename_arg)
                    if ok:
                        typewriter_print(msg, speed=0.003)
                    else:
                        typewriter_print(f"Erro: {msg}", speed=0.003)
                    continue

                if cmd == "next":
                    if current_ctx.current_display:
                        current_ctx.current_display.handle_command("next", [])
                    else:
                        typewriter_print("Nenhuma exibição ativa. Use 'show_lines' primeiro.", speed=0.003)
                    continue

                if cmd == "prev":
                    if current_ctx.current_display:
                        current_ctx.current_display.handle_command("prev", [])
                    else:
                        typewriter_print("Nenhuma exibição ativa. Use 'show_lines' primeiro.", speed=0.003)
                    continue

                if cmd.isdigit():
                    if current_ctx.current_display:
                        current_ctx.current_display.handle_command(cmd, [])
                    else:
                        typewriter_print("Nenhuma exibição ativa. Use 'show_lines' primeiro.", speed=0.003)
                    continue

                if cmd in ("back", "b"):
                    fancy_header([f"Saindo do contexto '{current_ctx.name}'"])
                    current_ctx = None
                    continue

                if cmd in ("clear", "cls"):
                    clear_screen()
                    continue

                if cmd in ("exit", "quit"):
                    break

                typewriter_print(f"Comando inválido em '{current_ctx.name}': {cmd}", speed=0.003)

        except (KeyboardInterrupt, EOFError):
            print()
            break

if __name__ == "__main__":
    main()