from flask import Flask, Response, render_template, request, jsonify
import sqlite3
import requests
import re
from datetime import datetime, timedelta, timezone
import subprocess
import json
from deep_translator import GoogleTranslator
import traceback
import time
from flask_caching import Cache

app = Flask(__name__)

index_tracker = {}
index_tracker_manga = {}

def init_db():
    """Cria as tabelas do banco de dados SQLite, caso não existam."""
    with sqlite3.connect("list_it.db") as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS listas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS linhas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lista_id INTEGER NOT NULL,
                nome TEXT NOT NULL,
                alias TEXT,
                tags TEXT,
                conteudo TEXT NOT NULL,
                status TEXT NOT NULL,
                episodio INTEGER,
                opiniao TEXT NOT NULL,
                imagem_url TEXT,
                last_highlight TEXT,
                sinonimos TEXT,
                sinopse TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lista_id) REFERENCES listas(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sequencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                descricao TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sequencia_itens (
                sequencia_id INTEGER NOT NULL,
                linha_id INTEGER NOT NULL,
                ordem INTEGER NOT NULL,
                PRIMARY KEY (sequencia_id, linha_id),
                FOREIGN KEY (sequencia_id) REFERENCES sequencias(id) ON DELETE CASCADE,
                FOREIGN KEY (linha_id) REFERENCES linhas(id) ON DELETE CASCADE
            )
        """)
        
        conn.commit()
    print("[INIT] Banco de dados inicializado com suporte a sequências.")

init_db()

def get_db_connection():
    conn = sqlite3.connect('list_it.db')
    conn.row_factory = sqlite3.Row
    return conn

# ============================================================
# NOVO: Banco de dados de espera (waiting_list.db)
# ============================================================

WAITING_DB = "waiting_list.db"

def init_waiting_db():
    """Cria as tabelas do banco de espera, com a coluna migrated."""
    with sqlite3.connect(WAITING_DB) as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS listas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS linhas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lista_id INTEGER NOT NULL,
                nome TEXT NOT NULL,
                alias TEXT,
                tags TEXT,
                conteudo TEXT NOT NULL,
                status TEXT NOT NULL,
                episodio INTEGER,
                opiniao TEXT NOT NULL,
                imagem_url TEXT,
                last_highlight TEXT,
                sinonimos TEXT,
                sinopse TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                migrated INTEGER DEFAULT 0,   -- NOVA COLUNA
                FOREIGN KEY (lista_id) REFERENCES listas(id)
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sequencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                descricao TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sequencia_itens (
                sequencia_id INTEGER NOT NULL,
                linha_id INTEGER NOT NULL,
                ordem INTEGER NOT NULL,
                PRIMARY KEY (sequencia_id, linha_id),
                FOREIGN KEY (sequencia_id) REFERENCES sequencias(id) ON DELETE CASCADE,
                FOREIGN KEY (linha_id) REFERENCES linhas(id) ON DELETE CASCADE
            )
        """)
        
        conn.commit()
    print("[WAITING] Banco de espera inicializado.")

init_waiting_db()

def get_waiting_db_connection():
    conn = sqlite3.connect(WAITING_DB)
    conn.row_factory = sqlite3.Row
    return conn

# ============================================================
# ENDPOINTS: Listas de espera
# ============================================================

@app.route("/wait/listas", methods=["GET"])
@app.route("/waiting/listas", methods=["GET"])
def get_waiting_listas():
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM listas")
    listas = [{"id": row[0], "nome": row[1]} for row in cursor.fetchall()]
    conn.close()
    return jsonify(listas)

@app.route("/wait/listas", methods=["POST"])
@app.route("/waiting/listas", methods=["POST"])
def add_waiting_lista():
    data = request.json
    nome = data.get("nome")
    if not nome:
        return jsonify({"error": "Nome da lista é obrigatório"}), 400
    
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO listas (nome) VALUES (?)", (nome,))
    conn.commit()
    lista_id = cursor.lastrowid
    conn.close()
    return jsonify({"id": lista_id, "nome": nome})

