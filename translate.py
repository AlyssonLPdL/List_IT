import sqlite3
import re
import sys
import requests
from time import sleep

def is_not_empty(text: str) -> bool:
    return bool(text and text.strip())

def translate_text_via_api(text: str, target_lang: str = 'pt') -> str:
    """
    Traduz `text` usando o endpoint HTTP /translate.
    Retorna o texto traduzido ou, em caso de erro, mantém o original.
    """
    url = "http://localhost:5000/translate"  # ajuste se seu servidor estiver em outra porta/URL
    payload = {"text": text, "target_lang": target_lang}
    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        traducao = data.get("traducao") or data.get("translation") or ""
        if not traducao:
            print(f"⚠️  ID não retornou 'traducao': {data}", file=sys.stderr)
            return text
        return traducao
    except requests.exceptions.RequestException as e:
        print(f"❌ Erro HTTP na tradução: {e}", file=sys.stderr)
        return text
    except ValueError as e:
        print(f"❌ Resposta JSON inválida: {e}", file=sys.stderr)
        return text

def migrate_translate_sinopses(db_path: str = "list_it.db"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, sinopse
          FROM linhas
         WHERE sinopse IS NOT NULL
           AND TRIM(sinopse) != ''
         ORDER BY id DESC
         LIMIT 30
    """)
    rows = cursor.fetchall()
    total = len(rows)
    print(f"🔍 Total de sinopses encontradas: {total}\n")

    if total == 0:
        print("⚠️ Não há sinopses para traduzir. Abortando.")
        conn.close()
        return

    updated = 0
    for idx, (linha_id, sinopse_orig) in enumerate(rows, start=1):
        print(f"[{idx}/{total}] ▶️  ID={linha_id}")
        print(f"    📝 Original: {sinopse_orig!r}")

        if not is_not_empty(sinopse_orig):
            print(f"    ⚠️ Sinopse vazia, pulando.\n")
            continue

        traduzida = translate_text_via_api(sinopse_orig, target_lang='pt')
        if traduzida == sinopse_orig:
            print("    ⚠️ Sem alteração no texto (mantém original).")
        else:
            print(f"    ✅ Traduzida: {traduzida!r}")

        # Atualiza no banco apenas se mudou
        if traduzida != sinopse_orig:
            try:
                cursor.execute("""
                    UPDATE linhas
                       SET sinopse = ?
                     WHERE id = ?
                """, (traduzida, linha_id))
                conn.commit()
                updated += 1
                print("    💾 Atualizado com sucesso.\n")
            except Exception as e:
                print(f"    ❌ Falha no UPDATE: {e}\n", file=sys.stderr)
                conn.rollback()
        else:
            print("    ℹ️ Nenhuma atualização necessária.\n")

        sleep(0.3)  # leve pausa para não sobrecarregar a API

    conn.close()
    print(f"\n🏁 Migração concluída. Sinopses atualizadas: {updated}/{total}")

if __name__ == "__main__":
    migrate_translate_sinopses("list_it.db")
