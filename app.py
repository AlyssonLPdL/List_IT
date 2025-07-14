from flask import Flask, Response, render_template, request, jsonify
import sqlite3
import requests
import re
from datetime import datetime, timedelta, timezone
import subprocess
import json
from deep_translator import GoogleTranslator
import traceback

app = Flask(__name__)

# Dicionários globais para rastrear os índices usados nas buscas
index_tracker = {}
index_tracker_manga = {}

def init_db():
    """Cria as tabelas do banco de dados SQLite, caso não existam."""
    with sqlite3.connect("list_it.db") as conn:
        cursor = conn.cursor()
        
        # Tabela de listas original
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS listas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL
            )
        """)
        
        # Tabela de linhas original
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
        
        # Nova tabela para armazenar sequências
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sequencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                descricao TEXT
            )
        """)
        
        # Nova tabela para relacionar itens às sequências com ordem
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

# ------------------------------ Rotas ------------------------------

@app.route("/")
def index():
    """Renderiza o template principal."""
    return render_template("index.html")

@app.route("/proxy_image")
def proxy_image():
    # recebe a URL alvo como parâmetro
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "url param missing"}), 400

    # busca o conteúdo remoto
    resp = requests.get(url, stream=True)
    # retorna o conteúdo com o mesmo MIME type
    excluded_headers = ["content-encoding", "transfer-encoding", "content-length"]
    headers = [(name, value) for (name, value) in resp.raw.headers.items()
               if name.lower() not in excluded_headers]

    # adiciona CORS e envia
    proxy_resp = Response(resp.content, resp.status_code, headers)
    proxy_resp.headers["Access-Control-Allow-Origin"] = "*"
    return proxy_resp