@app.route("/wait/listas/<int:lista_id>", methods=["DELETE"])
@app.route("/waiting/listas/<int:lista_id>", methods=["DELETE"])
def delete_waiting_lista(lista_id):
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nome FROM listas WHERE id = ?", (lista_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Lista não encontrada."}), 404
    
    nome = row['nome']
    cursor.execute("DELETE FROM linhas WHERE lista_id = ?", (lista_id,))
    cursor.execute("DELETE FROM listas WHERE id = ?", (lista_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": f"Lista '{nome}' excluída com sucesso."})


# ============================================================
# ENDPOINTS: Linhas de espera
# ============================================================

@app.route("/wait/linhas/<int:lista_id>", methods=["GET"])
@app.route("/waiting/linhas/<int:lista_id>", methods=["GET"])
def get_waiting_linhas(lista_id):
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, lista_id, nome, tags, conteudo, status, episodio,
            opiniao, imagem_url, last_highlight, sinopse, sinonimos, migrated
        FROM linhas
        WHERE lista_id = ?
    """, (lista_id,))
    linhas = []
    for row in cursor.fetchall():
        sinopse = row['sinopse'] or ""
        sinonimos = json.loads(row['sinonimos']) if row['sinonimos'] else []
        linhas.append({
            "id": row['id'],
            "lista_id": row['lista_id'],
            "nome": row['nome'],
            "tags": row['tags'],
            "conteudo": row['conteudo'],
            "status": row['status'],
            "episodio": row['episodio'],
            "opiniao": row['opiniao'],
            "imagem_url": row['imagem_url'],
            "last_highlight": row['last_highlight'],
            "sinopse": sinopse,
            "sinonimos": sinonimos,
            "migrated": row['migrated']
        })
    conn.close()
    return jsonify(linhas)

@app.route("/wait/linhas", methods=["POST"])
@app.route("/waiting/linhas", methods=["POST"])
def add_waiting_linha():
    data = request.json
    required = ["lista_id", "nome", "conteudo", "status", "opiniao"]
    for field in required:
        if field not in data:
            return jsonify({"error": f"Campo '{field}' é obrigatório"}), 400
    
    now = datetime.now(timezone.utc).isoformat()
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO linhas (lista_id, nome, tags, conteudo, status, episodio, opiniao, imagem_url, sinonimos, sinopse, last_highlight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["lista_id"],
        data["nome"],
        data.get("tags", ""),
        data["conteudo"],
        data["status"],
        data.get("episodio"),
        data["opiniao"],
        data.get("imagem_url", ""),
        json.dumps(data.get("sinonimos", [])),
        data.get("sinopse", ""),
        now
    ))
    conn.commit()
    linha_id = cursor.lastrowid
    conn.close()
    return jsonify({"id": linha_id, "lista_id": data["lista_id"], "nome": data["nome"], "last_highlight": now})

@app.route("/wait/linhas/<int:linha_id>", methods=["PUT"])
@app.route("/waiting/linhas/<int:linha_id>", methods=["PUT"])
def update_waiting_linha(linha_id):
    data = request.json
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM linhas WHERE id = ?", (linha_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Linha não encontrada"}), 404
    
    updates = []
    params = []
    for field in ["nome", "tags", "conteudo", "status", "episodio", "opiniao", "imagem_url", "sinopse"]:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])
    
    if "sinonimos" in data:
        updates.append("sinonimos = ?")
        params.append(json.dumps(data["sinonimos"]))
    
    if not updates:
        conn.close()
        return jsonify({"message": "Nenhum campo para atualizar"}), 200
    
    params.append(linha_id)
    cursor.execute(f"UPDATE linhas SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return jsonify({"message": "Linha atualizada com sucesso!"})

@app.route("/wait/linhas/<int:linha_id>", methods=["DELETE"])
@app.route("/waiting/linhas/<int:linha_id>", methods=["DELETE"])
def delete_waiting_linha(linha_id):
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Linha não encontrada."}), 404
    
    nome = row['nome']
    cursor.execute("DELETE FROM linhas WHERE id = ?", (linha_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": f"Linha '{nome}' excluída com sucesso."})

# ============================================================
# ENDPOINT: Tags globais (principal e waiting)
# ============================================================

@app.route("/tags/all", methods=["GET"])
def get_all_tags():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT tags FROM linhas")
    rows = cursor.fetchall()
    tags_set = set()
    for row in rows:
        if row['tags']:
            for tag in row['tags'].split(','):
                t = tag.strip()
                if t:
                    tags_set.add(t)
    conn.close()
    return jsonify(sorted(tags_set))

@app.route("/wait/tags/all", methods=["GET"])
@app.route("/wait/tags/all", methods=["GET"])
@app.route("/waiting/tags/all", methods=["GET"])
def get_all_waiting_tags():
    conn = get_waiting_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT tags FROM linhas")
    rows = cursor.fetchall()
    tags_set = set()
    for row in rows:
        if row['tags']:
            for tag in row['tags'].split(','):
                t = tag.strip()
                if t:
                    tags_set.add(t)
    conn.close()
    return jsonify(sorted(tags_set))

# ============================================================
# MIGRAÇÃO: Banco de espera → Banco principal (com AniList)
# ============================================================

@app.route("/migrate/wait/to/main", methods=["POST"])
@app.route("/migrate/wait/to/main", methods=["POST"])
@app.route("/migrate/waiting/to/main", methods=["POST"])
def migrate_waiting_to_main():
    data = request.get_json() or {}
    dry_run = data.get("dry_run", False)
    lista_id_filter = data.get("lista_id")
    
    wait_conn = get_waiting_db_connection()
    main_conn = get_db_connection()
    wait_cursor = wait_conn.cursor()
    main_cursor = main_conn.cursor()
    
    if lista_id_filter:
        wait_cursor.execute("SELECT id, nome FROM listas WHERE id = ?", (lista_id_filter,))
    else:
        wait_cursor.execute("SELECT id, nome FROM listas")
    
    waiting_lists = wait_cursor.fetchall()
    
    if not waiting_lists:
        wait_conn.close()
        main_conn.close()
        return jsonify({
            "mensagem": "Nenhuma lista no banco de espera.",
            "migrados": 0,
            "erros": []
        })
    
    resultados = {
        "listas_migradas": 0,
        "linhas_migradas": 0,
        "linhas_com_erro": 0,
        "erros": [],
        "detalhes": []
    }
    
    for wait_list in waiting_lists:
        wait_list_id = wait_list["id"]
        wait_list_nome = wait_list["nome"]
        
        main_cursor.execute("SELECT id FROM listas WHERE nome = ?", (wait_list_nome,))
        existing = main_cursor.fetchone()
        
        if dry_run:
            resultados["detalhes"].append({
                "lista": wait_list_nome,
                "acao": "simularia criação" if not existing else "já existe",
                "itens": []
            })
            continue
        
        if not existing:
            main_cursor.execute("INSERT INTO listas (nome) VALUES (?)", (wait_list_nome,))
            main_lista_id = main_cursor.lastrowid
            main_conn.commit()
            
            subprocess.run(['git', 'add', 'list_it.db'])
            subprocess.run(['git', 'commit', '-m', f"Migrando lista: {wait_list_nome}"])
            subprocess.run(['git', 'push'])
        else:
            main_lista_id = existing["id"]
        
        wait_cursor.execute("""
            SELECT id, nome, tags, conteudo, status, episodio, opiniao,
                   imagem_url, sinonimos, sinopse
              FROM linhas
             WHERE lista_id = ?
        """, (wait_list_id,))
        waiting_lines = wait_cursor.fetchall()
        
        for wl in waiting_lines:
            try:
                nome_item = wl["nome"]
                conteudo_type = wl["conteudo"]
                
                media_type = "ANIME" if conteudo_type.lower() in ["anime", "filme"] else "MANGA"
                details = fetch_media_details(nome_item, media_type)
                
                if details:
                    imagem_url = fetch_anime_image_url(nome_item) if media_type == "ANIME" else fetch_manga_image_url(nome_item)
                    sinonimos = details["sinonimos"]
                    sinopse = details["sinopse"]
                else:
                    imagem_url = wl["imagem_url"] or ""
                    try:
                        sinonimos = json.loads(wl["sinonimos"]) if wl["sinonimos"] else []
                    except json.JSONDecodeError:
                        sinonimos = []
                    sinopse = wl["sinopse"] or ""
                
                main_cursor.execute("""
                    INSERT INTO linhas (
                        lista_id, nome, tags, conteudo, status, episodio, opiniao,
                        imagem_url, sinonimos, sinopse
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    main_lista_id,
                    nome_item,
                    wl["tags"],
                    conteudo_type,
                    wl["status"],
                    wl["episodio"],
                    wl["opiniao"],
                    imagem_url,
                    json.dumps(sinonimos, ensure_ascii=False),
                    sinopse
                ))
                main_conn.commit()
                
                subprocess.run(['git', 'add', 'list_it.db'])
                subprocess.run(['git', 'commit', '-m', f"Migrando linha: {nome_item}"])
                subprocess.run(['git', 'push'])
                
                resultados["linhas_migradas"] += 1
                resultados["detalhes"].append({
                    "linha": nome_item,
                    "lista": wait_list_nome,
                    "status": "ok",
                    "imagem": "buscada" if details else "mantida"
                })
                
                wait_cursor.execute("DELETE FROM linhas WHERE id = ?", (wl["id"],))
                wait_conn.commit()
                
            except Exception as e:
                resultados["linhas_com_erro"] += 1
                resultados["erros"].append({
                    "linha": wl["nome"],
                    "lista": wait_list_nome,
                    "erro": str(e)
                })
                print(f"[MIGRATE] Erro ao migrar linha {wl['nome']}: {e}")
        
        wait_cursor.execute("SELECT COUNT(*) FROM linhas WHERE lista_id = ?", (wait_list_id,))
        count = wait_cursor.fetchone()[0]
        if count == 0:
            wait_cursor.execute("DELETE FROM listas WHERE id = ?", (wait_list_id,))
            wait_conn.commit()
            resultados["listas_migradas"] += 1
    
    wait_conn.close()
    main_conn.close()
    
    return jsonify({
        "mensagem": "Migração concluída!",
        "listas_migradas": resultados["listas_migradas"],
        "linhas_migradas": resultados["linhas_migradas"],
        "linhas_com_erro": resultados["linhas_com_erro"],
        "erros": resultados["erros"],
        "detalhes": resultados["detalhes"][:20]
    })

@app.route("/migrate/wait/to/main/selective", methods=["POST"])
def migrate_wait_to_main_selective():
    data = request.get_json()
    wait_list_id = data.get("wait_list_id")
    linha_ids = data.get("linha_ids", [])   # lista de IDs das linhas da espera
    main_list_id = data.get("main_list_id")
    
    if not wait_list_id or not linha_ids or not main_list_id:
        return jsonify({"error": "wait_list_id, linha_ids e main_list_id são obrigatórios"}), 400
    
    wait_conn = get_waiting_db_connection()
    main_conn = get_db_connection()
    wait_cursor = wait_conn.cursor()
    main_cursor = main_conn.cursor()
    
    # Verifica se a lista principal existe
    main_cursor.execute("SELECT id FROM listas WHERE id = ?", (main_list_id,))
    if not main_cursor.fetchone():
        wait_conn.close()
        main_conn.close()
        return jsonify({"error": "Lista principal não encontrada"}), 404
    
    resultados = {
        "migrados": 0,
        "erros": []
    }
    
    for linha_id in linha_ids:
        # Busca a linha na espera
        wait_cursor.execute("""
            SELECT id, nome, tags, conteudo, status, episodio, opiniao,
                   imagem_url, sinonimos, sinopse
              FROM linhas
             WHERE id = ? AND lista_id = ?
        """, (linha_id, wait_list_id))
        linha = wait_cursor.fetchone()
        if not linha:
            resultados["erros"].append(f"Linha {linha_id} não encontrada na lista de espera")
            continue
        
        # Verifica se já foi migrada
        if linha.get("migrated", 0) == 1:
            resultados["erros"].append(f"Linha {linha_id} já foi migrada anteriormente")
            continue
        
        # Tenta buscar dados da AniList (opcional, mas mantemos)
        nome_item = linha["nome"]
        conteudo_type = linha["conteudo"]
        media_type = "ANIME" if conteudo_type.lower() in ["anime", "filme"] else "MANGA"
        details = fetch_media_details(nome_item, media_type)
        
        if details:
            imagem_url = fetch_anime_image_url(nome_item) if media_type == "ANIME" else fetch_manga_image_url(nome_item)
            sinonimos = details["sinonimos"]
            sinopse = details["sinopse"]
        else:
            imagem_url = linha["imagem_url"] or ""
            try:
                sinonimos = json.loads(linha["sinonimos"]) if linha["sinonimos"] else []
            except json.JSONDecodeError:
                sinonimos = []
            sinopse = linha["sinopse"] or ""
        
        # Insere na lista principal
        try:
            main_cursor.execute("""
                INSERT INTO linhas (
                    lista_id, nome, tags, conteudo, status, episodio, opiniao,
                    imagem_url, sinonimos, sinopse
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                main_list_id,
                nome_item,
                linha["tags"],
                conteudo_type,
                linha["status"],
                linha["episodio"],
                linha["opiniao"],
                imagem_url,
                json.dumps(sinonimos, ensure_ascii=False),
                sinopse
            ))
            main_conn.commit()
            
            # Marca como migrado na espera
            wait_cursor.execute("UPDATE linhas SET migrated = 1 WHERE id = ?", (linha_id,))
            wait_conn.commit()
            
            resultados["migrados"] += 1
        except Exception as e:
            resultados["erros"].append(f"Erro ao migrar linha {linha_id}: {str(e)}")
    
    wait_conn.close()
    main_conn.close()
    
    # (Opcional) commits git - mantive apenas como exemplo, mas pode ser removido
    # subprocess.run(['git', 'add', 'list_it.db'])
    # subprocess.run(['git', 'commit', '-m', f"Migração seletiva para lista {main_list_id}"])
    # subprocess.run(['git', 'push'])
    
    return jsonify(resultados)

@app.route("/move/items", methods=["POST"])
def move_items():
    """
    Move itens de uma lista para outra no banco principal.
    Payload: { origem_lista_id, destino_lista_id, item_ids: [...] }
    """
    data = request.get_json()
    origem = data.get("origem_lista_id")
    destino = data.get("destino_lista_id")
    item_ids = data.get("item_ids", [])

    if not origem or not destino or not item_ids:
        return jsonify({"error": "origem_lista_id, destino_lista_id e item_ids são obrigatórios"}), 400

    if origem == destino:
        return jsonify({"error": "Origem e destino não podem ser a mesma lista"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    # Verifica se as listas existem
    cursor.execute("SELECT id FROM listas WHERE id = ?", (origem,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Lista de origem não encontrada"}), 404
    cursor.execute("SELECT id FROM listas WHERE id = ?", (destino,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Lista de destino não encontrada"}), 404

    resultados = {"movidos": 0, "erros": []}
    for item_id in item_ids:
        # Verifica se o item existe e pertence à origem
        cursor.execute("SELECT id, nome FROM linhas WHERE id = ? AND lista_id = ?", (item_id, origem))
        row = cursor.fetchone()
        if not row:
            resultados["erros"].append(f"Item {item_id} não encontrado na lista de origem")
            continue
        # Atualiza
        try:
            cursor.execute("UPDATE linhas SET lista_id = ? WHERE id = ?", (destino, item_id))
            conn.commit()
            resultados["movidos"] += 1
        except Exception as e:
            resultados["erros"].append(f"Erro ao mover item {item_id}: {str(e)}")
    conn.close()

    # (Opcional) commits git
    # subprocess.run(['git', 'add', 'list_it.db'])
    # subprocess.run(['git', 'commit', '-m', f"Movendo itens da lista {origem} para {destino}"])
    # subprocess.run(['git', 'push'])

    return jsonify(resultados)

@app.route("/wait/clear", methods=["DELETE"])
@app.route("/wait/clear", methods=["DELETE"])
@app.route("/waiting/clear", methods=["DELETE"])
def clear_waiting_db():
    confirm = request.args.get("confirm", "false").lower() == "true"
    if not confirm:
        return jsonify({"error": "Use ?confirm=true para confirmar"}), 400
    
    with sqlite3.connect(WAITING_DB) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sequencia_itens")
        cursor.execute("DELETE FROM sequencias")
        cursor.execute("DELETE FROM linhas")
        cursor.execute("DELETE FROM listas")
        conn.commit()
    
    return jsonify({"mensagem": "Banco de espera limpo com sucesso."})

# ============================================================
# ROTAS EXISTENTES (mantidas)
# ============================================================

cache = Cache(app, config={
    'CACHE_TYPE': 'SimpleCache',
    'CACHE_DEFAULT_TIMEOUT': 86400
})

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/proxy_image")
def proxy_image():
    url = request.args.get("url")
    if not url or url == "undefined" or url == "null":
        return jsonify({"error": "Parâmetro de URL inválido."}), 400
    resp = requests.get(url, stream=True)
    excluded_headers = ["content-encoding", "transfer-encoding", "content-length"]
    headers = [(name, value) for (name, value) in resp.raw.headers.items()
               if name.lower() not in excluded_headers]
    proxy_resp = Response(resp.content, resp.status_code, headers)
    proxy_resp.headers["Access-Control-Allow-Origin"] = "*"
    return proxy_resp

@app.route("/listas", methods=["GET"])
def get_listas():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM listas")
    listas = [{"id": row[0], "nome": row[1]} for row in cursor.fetchall()]
    return jsonify(listas)

@app.route("/listas", methods=["POST"])
def add_lista():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO listas (nome) VALUES (?)", (data["nome"],))
    conn.commit()
    lista_id = cursor.lastrowid
    conn.close()
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Criando Lista: {data['nome']} id: {lista_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    subprocess.run(['git', 'push'])
    return jsonify({"id": lista_id, "nome": data["nome"]})

@app.route("/listas/<int:lista_id>", methods=["DELETE"])
def delete_lista(lista_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nome FROM listas WHERE id = ?", (lista_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"message": "Lista não encontrada."}), 404
    nome = row['nome']
    try:
        cursor.execute("DELETE FROM linhas WHERE lista_id = ?", (lista_id,))
        cursor.execute("DELETE FROM listas WHERE id = ?", (lista_id,))
        conn.commit()
        conn.close()
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Removendo Lista: {nome} id: {lista_id}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
        return jsonify({"message": "Lista excluída com sucesso."})
    except Exception as e:
        print(f"[DELETE_LISTA] Erro: {e}")
        return jsonify({"message": "Erro ao deletar lista."}), 500

def fetch_anime_image_url(query):
    url = "https://graphql.anilist.co"
    query_graphql = """
        query($search: String) {
            Page(page: 1, perPage: 5) {
                media(search: $search, type: ANIME) {
                    title { romaji english }
                    coverImage { large }
                }
            }
        }
    """
    clean_query = query.strip().replace('-', ' ').replace('_', ' ')
    clean_query = re.sub(r'[^\w\s]', '', clean_query)
    variables = {'search': clean_query}
    try:
        print(f"[ANISEARCH] Buscando imagem do anime para: '{clean_query}'")
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'List_IT/1.0 (+https://github.com)'
        }
        response = requests.post(url, json={'query': query_graphql, 'variables': variables}, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            media = data['data']['Page']['media']
            if media:
                last_index = index_tracker.get(clean_query, -1)
                chosen_index = (last_index + 1) % len(media)
                index_tracker[clean_query] = chosen_index
                image_url = media[chosen_index]['coverImage']['large'].strip()
                return image_url
            else:
                print(f"[ANISEARCH] Nenhum anime encontrado para: '{clean_query}'")
        elif response.status_code == 403:
            print(f"[ANISEARCH] 403 Forbidden.")
        else:
            print(f"[ANISEARCH] Erro: {response.status_code}")
    except Exception as e:
        print(f"[ANISEARCH] Exceção: {e}")
    return 'https://via.placeholder.com/300x450.png?text=Sem+Capa'

def fetch_manga_image_url(query):
    url = "https://graphql.anilist.co"
    query_graphql = """
        query($search: String) {
            Page(page: 1, perPage: 5) {
                media(search: $search, type: MANGA) {
                    title { romaji english }
                    coverImage { large }
                }
            }
        }
    """
    clean_query = query.strip().replace('-', ' ').replace('_', ' ')
    clean_query = re.sub(r'[^\w\s]', '', clean_query)
    variables = {'search': clean_query}
    try:
        print(f"[MANGASEARCH] Buscando imagem para (mangá): '{clean_query}'")
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'List_IT/1.0 (+https://github.com)'
        }
        response = requests.post(url, json={'query': query_graphql, 'variables': variables}, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            media = data['data']['Page']['media']
            if media:
                last_index = index_tracker_manga.get(clean_query, -1)
                chosen_index = (last_index + 1) % len(media)
                index_tracker_manga[clean_query] = chosen_index
                image_url = media[chosen_index]['coverImage']['large'].strip()
                return image_url
            else:
                print(f"[MANGASEARCH] Nenhum mangá encontrado para: '{clean_query}'")
        elif response.status_code == 403:
            print(f"[MANGASEARCH] 403 Forbidden.")
        else:
            print(f"[MANGASEARCH] Erro: {response.status_code}")
    except Exception as e:
        print(f"[MANGASEARCH] Exceção: {e}")
    return 'https://via.placeholder.com/300x450.png?text=Sem+Capa'

@app.route('/search_image', methods=['GET'])
def search_image():
    query = request.args.get('q', '').strip()
    content_type = request.args.get('type', 'anime').lower()
    if not query:
        return jsonify({'error': 'Query parameter is required'}), 400
    if content_type == 'anime':
        image_url = fetch_anime_image_url(query)
    elif content_type == 'manga':
        image_url = fetch_manga_image_url(query)
    else:
        return jsonify({'error': 'Invalid content type. Use "anime" or "manga".'}), 400
    return jsonify({'image_url': image_url})

@app.route("/linhas/<int:linha_id>/imagem", methods=["PUT"])
def update_linha_imagem(linha_id):
    data = request.get_json()
    imagem_url = data.get("imagem_url")
    if not imagem_url:
        return jsonify({"error": "imagem_url is required"}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE linhas SET imagem_url = ? WHERE id = ?", (imagem_url, linha_id))
        conn.commit()
        cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
        nome = cursor.fetchone()[0]
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Atualizando Imagem da Linha: {nome} id: {linha_id}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
        conn.close()
        return jsonify({"message": "Imagem atualizada com sucesso!", "imagem_url": imagem_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/refresh_images', methods=['POST'])
def refresh_images():
    conn = sqlite3.connect('list_it.db')
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, nome, conteudo FROM linhas
        WHERE imagem_url IS NULL OR imagem_url = 'https://via.placeholder.com/300x450.png?text=Sem+Capa'
    """)
    linhas_com_erro = cursor.fetchall()
    atualizados = 0
    for linha_id, nome, conteudo in linhas_com_erro:
        content_type = 'anime' if conteudo.lower() in ['anime', 'filme'] else 'manga'
        image_url = fetch_anime_image_url(nome) if content_type == 'anime' else fetch_manga_image_url(nome)
        if 'via.placeholder.com' not in image_url:
            cursor.execute("UPDATE linhas SET imagem_url = ? WHERE id = ?", (image_url, linha_id))
            atualizados += 1
    conn.commit()
    conn.close()
    if atualizados > 0:
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Refresh de imagens: {atualizados} imagens atualizadas"
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
    return jsonify({'mensagem': f'{atualizados} imagens atualizadas com sucesso.'})

@app.route('/update_image_url', methods=['POST'])
def update_image_url():
    data = request.get_json()
    linha_id = data.get('id')
    new_url = data.get('new_url')
    if not linha_id or not new_url:
        return jsonify({'mensagem': 'Dados incompletos.'}), 400
    conn = sqlite3.connect('list_it.db')
    cursor = conn.cursor()
    cursor.execute("UPDATE linhas SET imagem_url = ? WHERE id = ?", (new_url, linha_id))
    cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
    nome = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Atualizando URL da Imagem: {nome} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    subprocess.run(['git', 'push'])
    return jsonify({'mensagem': 'Imagem atualizada com sucesso.'})

def fetch_media_details(query, media_type="ANIME", retries=3):
    url = "https://graphql.anilist.co"
    gql = """
    query($search: String) {
      Page(page: 1, perPage: 5) {
        media(search: $search, type: %s) {
          title { romaji english }
          synonyms
          description
        }
      }
    }
    """ % media_type
    vars = {"search": query.strip()}
    for attempt in range(1, retries + 1):
        try:
            resp = requests.post(url, json={"query": gql, "variables": vars})
            resp.raise_for_status()
            media = resp.json()["data"]["Page"]["media"]
            if not media:
                return None
            m = media[0]
            romaji = m["title"].get("romaji") or ""
            english = m["title"].get("english") or ""
            synonyms_raw = m.get("synonyms") or []
            sinonimos = []
            if english:
                sinonimos.append(english)
            espanhol = next((s for s in synonyms_raw if re.search(r'\b(la|el|mi|de|una|un|los|las)\b', s.lower())), None)
            if espanhol and espanhol not in sinonimos:
                sinonimos.append(espanhol)
            if romaji and romaji not in sinonimos:
                sinonimos.append(romaji)
            for s in synonyms_raw:
                if s not in sinonimos:
                    sinonimos.append(s)
                if len(sinonimos) >= 3:
                    break
            sinopse = m.get("description") or ""
            return {
                "romaji": romaji,
                "english": english,
                "sinonimos": sinonimos,
                "sinopse": sinopse
            }
        except requests.exceptions.HTTPError as e:
            if resp.status_code == 429:
                wait = 10 * attempt
                print(f"🚦 Rate limited (429). Esperando {wait}s...")
                time.sleep(wait)
            else:
                print(f"❌ Erro HTTP: {e}")
                break
        except Exception as e:
            print(f"❌ Erro geral: {e}")
            break
        time.sleep(1)
    return None

@app.route("/search_details", methods=["GET"])
@cache.cached(timeout=86400, query_string=True)
def search_details():
    q = request.args.get("q", "").strip()
    t = request.args.get("type", "anime").lower()
    if not q:
        return jsonify({"error": "q param missing"}), 400
    typ = "ANIME" if t == "anime" else "MANGA"
    with sqlite3.connect("list_it.db") as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT sinopse, sinonimos FROM linhas WHERE nome = ? COLLATE NOCASE",
            (q,)
        )
        row = cursor.fetchone()
    if row:
        sinopse_db, sinonimos_str = row
        try:
            sinonimos_db = json.loads(sinonimos_str) if sinonimos_str else []
        except json.JSONDecodeError:
            sinonimos_db = []
        if sinopse_db and len(sinonimos_db) >= 3:
            return jsonify({
                "sinopse": sinopse_db,
                "sinonimos": sinonimos_db
            })
    details = fetch_media_details(q, typ)
    if not details:
        return jsonify({"error": "Not found"}), 404
    return jsonify({
        "sinopse": details["sinopse"],
        "sinonimos": details["sinonimos"]
    })

