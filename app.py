from flask import Flask, render_template, request, jsonify
import sqlite3
import requests
import re

app = Flask(__name__)

# Dicionários globais para rastrear os índices usados nas buscas
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
                tags TEXT,
                conteudo TEXT NOT NULL,
                status TEXT NOT NULL,
                episodio INTEGER,
                opiniao TEXT NOT NULL,
                imagem_url TEXT,
                FOREIGN KEY (lista_id) REFERENCES listas(id)
            )
        """)
        conn.commit()
    print("[INIT] Banco de dados inicializado.")

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
    print(f"[REFRESH_IMAGES] {atualizados} imagens atualizadas.")
    return jsonify({'mensagem': f'{atualizados} imagens atualizadas com sucesso.'})

@app.route("/linhas/<int:lista_id>", methods=["GET"])
def get_linhas(lista_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, lista_id, nome, tags, conteudo, status, episodio, opiniao, imagem_url FROM linhas WHERE lista_id = ?", (lista_id,))
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
            "imagem_url": row[8]
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
    cursor.execute("DELETE FROM linhas WHERE id = ?", (linha_id,))
    conn.commit()
    print(f"[DELETE_LINHA] Linha {linha_id} excluída.")
    return jsonify({"message": "Linha excluída com sucesso!"})

if __name__ == "__main__":
    app.run(debug=True)