# Listas
@app.route("/listas", methods=["GET"])
def get_listas():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM listas")
    listas = [{"id": row[0], "nome": row[1]} for row in cursor.fetchall()]
    print(f"[GET_LISTAS] {len(listas)} listas carregadas.")
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
    
    # Auto commit
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Criando Lista: {data['nome']} id: {lista_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    print(f"[COMMIT] {commit_message}")
    
    print(f"[ADD_LISTA] Lista criada: {data['nome']} (ID: {lista_id})")
    return jsonify({"id": lista_id, "nome": data["nome"]})

# Função para buscar a imagem do anime no AniList
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
    # Limpeza da query
    clean_query = query.strip()
    clean_query = clean_query.replace('-', ' ')
    clean_query = re.sub(r'[^\w\s]', '', clean_query)
    variables = {'search': clean_query}

    try:
        print(f"[ANISEARCH] Buscando imagem do anime para: '{clean_query}'")
        response = requests.post(url, json={'query': query_graphql, 'variables': variables})
        if response.status_code == 200:
            data = response.json()
            media = data['data']['Page']['media']
            if media:
                last_index = index_tracker.get(clean_query, -1)
                chosen_index = (last_index + 1) % len(media)
                index_tracker[clean_query] = chosen_index
                image_url = media[chosen_index]['coverImage']['large'].strip()
                print(f"[ANISEARCH] Imagem encontrada (índice {chosen_index}): {image_url}")
                return image_url
            else:
                print(f"[ANISEARCH] Nenhum anime encontrado para: '{clean_query}'")
        else:
            print(f"[ANISEARCH] Erro: {response.status_code} | {response.text}")
    except Exception as e:
        print(f"[ANISEARCH] Exceção: {e}")
    return 'https://via.placeholder.com/300x450.png?text=Sem+Capa'

# Função para buscar a imagem do mangá no AniList
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
    # Limpeza da query
    clean_query = query.strip()
    clean_query = clean_query.replace('-', ' ')
    clean_query = re.sub(r'[^\w\s]', '', clean_query)
    variables = {'search': clean_query}

    try:
        print(f"[MANGASEARCH] Buscando imagem para (mangá): '{clean_query}'")
        response = requests.post(url, json={'query': query_graphql, 'variables': variables})
        if response.status_code == 200:
            data = response.json()
            media = data['data']['Page']['media']
            if media:
                last_index = index_tracker_manga.get(clean_query, -1)
                chosen_index = (last_index + 1) % len(media)
                index_tracker_manga[clean_query] = chosen_index
                image_url = media[chosen_index]['coverImage']['large'].strip()
                print(f"[MANGASEARCH] Imagem encontrada (índice {chosen_index}): {image_url}")
                return image_url
            else:
                print(f"[MANGASEARCH] Nenhum mangá encontrado para: '{clean_query}'")
        else:
            print(f"[MANGASEARCH] Erro: {response.status_code} | {response.text}")
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
        
        # Auto commit
        cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
        nome = cursor.fetchone()[0]
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Atualizando Imagem da Linha: {nome} id: {linha_id}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        print(f"[COMMIT] {commit_message}")
        
        conn.close()
        print(f"[UPDATE_IMAGE] Linha {linha_id} atualizada com: {imagem_url}")
        return jsonify({"message": "Imagem atualizada com sucesso!", "imagem_url": imagem_url})
    except Exception as e:
        print(f"[UPDATE_IMAGE] Erro: {e}")
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
    
    # Auto commit
    if atualizados > 0:
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Refresh de imagens: {atualizados} imagens atualizadas"
        subprocess.run(['git', 'commit', '-m', commit_message])
        print(f"[COMMIT] {commit_message}")
    
    print(f"[REFRESH_IMAGES] {atualizados} imagens atualizadas.")
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

    # Auto commit
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Atualizando URL da Imagem: {nome} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    print(f"[COMMIT] {commit_message}")

    print(f"[UPDATE_IMAGE_URL] Linha {linha_id} atualizada com URL: {new_url}")
    return jsonify({'mensagem': 'Imagem atualizada com sucesso.'})

import requests
import re
import time

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

    # Limpeza básica, mantendo letras, números e espaço
    clean = re.sub(r'[^\w\s]', '', query.strip().replace('-', ' '))

    vars = {"search": clean}

    for attempt in range(1, retries+1):
        try:
            resp = requests.post(url, json={"query": gql, "variables": vars})
            resp.raise_for_status()

            media = resp.json()["data"]["Page"]["media"]
            if not media:
                print(f"⚠️ Nenhum resultado encontrado na AniList para '{query}'")
                return None

            m = media[0]  # pega o primeiro resultado

            romaji = m["title"].get("romaji") or ""
            english = m["title"].get("english") or ""
            synonyms_raw = m.get("synonyms") or []

            synonyms_limited = synonyms_raw[:2]

            sinonimos = []
            if romaji: sinonimos.append(romaji)
            if english: sinonimos.append(english)
            sinonimos.extend(synonyms_limited)

            sinopse = m.get("description") or ""

            return {
                "romaji": romaji,
                "english": english,
                "sinonimos": sinonimos,
                "sinopse": sinopse
            }

        except requests.exceptions.HTTPError as e:
            if resp.status_code == 429:
                wait = 10 * attempt  # espera mais a cada tentativa
                print(f"🚦 Rate limited (429). Esperando {wait} segundos e tentando novamente...")
                time.sleep(wait)
            else:
                print(f"❌ Erro HTTP: {e}")
                break
        except Exception as e:
            print(f"❌ Outro erro: {e}")
            break

        # Espera 1 segundo entre tentativas normais para evitar rebater rate limit
        time.sleep(1)

    print(f"❌ Falha ao buscar '{query}' depois de {retries} tentativas.")
    return None

@app.route("/search_details", methods=["GET"])
def search_details():
    q = request.args.get("q", "").strip()
    t = request.args.get("type", "anime").lower()
    if not q:
        return jsonify({"error": "q param missing"}), 400
    typ = "ANIME" if t == "anime" else "MANGA"
    details = fetch_media_details(q, typ)
    if not details:
        return jsonify({"error": "Not found"}), 404
    # devolve array de sinônimos e a sinopse
    return jsonify(details)

@app.route("/linhas/<int:linha_id>/details", methods=["PUT"])
def update_linha_details(linha_id):
    data = request.get_json()
    sinonimos = data.get("sinonimos")      # lista de strings
    sinopse = data.get("sinopse")      # texto
    if sinonimos is None or sinopse is None:
        return jsonify({"error": "fields missing"}), 400
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE linhas SET sinonimos = ?, sinopse = ? WHERE id = ?",
        (json.dumps(sinonimos, ensure_ascii=False), sinopse, linha_id)
    )
    conn.commit()
    conn.close()
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

                    print(f"✅ Linha {linha_id} atualizada com detalhes: "
                          f"sinonimos={det['sinonimos']}, sinopse={'[ok]' if det['sinopse'] else '[vazio]'}")
                    updated += 1
                except Exception as e:
                    print(f"❌ Erro ao atualizar linha_id={linha_id}: {e}")
            else:
                print(f"⚠️ Nenhum detalhe relevante encontrado, não atualizado.")
        else:
            print(f"⚠️ Nenhum dado encontrado na AniList.")

        # ⚠️ IMPORTANTE: aguardar entre as requisições
        time.sleep(2)  # ajuste para 1.5 ou 2 se ainda der 429

    print(f"\n🏁 Finalizado! Total atualizados: {updated} de {len(to_update)}")
    return jsonify({"updated": updated})

