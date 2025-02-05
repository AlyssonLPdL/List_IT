from flask import Flask, render_template, request, jsonify
import sqlite3
import json

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

    cursor.execute("SELECT COUNT(*) FROM linhas WHERE nome = ? AND lista_id = ?", (data["nome"], data["lista_id"]))
    count = cursor.fetchone()[0]
    
    if count > 0:
        return jsonify({"error": "A linha com esse nome já existe nesta lista."}), 400

    cursor.execute("""
    INSERT INTO linhas (lista_id, nome, tags, conteudo, status, episodio, opiniao)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (data["lista_id"], data["nome"], data["tags"], data["conteudo"], data["status"], data["episodio"], data["opiniao"]))
    conn.commit()
    linha_id = cursor.lastrowid
    return jsonify({"id": linha_id, "lista_id": data["lista_id"], "nome": data["nome"]})

# <-------------- Rotas da API para Gerenciar Linhas --------------->

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
