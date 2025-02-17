from flask import Flask, render_template, request, jsonify
import sqlite3
import requests
import re

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
# Função para buscar o ID do anime pelo nome (usando Jikan/MyAnimeList)
def fetch_anime_id(query):
    url = f"https://api.jikan.moe/v4/anime?q={query}&limit=1"

    try:
        response = requests.get(url)
        data = response.json()

        if 'data' in data and len(data['data']) > 0:
            print('Id:', data['data'][0]['mal_id'])
            return data['data'][0]['mal_id']
        else:
            print('Id não encontrado')
            return None

    except Exception as e:
        print(f"Erro ao buscar ID do anime: {e}")
        return None

# Função para buscar a imagem do anime no MyAnimeList
def fetch_anime_image_url(query):
    url = f"https://api.jikan.moe/v4/anime?q={query}&limit=5"

    try:
        response = requests.get(url)
        data = response.json()

        if 'data' in data and len(data['data']) > 0:
            if query.strip().endswith("(TV)") or query.strip().endswith("(MV)"):
                if len(data['data']) > 1:
                    image_url = data['data'][1]['images']['jpg']['large_image_url']
                else:
                    image_url = data['data'][0]['images']['jpg']['large_image_url']
            else:
                image_url = data['data'][0]['images']['jpg']['large_image_url']
            return image_url
        else:
            return 'https://via.placeholder.com/150'

    except Exception as e:
        print(f"Erro ao buscar imagem do anime: {e}")
        return 'https://via.placeholder.com/150'

# Função para buscar a imagem do mangá no MangaDex
def fetch_manga_image_url(query):
    # Definindo a URL e o corpo da requisição GraphQL
    url = "https://graphql.anilist.co"
    query_graphql = """
    query($search: String) {
        Page(page: 1, perPage: 5) {
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
    
    # Remove todos os caracteres especiais, deixando apenas letras e números
    cleanTitle = re.sub(r'[^\w\s]', '', query)  # Remove caracteres especiais

    # Variantes para a busca
    variations = [cleanTitle, query]  # Usa o título limpo e o original (com caracteres especiais)

    for variation in variations:
        variables = {
            'search': variation
        }

        try:
            print(f"Buscando imagem para o mangá: {variation}")
            
            # Faz a requisição POST com o título de busca
            response = requests.post(url, json={'query': query_graphql, 'variables': variables})
            
            if response.status_code == 200:
                data = response.json()
                media = data['data']['Page']['media']
                
                if media:
                    # Sempre pega a imagem do primeiro resultado
                    first_result = media[0]
                    image_url = first_result['coverImage']['large']
                    print(f"Imagem encontrada: {image_url}")
                    return image_url
                else:
                    print(f"Nenhum resultado encontrado para {variation}.")
            else:
                print(f"Erro na requisição AniList API: Status {response.status_code}")

        except requests.exceptions.RequestException as e:
            print(f"Erro ao fazer a requisição: {e}")

    return 'https://via.placeholder.com/300x450.png?text=Sem+Capa'

# Função para buscar imagens de acordo com o tipo de conteúdo (anime ou manga)
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

@app.route("/linhas/<int:lista_id>", methods=["GET"])
def get_linhas(lista_id):
    """Retorna todas as linhas de uma lista específica."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM linhas WHERE lista_id = ?", (lista_id,))
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
        }
        for row in cursor.fetchall()
    ]
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