@app.route("/linhas/<int:lista_id>", methods=["GET"])
def get_linhas(lista_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, lista_id, nome, tags, conteudo, status, episodio, opiniao, imagem_url, sinopse, sinonimos FROM linhas WHERE lista_id = ?", (lista_id,))
    linhas = [
        {
            "id": row[0],
            "lista_id": row[1],
            "nome": row[2],
            "tags": row[3],
            "conteudo": row[4],
            "status": row[5],
            "episodio": row[6],
            "opiniao": row[7],
            "imagem_url": row[8],
            "sinopse": row[9],
            "sinonimos": json.loads(row[10]) if row[10] else []
        }
        for row in cursor.fetchall()
    ]
    conn.close()
    print(f"[GET_LINHAS] {len(linhas)} linhas carregadas para lista {lista_id}.")
    return jsonify(linhas)

@app.route("/linhas", methods=["POST"])
def add_linha():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO linhas (lista_id, nome, tags, conteudo, status, episodio, opiniao)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (data["lista_id"], data["nome"], data["tags"], data["conteudo"], data["status"], data["episodio"], data["opiniao"]))
    conn.commit()
    linha_id = cursor.lastrowid
    conn.close()
    
    # Auto commit
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Adicionando Linha: {data['nome']} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    print(f"[COMMIT] {commit_message}")

    print(f"[ADD_LINHA] Linha adicionada: {data['nome']} (ID: {linha_id})")
    return jsonify({"id": linha_id, "lista_id": data["lista_id"], "nome": data["nome"]})

@app.route("/linhas/<int:linha_id>", methods=["PUT"])
def update_linha(linha_id):
    data = request.get_json()
    nome = data.get('nome')
    conteudo = data.get('conteudo')
    status = data.get('status')
    episodio = data.get('episodio')
    opiniao = data.get('opiniao')
    tags = data.get('tags')
    if not nome or not conteudo or not status:
        return jsonify({"error": "Campos obrigatórios faltando"}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE linhas
            SET nome = ?, conteudo = ?, status = ?, episodio = ?, opiniao = ?, tags = ?
            WHERE id = ?
        """, (nome, conteudo, status, episodio, opiniao, tags, linha_id))
        conn.commit()
        
        # Auto commit
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Atualizando Linha: {nome} id: {linha_id}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        print(f"[COMMIT] {commit_message}")
        
        conn.close()
        print(f"[UPDATE_LINHA] Linha {linha_id} atualizada.")
        return jsonify({"message": "Linha atualizada com sucesso!"})
    except Exception as e:
        print(f"[UPDATE_LINHA] Erro: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/linhas/<int:linha_id>", methods=["DELETE"])
def delete_linha(linha_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Obter nome antes de deletar
    cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
    row = cursor.fetchone()
    nome = row['nome'] if row else 'Desconhecido'
    
    cursor.execute("DELETE FROM linhas WHERE id = ?", (linha_id,))
    conn.commit()
    conn.close()
    
    # Auto commit
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Removendo Linha: {nome} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    print(f"[COMMIT] {commit_message}")

    print(f"[DELETE_LINHA] Linha {linha_id} excluída.")
    return jsonify({"message": "Linha excluída com sucesso!"})

@app.route('/to_highlight/<int:lista_id>')
def to_highlight(lista_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    # UTC agora menos 1 hora
    cutoff = (datetime.now(timezone.utc) - timedelta(days=15)).isoformat()
    cursor.execute("""
        SELECT id, nome, imagem_url, tags, conteudo, status, episodio, opiniao, sinopse, sinonimos
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
    # Obter nome para commit
    cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
    nome = cursor.fetchone()[0]
    conn.commit()
    conn.close()
    
    # Auto commit
    subprocess.run(['git', 'add', 'list_it.db'])
    commit_message = f"Marcando highlight na Linha: {nome} id: {linha_id}"
    subprocess.run(['git', 'commit', '-m', commit_message])
    print(f"[COMMIT] {commit_message}")

    return jsonify({'mensagem': 'Highlight atualizado.'})

# Operação 1: Criar uma nova sequência (com autocommit)
@app.route('/sequencias', methods=['POST'])
def criar_sequencia():
    data = request.get_json()
    nome = data.get('nome')
    descricao = data.get('descricao', '')

    if not nome:
        return jsonify({"erro": "Nome da sequência é obrigatório"}), 400

    with sqlite3.connect("list_it.db") as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO sequencias (nome, descricao) VALUES (?, ?)",
                (nome, descricao)
            )
            sequencia_id = cursor.lastrowid
            conn.commit()
            
            # Auto commit
            subprocess.run(['git', 'add', 'list_it.db'])
            commit_message = f"Criando Sequência: {nome} id: {sequencia_id}"
            subprocess.run(['git', 'commit', '-m', commit_message])
            print(f"[COMMIT] {commit_message}")
            
        except sqlite3.Error as e:
            return jsonify({"erro": f"Erro ao criar sequência: {str(e)}"}), 500
    
    return jsonify({
        "id": sequencia_id,
        "nome": nome,
        "descricao": descricao,
        "mensagem": f"Sequência '{nome}' criada com sucesso"
    }), 201