@app.route("/linhas/<int:lista_id>/faltantes", methods=["GET"])
def listar_faltantes(lista_id):
    with sqlite3.connect("list_it.db", timeout=5) as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, nome, conteudo,
                   COALESCE(imagem_url, '')  AS imagem_url,
                   COALESCE(sinopse, '')     AS sinopse,
                   COALESCE(sinonimos, '[]') AS sinonimos_str
              FROM linhas
             WHERE lista_id = ?
        """, (lista_id,))
        rows = cur.fetchall()
    faltantes = []
    for id_, nome, conteudo, img, sinopse, sinon_str in rows:
        try:
            syn = json.loads(sinon_str)
        except json.JSONDecodeError:
            syn = []
        falta_imagem   = (not img) or "placeholder.com" in img
        falta_sinopse  = not sinopse.strip()
        falta_synonyms = len(syn) < 3
        if falta_imagem or falta_sinopse or falta_synonyms:
            faltantes.append({
                "id":        id_,
                "nome":      nome,
                "conteudo":  conteudo,
                "imagem_url": img,
                "sinopse":   sinopse,
                "sinonimos": syn
            })
    return jsonify(faltantes)

@app.route("/linhas/<int:linha_id>/details", methods=["PUT"])
def update_linha_details(linha_id):
    data = request.get_json()
    sinopse   = data.get("sinopse")
    sinonimos = data.get("sinonimos")
    if sinopse is None or sinonimos is None:
        return jsonify({"error": "fields missing"}), 400
    with sqlite3.connect("list_it.db", timeout=10) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE linhas SET sinonimos = ?, sinopse = ? WHERE id = ?",
            (json.dumps(sinonimos, ensure_ascii=False), sinopse, linha_id)
        )
        conn.commit()
    return jsonify({"message": "Details updated"}), 200

@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json()
    text = data.get("text")
    target_lang = data.get("target_lang", "pt")
    if not text:
        return jsonify({"error": "Texto ausente"}), 400
    try:
        translated = GoogleTranslator(source='auto', target=target_lang).translate(text)
        return jsonify({"traducao": translated})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/refresh_details", methods=["POST"])
def refresh_all_details():
    print("🚀 Iniciando refresh de detalhes...")
    conn = sqlite3.connect("list_it.db")
    cur = conn.cursor()
    cur.execute("""
      SELECT id, nome, conteudo FROM linhas
      WHERE sinonimos IS NULL OR sinonimos = '[]' 
         OR sinopse IS NULL OR sinopse = '[]'
    """)
    to_update = cur.fetchall()
    conn.close()
    print(f"🔍 Encontrados {len(to_update)} itens para atualizar.")
    updated = 0
    for idx, (linha_id, nome, conteudo) in enumerate(to_update, 1):
        media_type = "anime" if conteudo.lower() in ["anime", "filme"] else "manga"
        print(f"\n📦 ({idx}/{len(to_update)}) Buscando detalhes para '{nome}' ({media_type})...")
        det = fetch_media_details(nome, media_type.upper())
        if det:
            has_data = det["romaji"] or det["english"] or det["sinonimos"] or det["sinopse"]
            if has_data:
                try:
                    conn = sqlite3.connect("list_it.db", timeout=10)
                    cur = conn.cursor()
                    cur.execute("""
                        UPDATE linhas 
                        SET sinonimos = ?, 
                            sinopse = ?
                        WHERE id = ?
                    """, (
                        json.dumps(det["sinonimos"]),
                        det["sinopse"],
                        linha_id
                    ))
                    conn.commit()
                    conn.close()
                    print(f"✅ Linha {linha_id} atualizada com detalhes.")
                    updated += 1
                except Exception as e:
                    print(f"❌ Erro ao atualizar linha_id={linha_id}: {e}")
            else:
                print(f"⚠️ Nenhum detalhe relevante encontrado, não atualizado.")
        else:
            print(f"⚠️ Nenhum dado encontrado na AniList.")
        time.sleep(2)
    print(f"\n🏁 Finalizado! Total atualizados: {updated} de {len(to_update)}")
    return jsonify({"updated": updated})

@app.route("/linhas/<int:lista_id>", methods=["GET"])
def get_linhas(lista_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, lista_id, nome, tags, conteudo, status, episodio,
               opiniao, imagem_url, last_highlight, sinopse, sinonimos
          FROM linhas
         WHERE lista_id = ?
    """, (lista_id,))
    linhas = []
    for row in cursor.fetchall():
        sinopse = row['sinopse'] or ""
        sinonimos = json.loads(row['sinonimos']) if row['sinonimos'] else []
        needs_details = not (sinopse and len(sinonimos) >= 3)
        linhas.append({
            "id":            row['id'],
            "lista_id":      row['lista_id'],
            "nome":          row['nome'],
            "tags":          row['tags'],
            "conteudo":      row['conteudo'],
            "status":        row['status'],
            "episodio":      row['episodio'],
            "opiniao":       row['opiniao'],
            "imagem_url":    row['imagem_url'],
            "last_highlight": row['last_highlight'],
            "sinopse":       sinopse,
            "sinonimos":     sinonimos,
            "needs_details": needs_details
        })
    conn.close()
    return jsonify(linhas)

