from flask import Flask, render_template, request, jsonify
import sqlite3
import requests
import re
import time

app = Flask(__name__)

# <-------------- Configuração do Banco de Dados --------------->

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
init_db()

def get_db_connection():
    conn = sqlite3.connect('list_it.db')  # Substitua pelo caminho correto
    conn.row_factory = sqlite3.Row
    return conn

# <-------------- Rota Principal --------------->

@app.route("/")
def index():
    """Renderiza o template principal."""
    return render_template("index.html")

# <-------------- Rotas da API para Gerenciar Listas --------------->

@app.route("/listas", methods=["GET"])
def get_listas():
    """Retorna todas as listas salvas no banco de dados."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM listas")
    listas = [{"id": row[0], "nome": row[1]} for row in cursor.fetchall()]
    return jsonify(listas)

@app.route("/listas", methods=["POST"])
def add_lista():
    """Adiciona uma nova lista ao banco de dados."""
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO listas (nome) VALUES (?)", (data["nome"],))
    conn.commit()
    lista_id = cursor.lastrowid
    conn.close()
    return jsonify({"id": lista_id, "nome": data["nome"]})

# <-------------- Rotas da API para Gerenciar Linhas --------------->

# Dicionário de cache para armazenar resultados

# Função para buscar a imagem do anime no AniList
def fetch_anime_image_url(query):
    url = "https://graphql.anilist.co"
    query_graphql = """
    query($search: String) {
        Page(page: 1, perPage: 3) {
            media(search: $search, type: ANIME) {
                title {
                    romaji
                    english
                }
                coverImage {
                    large
                }
            }
        }
    }
    """

    original_query = query  # salva o nome original
    # Limpeza básica da query
    clean_query = re.sub(r'\(TV\)|\(MV\)', '', query).strip()
    clean_query = clean_query.replace('-', ' ')  # substitui hífens por espaços
    clean_query = re.sub(r'[^\w\s]', '', clean_query)  # remove pontuação

    variables = {'search': clean_query}

    try:
        print(f"🔎 Buscando imagem do anime para: {clean_query}")
        response = requests.post(url, json={'query': query_graphql, 'variables': variables})

        if response.status_code == 200:
            data = response.json()
            media = data['data']['Page']['media']

            if media:
                index = 1 if ('(TV)' in original_query or '(MV)' in original_query) and len(media) > 1 else 0
                image_url = media[index]['coverImage']['large']
                print(f"✅ Imagem encontrada: {image_url}")
                return image_url
            else:
                print(f"⚠️ Nenhum anime encontrado para: {clean_query}")
        else:
            print(f"❌ Erro na API AniList (Anime): {response.status_code} | {response.text}")

    except Exception as e:
        print(f"🚨 Exceção ao buscar imagem: {e}")

    return 'https://via.placeholder.com/300x450.png?text=Sem+Capa'

# Função para buscar a imagem do mangá no AniList
def fetch_manga_image_url(query):
    url = "https://graphql.anilist.co"
    query_graphql = """
    query($search: String) {
        Page(page: 1, perPage: 3) {
            media(search: $search, type: MANGA) {
                title {
                    romaji
                    english
                }
                coverImage {
                    large
                }
            }
        }
    }
    """
    
    # Remove "(SKP)" para a busca, mantendo apenas o nome real do mangá
    clean_query = re.sub(r'\(SKP\)', '', query).strip()
    clean_query = clean_query.replace('-', ' ')
    clean_query = re.sub(r'[^\w\s]', '', clean_query)  # Remove outros caracteres especiais

    variables = {'search': clean_query}

    try:
        print(f"Buscando imagem para (mangá): {clean_query}")
        response = requests.post(url, json={'query': query_graphql, 'variables': variables})
        
        if response.status_code == 200:
            data = response.json()
            media = data['data']['Page']['media']
            if media:
                index = 1 if "(SKP)" in query and len(media) > 1 else 0
                image_url = media[index]['coverImage']['large'].strip()
                print(f"✅ Imagem encontrada: {image_url}")
                return image_url
            else:
                print(f"⚠️ Nenhum anime encontrado para: {clean_query}.")
        else:
            print(f"❌ Erro na API AniList (Manga): {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"Erro na requisição (Manga): {e}")

    return 'https://via.placeholder.com/300x450.png?text=Sem+Capa'

# Função para buscar imagens de acordo com o tipo de conteúdo (anime ou manga)
# Endpoint para buscar imagens (já existente)
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

    # Removido: cache[query] = {'image_url': image_url, 'timestamp': time.time()}
    return jsonify({'image_url': image_url})

# Novo endpoint para atualizar apenas a imagem de uma linha
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
        content_type = 'anime' if conteudo.lower() in ['anime', 'filme', 'hentai'] else 'manga'
        image_url = fetch_anime_image_url(nome) if content_type == 'anime' else fetch_manga_image_url(nome)

        if 'via.placeholder.com' not in image_url:
            cursor.execute("""
                UPDATE linhas SET imagem_url = ?
                WHERE id = ?
            """, (image_url, linha_id))
            atualizados += 1

    conn.commit()
    conn.close()

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
            "imagem_url": row[8]  # Novo campo
        }
        for row in cursor.fetchall()
    ]
    conn.close()
    return jsonify(linhas)

@app.route("/linhas", methods=["POST"])
def add_linha():
    """Adiciona uma nova linha a uma lista existente."""
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO linhas (lista_id, nome, tags, conteudo, status, episodio, opiniao)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (data["lista_id"], data["nome"], data["tags"], data["conteudo"], data["status"], data["episodio"], data["opiniao"]))
    conn.commit()
    linha_id = cursor.lastrowid
    return jsonify({"id": linha_id, "lista_id": data["lista_id"], "nome": data["nome"]})

@app.route("/linhas/<int:linha_id>", methods=["PUT"])
def update_linha(linha_id):
    """Atualiza os dados de uma linha no banco de dados."""
    data = request.get_json()
    nome = data.get('nome')
    conteudo = data.get('conteudo')
    status = data.get('status')
    episodio = data.get('episodio')
    opiniao = data.get('opiniao')
    tags = data.get('tags')  # Recebe as tags como string

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

        return jsonify({"message": "Linha atualizada com sucesso!"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/linhas/<int:linha_id>", methods=["DELETE"])
def delete_linha(linha_id):
    """Remove uma linha do banco de dados."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM linhas WHERE id = ?", (linha_id,))
    conn.commit()
    return jsonify({"message": "Linha excluída com sucesso!"})

if __name__ == "__main__":
    app.run(debug=True)
