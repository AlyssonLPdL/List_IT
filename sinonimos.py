import sqlite3
import json
import re

def is_romanji_or_english(text):
    pattern = re.compile(r"^[a-zA-Z0-9\s\-\',’‘\.\?\!\:]+$")
    return bool(pattern.match(text))

def migrate_sinonimos_to_json():
    conn = sqlite3.connect("list_it.db")
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, sinonimos FROM linhas 
        WHERE sinonimos IS NOT NULL AND sinonimos != '' AND TRIM(sinonimos) LIKE '[%'
    """)
    rows = cursor.fetchall()
    print(f"🔍 Encontrados {len(rows)} registros no formato JSON para migrar.")

    updated = 0
    for linha_id, sinonimos_json_str in rows:
        try:
            # decodifica a string JSON para lista
            sinonimos_list = json.loads(sinonimos_json_str)
        except json.JSONDecodeError:
            print(f"⚠️ Linha {linha_id} - JSON inválido, ignorando")
            continue
        
        filtrados = [s for s in sinonimos_list if is_romanji_or_english(s)]
        
        print(f"ℹ️ Linha {linha_id} - original: {sinonimos_list}")
        print(f"ℹ️ Linha {linha_id} - filtrados (romaji/english): {filtrados}")

        novo_json = json.dumps(filtrados, ensure_ascii=False)

        cursor.execute("""
            UPDATE linhas SET sinonimos = ? WHERE id = ?
        """, (novo_json, linha_id))
        updated += 1

    conn.commit()
    conn.close()
    print(f"\n🏁 Migração finalizada. Total migrados: {updated}")

if __name__ == "__main__":
    migrate_sinonimos_to_json()