# Operação 2: Adicionar item a uma sequência (com verificações)
@app.route('/sequencias/<int:sequencia_id>/itens', methods=['POST'])
def adicionar_item_sequencia(sequencia_id):
    data = request.get_json()
    linha_id = data.get('linha_id')

    if not linha_id:
        return jsonify({"erro": "linha_id é obrigatório"}), 400

    with sqlite3.connect("list_it.db") as conn:
        cursor = conn.cursor()
        # 1) Verificar se sequência existe
        cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
        seq = cursor.fetchone()
        if not seq:
            return jsonify({"erro": "Sequência não encontrada"}), 404
        seq_nome = seq[0]

        # 2) Verificar se o item existe
        cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
        linha = cursor.fetchone()
        if not linha:
            return jsonify({"erro": "Item não encontrado"}), 404
        item_nome = linha[0]

        # 3) Verificar se já está na sequência
        cursor.execute("""
            SELECT 1 FROM sequencia_itens 
            WHERE sequencia_id = ? AND linha_id = ?
        """, (sequencia_id, linha_id))
        if cursor.fetchone():
            return jsonify({"erro": "Item já está nesta sequência"}), 400

        # 4) Calcular a próxima ordem no backend
        cursor.execute("""
            SELECT COALESCE(MAX(ordem), 0) FROM sequencia_itens 
            WHERE sequencia_id = ?
        """, (sequencia_id,))
        max_ordem = cursor.fetchone()[0]
        nova_ordem = max_ordem + 1

        # 5) Inserir usando a nova_ordem
        cursor.execute("""
            INSERT INTO sequencia_itens (sequencia_id, linha_id, ordem) 
            VALUES (?, ?, ?)
        """, (sequencia_id, linha_id, nova_ordem))
        conn.commit()

        # 6) Auto commit no Git
        subprocess.run(['git', 'add', 'list_it.db'])
        commit_message = f"Adicionando {item_nome} à sequência {seq_nome} na ordem {nova_ordem}"
        subprocess.run(['git', 'commit', '-m', commit_message])
        print(f"[COMMIT] {commit_message}")

    return jsonify({
        "mensagem": "Item adicionado à sequência com sucesso",
        "sequencia_id": sequencia_id,
        "linha_id": linha_id,
        "ordem": nova_ordem
    }), 201

# Operação 3: Listar todas as sequências (com contagem de itens)
@app.route('/sequencias', methods=['GET'])
def listar_sequencias():
    try:
        with sqlite3.connect("list_it.db") as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Lista sequências com contagem de itens
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