@app.route("/linhas", methods=["POST"])
def add_linha():
    data = request.json
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO linhas (lista_id, nome, tags, conteudo, status, episodio, opiniao, last_highlight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (data["lista_id"], data["nome"], data["tags"], data["conteudo"], data["status"], data["episodio"], data["opiniao"], now))
    conn.commit()
    linha_id = cursor.lastrowid
    conn.close()
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Adicionando Linha: {data['nome']} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    subprocess.run(['git', 'push'])
    return jsonify({"id": linha_id, "lista_id": data["lista_id"], "nome": data["nome"], "last_highlight": now})

@app.route("/linhas/<int:linha_id>", methods=["PUT"])
def update_linha(linha_id):
    data = request.get_json() or {}
    nome = data.get('nome')
    conteudo = data.get('conteudo')
    status = data.get('status')
    episodio = data.get('episodio')
    opiniao = data.get('opiniao')
    tags = data.get('tags')
    if isinstance(tags, (list, tuple)):
        tags = ", ".join(str(x).strip() for x in tags if x is not None)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nome, conteudo, status, episodio, opiniao, tags FROM linhas WHERE id = ?", (linha_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Linha não encontrada"}), 404
    if nome is None:
        nome = existing['nome']
    if conteudo is None:
        conteudo = existing['conteudo']
    if status is None:
        status = existing['status']
    if episodio is None:
        episodio = existing['episodio']
    if opiniao is None:
        opiniao = existing['opiniao']
    if tags is None:
        tags = existing['tags']
    if not nome or not conteudo or not status:
        conn.close()
        return jsonify({"error": "Campos obrigatórios faltando"}), 400
    try:
        cursor.execute("""
            UPDATE linhas
            SET nome = ?, conteudo = ?, status = ?, episodio = ?, opiniao = ?, tags = ?
            WHERE id = ?
        """, (nome, conteudo, status, episodio, opiniao, tags, linha_id))
        conn.commit()
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Atualizando Linha: {nome} id: {linha_id}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
        conn.close()
        return jsonify({"message": "Linha atualizada com sucesso!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/linhas/<int:linha_id>", methods=["DELETE"])
def delete_linha(linha_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
    row = cursor.fetchone()
    nome = row['nome'] if row else 'Desconhecido'
    cursor.execute("DELETE FROM linhas WHERE id = ?", (linha_id,))
    conn.commit()
    conn.close()
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Removendo Linha: {nome} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    subprocess.run(['git', 'push'])
    return jsonify({"message": "Linha excluída com sucesso!"})

@app.route('/to_highlight/<int:lista_id>')
def to_highlight(lista_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=15)).isoformat()
    cursor.execute("""
        SELECT id, nome, imagem_url, tags, conteudo, status, episodio, opiniao, sinopse, sinonimos, last_highlight
        FROM linhas
        WHERE lista_id = ?
        AND (
            (conteudo = 'Anime' AND status LIKE '%vendo%') OR
            (conteudo IN ('Manga', 'Webtoon', 'Manhwa') AND status LIKE '%lendo%')
        )
        AND (last_highlight IS NULL OR last_highlight <= ?)
    """, (lista_id, cutoff))
    rows = cursor.fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/highlighted/<int:linha_id>', methods=['POST'])
def mark_highlighted(linha_id):
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE linhas SET last_highlight = ? WHERE id = ?", (now, linha_id))
    cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
    nome = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Marcando highlight na Linha: {nome} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    subprocess.run(['git', 'push'])
    return jsonify({'mensagem': 'Highlight atualizado.'})

# ============================================================
# ROTAS DE SEQUÊNCIAS (existentes)
# ============================================================

@app.route('/sequencias', methods=['POST'])
def criar_sequencia():
    data = request.get_json()
    nome = data.get('nome')
    descricao = data.get('descricao', '')
    if not nome:
        return jsonify({"erro": "Nome da sequência é obrigatório"}), 400
    with sqlite3.connect("list_it.db") as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO sequencias (nome, descricao) VALUES (?, ?)",
            (nome, descricao)
        )
        sequencia_id = cursor.lastrowid
        conn.commit()
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Criando Sequência: {nome} id: {sequencia_id}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
    return jsonify({
        "id": sequencia_id,
        "nome": nome,
        "descricao": descricao,
        "mensagem": f"Sequência '{nome}' criada com sucesso"
    }), 201

@app.route('/sequencias/<int:sequencia_id>/itens', methods=['POST'])
def adicionar_item_sequencia(sequencia_id):
    data = request.get_json()
    linha_id = data.get('linha_id')
    if not linha_id:
        return jsonify({"erro": "linha_id é obrigatório"}), 400
    with sqlite3.connect("list_it.db") as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
        seq = cursor.fetchone()
        if not seq:
            return jsonify({"erro": "Sequência não encontrada"}), 404
        seq_nome = seq[0]
        cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
        linha = cursor.fetchone()
        if not linha:
            return jsonify({"erro": "Item não encontrado"}), 404
        item_nome = linha[0]
        cursor.execute("""
            SELECT 1 FROM sequencia_itens 
            WHERE sequencia_id = ? AND linha_id = ?
        """, (sequencia_id, linha_id))
        if cursor.fetchone():
            return jsonify({"erro": "Item já está nesta sequência"}), 400
        cursor.execute("""
            SELECT COALESCE(MAX(ordem), 0) FROM sequencia_itens 
            WHERE sequencia_id = ?
        """, (sequencia_id,))
        max_ordem = cursor.fetchone()[0]
        nova_ordem = max_ordem + 1
        cursor.execute("""
            INSERT INTO sequencia_itens (sequencia_id, linha_id, ordem) 
            VALUES (?, ?, ?)
        """, (sequencia_id, linha_id, nova_ordem))
        conn.commit()
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Adicionando {item_nome} à sequência {seq_nome} na ordem {nova_ordem}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        subprocess.run(['git', 'push'])
    return jsonify({
        "mensagem": "Item adicionado à sequência com sucesso",
        "sequencia_id": sequencia_id,
        "linha_id": linha_id,
        "ordem": nova_ordem
    }), 201