# Operação 4: Obter detalhes de uma sequência (com mais informações)
@app.route('/sequencias/<int:sequencia_id>', methods=['GET'])
def obter_sequencia(sequencia_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Obter metadados da sequência
            cursor.execute("""
                SELECT id, nome, descricao FROM sequencias 
                WHERE id = ?
            """, (sequencia_id,))
            
            sequencia = cursor.fetchone()
            if not sequencia:
                return jsonify({"erro": "Sequência não encontrada"}), 404
            
            # Obter itens da sequência em ordem com mais detalhes
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
        # imprime a stack completa no console do Flask
        traceback.print_exc()
        # devolve o texto do erro no JSON pra debugar
        return jsonify({"erro": str(e)}), 500

# Operação 5: Remover item de uma sequência (com verificações)
@app.route('/sequencias/<int:sequencia_id>/itens/<int:linha_id>', methods=['DELETE'])
def remover_item_sequencia(sequencia_id, linha_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            cursor = conn.cursor()
            
            # Verificar existência antes de deletar
            cursor.execute("""
                SELECT 1 FROM sequencia_itens 
                WHERE sequencia_id = ? AND linha_id = ?
            """, (sequencia_id, linha_id))
            
            if not cursor.fetchone():
                return jsonify({"erro": "Item não encontrado na sequência"}), 404
            
            # Obter nomes para commit
            cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
            item_nome = cursor.fetchone()[0]
            cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
            seq_nome = cursor.fetchone()[0]
            
            cursor.execute("""
                DELETE FROM sequencia_itens 
                WHERE sequencia_id = ? AND linha_id = ?
            """, (sequencia_id, linha_id))
            
            conn.commit()
            
            # Auto commit
            subprocess.run(['git', 'add', 'list_it.db'])
            commit_message = f"Removendo {item_nome} da sequência {seq_nome}"
            subprocess.run(['git', 'commit', '-m', commit_message])
            print(f"[COMMIT] {commit_message}")
            
        return jsonify({
            "mensagem": "Item removido da sequência com sucesso",
            "sequencia_id": sequencia_id,
            "linha_id": linha_id
        })
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao remover item: {str(e)}"}), 500

# Operação 6: Atualizar ordem dos itens em uma sequência (com validação)
@app.route('/sequencias/<int:sequencia_id>/ordem', methods=['PUT'])
def atualizar_ordem_sequencia(sequencia_id):
    data = request.get_json()
    
    if not isinstance(data, list):
        return jsonify({"erro": "Dados devem ser uma lista de itens"}), 400
    
    try:
        with sqlite3.connect("list_it.db") as conn:
            cursor = conn.cursor()
            
            # Verificar se a sequência existe
            cursor.execute("SELECT 1 FROM sequencias WHERE id = ?", (sequencia_id,))
            if not cursor.fetchone():
                return jsonify({"erro": "Sequência não encontrada"}), 404
            
            # Validar e atualizar cada item
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
            
            # Auto commit
            cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
            seq_nome = cursor.fetchone()[0]
            subprocess.run(['git', 'add', 'list_it.db'])
            commit_message = f"Atualizando ordem na sequência {seq_nome}"
            subprocess.run(['git', 'commit', '-m', commit_message])
            print(f"[COMMIT] {commit_message}")
            
        return jsonify({
            "mensagem": "Ordem da sequência atualizada com sucesso",
            "total_itens_atualizados": len(data)
        })
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao atualizar ordem: {str(e)}"}), 500

# Operação 7: Deletar uma sequência (com confirmação)
@app.route('/sequencias/<int:sequencia_id>', methods=['DELETE'])
def deletar_sequencia(sequencia_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            cursor = conn.cursor()
            
            # Obter nome antes de deletar para commit
            cursor.execute("SELECT nome FROM sequencias WHERE id = ?", (sequencia_id,))
            seq_nome = cursor.fetchone()
            if not seq_nome:
                return jsonify({"erro": "Sequência não encontrada"}), 404
            seq_nome = seq_nome[0]
            
            # Deletar (o CASCADE vai cuidar dos itens da sequência)
            cursor.execute("DELETE FROM sequencias WHERE id = ?", (sequencia_id,))
            conn.commit()
            
            # Auto commit
            subprocess.run(['git', 'add', 'list_it.db'])
            commit_message = f"Removendo sequência {seq_nome}"
            subprocess.run(['git', 'commit', '-m', commit_message])
            print(f"[COMMIT] {commit_message}")
            
        return jsonify({
            "mensagem": "Sequência deletada com sucesso",
            "sequencia_id": sequencia_id,
            "sequencia_nome": seq_nome
        })
    except sqlite3.Error as e:
        return jsonify({"erro": f"Erro ao deletar sequência: {str(e)}"}), 500

# Operação 8: Verificar em quais sequências um item está
@app.route('/linhas/<int:linha_id>/sequencias', methods=['GET'])
def obter_sequencias_do_item(linha_id):
    try:
        with sqlite3.connect("list_it.db") as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Verificar se o item existe
            cursor.execute("SELECT nome FROM linhas WHERE id = ?", (linha_id,))
            item = cursor.fetchone()
            if not item:
                return jsonify({"erro": "Item não encontrado"}), 404
            
            # Obter todas as sequências que contêm este item
            cursor.execute("""
                SELECT s.id, s.nome, s.descricao, si.ordem
                FROM sequencias s
                JOIN sequencia_itens si ON s.id = si.sequencia_id
                WHERE si.linha_id = ?
                ORDER BY s.nome
            """, (linha_id,))
            
            sequencias = [dict(row) for row in cursor.fetchall()]
            
            # Obter nome do item
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