@app.route('/sequencias', methods=['GET'])
def listar_sequencias():
    try:
        with sqlite3.connect("list_it.db") as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.id, s.nome, s.descricao, COUNT(si.linha_id) as total_itens
                FROM sequencias s
                LEFT JOIN sequencia_itens si ON s.id = si.sequencia_id
                GROUP BY s.id, s.nome, s.descricao
                ORDER BY s.nome
            """)
            sequencias = [dict(row) for row in cursor.fetchall()]
        return jsonify(sequencias)
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao listar sequências: {str(e)}"}), 500

@app.route('/sequencias/<int:sequencia_id>', methods=['GET'])
def obter_sequencia(sequencia_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, nome, descricao FROM sequencias 
                WHERE id = ?
            """, (sequencia_id,))
            sequencia = cursor.fetchone()
            if not sequencia:
                return jsonify({"erro": "Sequência não encontrada"}), 404
            cursor.execute("""
                SELECT l.id, l.nome, l.imagem_url, l.conteudo, l.status, 
                    l.episodio, l.tags, l.opiniao, l.sinopse, l.sinonimos, si.ordem 
                FROM linhas l
                JOIN sequencia_itens si ON l.id = si.linha_id
                WHERE si.sequencia_id = ?
                ORDER BY si.ordem
            """, (sequencia_id,))
            itens = [dict(row) for row in cursor.fetchall()]
        return jsonify({
            "sequencia": dict(sequencia),
            "itens": itens,
            "total_itens": len(itens)
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"erro": str(e)}), 500

@app.route('/sequencias/<int:sequencia_id>/itens/<int:linha_id>', methods=['DELETE'])
def remover_item_sequencia(sequencia_id, linha_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 1 FROM sequencia_itens 
                WHERE sequencia_id = ? AND linha_id = ?
            """, (sequencia_id, linha_id))
            if not cursor.fetchone():
                return jsonify({"erro": "Item não encontrado na sequência"}), 404
            cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
            item_nome = cursor.fetchone()[0]
            cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
            seq_nome = cursor.fetchone()[0]
            cursor.execute("""
                DELETE FROM sequencia_itens 
                WHERE sequencia_id = ? AND linha_id = ?
            """, (sequencia_id, linha_id))
            conn.commit()
            subprocess.run(['git', 'add', 'list_it.db'])
            commit_message = f"Removendo {item_nome} da sequência {seq_nome}"
            subprocess.run(['git', 'commit', '-m', commit_message])
            subprocess.run(['git', 'push'])
        return jsonify({
            "mensagem": "Item removido da sequência com sucesso",
            "sequencia_id": sequencia_id,
            "linha_id": linha_id
        })
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao remover item: {str(e)}"}), 500

@app.route('/sequencias/<int:sequencia_id>/ordem', methods=['PUT'])
def atualizar_ordem_sequencia(sequencia_id):
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({"erro": "Dados devem ser uma lista de itens"}), 400
    try:
        with sqlite3.connect("list_it.db") as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM sequencias WHERE id = ?", (sequencia_id,))
            if not cursor.fetchone():
                return jsonify({"erro": "Sequência não encontrada"}), 404
            for item in data:
                if 'linha_id' not in item or 'nova_ordem' not in item:
                    conn.rollback()
                    return jsonify({"erro": "Cada item deve conter linha_id e nova_ordem"}), 400
                cursor.execute("""
                    UPDATE sequencia_itens 
                    SET ordem = ? 
                    WHERE sequencia_id = ? AND linha_id = ?
                """, (item['nova_ordem'], sequencia_id, item['linha_id']))
                if cursor.rowcount == 0:
                    conn.rollback()
                    return jsonify({
                        "erro": f"Item {item['linha_id']} não encontrado na sequência",
                        "linha_id": item['linha_id']
                    }), 404
            conn.commit()
            cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
            seq_nome = cursor.fetchone()[0]
            subprocess.run(['git', 'add', 'list_it.db'])
            commit_message = f"Atualizando ordem na sequência {seq_nome}"
            subprocess.run(['git', 'commit', '-m', commit_message])
            subprocess.run(['git', 'push'])
        return jsonify({
            "mensagem": "Ordem da sequência atualizada com sucesso",
            "total_itens_atualizados": len(data)
        })
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao atualizar ordem: {str(e)}"}), 500

@app.route('/sequencias/<int:sequencia_id>', methods=['DELETE'])
def deletar_sequencia(sequencia_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
            seq_nome = cursor.fetchone()
            if not seq_nome:
                return jsonify({"erro": "Sequência não encontrada"}), 404
            seq_nome = seq_nome[0]
            cursor.execute("DELETE FROM sequencias WHERE id = ?", (sequencia_id,))
            conn.commit()
            subprocess.run(['git', 'add', 'list_it.db'])
            commit_message = f"Removendo sequência {seq_nome}"
            subprocess.run(['git', 'commit', '-m', commit_message])
            subprocess.run(['git', 'push'])
        return jsonify({
            "mensagem": "Sequência deletada com sucesso",
            "sequencia_id": sequencia_id,
            "sequencia_nome": seq_nome
        })
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao deletar sequência: {str(e)}"}), 500

@app.route('/linhas/<int:linha_id>/sequencias', methods=['GET'])
def obter_sequencias_do_item(linha_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
            item = cursor.fetchone()
            if not item:
                return jsonify({"erro": "Item não encontrado"}), 404
            cursor.execute("""
                SELECT s.id, s.nome, s.descricao, si.ordem
                FROM sequencias s
                JOIN sequencia_itens si ON s.id = si.sequencia_id
                WHERE si.linha_id = ?
                ORDER BY s.nome
            """, (linha_id,))
            sequencias = [dict(row) for row in cursor.fetchall()]
            item_nome = item['nome']
        return jsonify({
            "linha_id": linha_id,
            "item_nome": item_nome,
            "sequencias": sequencias,
            "total_sequencias": len(sequencias)
        })
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao buscar sequências: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)