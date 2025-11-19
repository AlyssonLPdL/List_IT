# padronizador_tags.py
import sqlite3
import re

def normalizar_texto(texto):
    """Remove acentos e converte para minúsculas para comparação"""
    import unicodedata
    if not texto:
        return ""
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    return texto.lower().strip()

def padronizar_tags():
    """Padroniza as tags no banco de dados baseado nas tags corretas fornecidas"""
    
    # Tags corretas organizadas por categoria
    tags_corretas = {
        # Romance
        "Romance", "Beijo", "Namoro", "Casamento", "Morar Juntos", "Noivado",
        "Romance do bom", "Fez Filho(s)", "Gravidez",
        
        # Ação e Aventura
        "Ação", "Poder", "Aventura", "Overpower", "Dungeon", "Mecha", "Demônio", "Monstros",
        
        # Fantasia e Sobrenatural
        "Magia", "Fantasia", "Sobrenatural", "Deuses", "Reencarnar", "Medieval",
        
        # Drama e Emocional
        "Drama", "Tristeza", "Cringe",
        
        # Sci-Fi e Tecnologia
        "SciFi", "VR/Jogo", "System",
        
        # Slice of Life
        "Slice of Life", "Vida Escolar", "Dormitorios",
        
        # Comédia
        "Comédia", "Fofo",
        
        # Horror
        "Terror", "Gore",
        
        # Esportes e Música
        "Esporte", "Musical",
        
        # Gêneros
        "Shounen", "Shoujo-ai", "Mahou Shoujo", "Yuri", "Gender bender",
        
        # Adulto e Controverso
        "Ecchi", "Nudez", "Sexo", "Incesto", "NTR", "Harem", "Nudez Nippleless",
        
        # Isekai
        "Isekai", "MC Vilão",
        
        # Personagens
        "Kemonomimi", "Goat"
    }
    
    # Mapeamento de variações para as tags corretas
    mapeamento_correcoes = {
        # Romance
        "romance": "Romance",
        "beijo": "Beijo", 
        "namoro": "Namoro",
        "casamento": "Casamento",
        "morar juntos": "Morar Juntos",
        "noivado": "Noivado",
        "romance do bom": "Romance do bom",
        "fez filho": "Fez Filho(s)",
        "fez filhos": "Fez Filho(s)",
        "gravidez": "Gravidez",
        
        # Ação e Aventura
        "acao": "Ação",
        "poder": "Poder",
        "aventura": "Aventura",
        "overpower": "Overpower",
        "dungeon": "Dungeon",
        "mecha": "Mecha",
        "demonio": "Demônio",
        "demonios": "Demônio",
        "monstros": "Monstros",
        
        # Fantasia e Sobrenatural
        "magia": "Magia",
        "fantasia": "Fantasia",
        "sobrenatural": "Sobrenatural",
        "deuses": "Deuses",
        "reencarnar": "Reencarnar",
        "reencarnacao": "Reencarnar",
        "reencarnação": "Reencarnar",
        "medieval": "Medieval",
        
        # Drama e Emocional
        "drama": "Drama",
        "tristeza": "Tristeza",
        "cringe": "Cringe",
        
        # Sci-Fi e Tecnologia
        "scifi": "SciFi",
        "sci-fi": "SciFi",
        "science fiction": "SciFi",
        "ficcao cientifica": "SciFi",
        "ficção científica": "SciFi",
        "vr jogo": "VR/Jogo",
        "vr/jogo": "VR/Jogo",
        "virtual reality": "VR/Jogo",
        "system": "System",
        "sistema": "System",
        
        # Slice of Life
        "slice of life": "Slice of Life",
        "vida escolar": "Vida Escolar",
        "escola": "Vida Escolar",
        "dormitorios": "Dormitorios",
        "dormitório": "Dormitorios",
        
        # Comédia
        "comedia": "Comédia",
        "comédia": "Comédia",
        "fofo": "Fofo",
        "fofinho": "Fofo",
        
        # Horror
        "terror": "Terror",
        "gore": "Gore",
        "sangue": "Gore",
        
        # Esportes e Música
        "esporte": "Esporte",
        "esportes": "Esporte",
        "musical": "Musical",
        "musica": "Musical",
        
        # Gêneros
        "shounen": "Shounen",
        "shoujo ai": "Shoujo-ai",
        "shoujo-ai": "Shoujo-ai",
        "mahou shoujo": "Mahou Shoujo",
        "magical girl": "Mahou Shoujo",
        "yuri": "Yuri",
        "gender bender": "Gender bender",
        "genderbender": "Gender bender",
        
        # Adulto e Controverso
        "ecchi": "Ecchi",
        "nudez": "Nudez",
        "núdez": "Nudez",
        "sexo": "Sexo",
        "incesto": "Incesto",
        "ntr": "NTR",
        "harem": "Harem",
        "nudez nippleless": "Nudez Nippleless",
        "nippleless": "Nudez Nippleless",
        
        # Isekai
        "isekai": "Isekai",
        "mc vilao": "MC Vilão",
        "mc vilão": "MC Vilão",
        "vilao": "MC Vilão",
        "vilão": "MC Vilão",
        
        # Personagens
        "kemonomimi": "Kemonomimi",
        "animal ears": "Kemonomimi",
        "goat": "Goat",
        "goat": "Goat"
    }
    
    # Conecta ao banco
    conn = sqlite3.connect('list_it.db')
    cursor = conn.cursor()
    
    # Busca todas as linhas com tags
    cursor.execute("SELECT id, tags FROM linhas WHERE tags IS NOT NULL AND tags != ''")
    linhas = cursor.fetchall()
    
    print(f"🔍 Encontradas {len(linhas)} linhas com tags para verificar...")
    
    total_corrigidas = 0
    linhas_alteradas = 0
    
    for linha_id, tags_originais in linhas:
        if not tags_originais:
            continue
            
        # Separa as tags por vírgula
        tags_lista = [tag.strip() for tag in tags_originais.split(',')]
        tags_corrigidas = []
        
        for tag in tags_lista:
            tag_limpa = tag.strip()
            if not tag_limpa:
                continue
                
            # Verifica se a tag já está correta
            if tag_limpa in tags_corretas:
                tags_corrigidas.append(tag_limpa)
                continue
                
            # Normaliza a tag para comparação
            tag_normalizada = normalizar_texto(tag_limpa)
            
            # Tenta encontrar correção no mapeamento
            if tag_normalizada in mapeamento_correcoes:
                tag_corrigida = mapeamento_correcoes[tag_normalizada]
                tags_corrigidas.append(tag_corrigida)
                total_corrigidas += 1
                print(f"   🔄 '{tag_limpa}' → '{tag_corrigida}'")
            else:
                # Se não encontrou correção, mantém a original
                tags_corrigidas.append(tag_limpa)
        
        # Remove duplicatas mantendo a ordem
        tags_final = []
        for tag in tags_corrigidas:
            if tag not in tags_final:
                tags_final.append(tag)
        
        # Junta as tags corrigidas
        nova_tags_string = ', '.join(tags_final)
        
        # Atualiza no banco se houve mudança
        if nova_tags_string != tags_originais:
            cursor.execute("UPDATE linhas SET tags = ? WHERE id = ?", (nova_tags_string, linha_id))
            linhas_alteradas += 1
            print(f"✅ Linha {linha_id} atualizada: {nova_tags_string}")
    
    conn.commit()
    conn.close()
    
    print(f"\n🎯 Padronização concluída!")
    print(f"📊 Total de tags corrigidas: {total_corrigidas}")
    print(f"📊 Total de linhas alteradas: {linhas_alteradas}")
    
    return total_corrigidas, linhas_alteradas

def mostrar_estatisticas_tags():
    """Mostra estatísticas das tags atuais no banco"""
    
    conn = sqlite3.connect('list_it.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT tags FROM linhas WHERE tags IS NOT NULL AND tags != ''")
    linhas = cursor.fetchall()
    
    todas_tags = []
    for tags_string, in linhas:
        if tags_string:
            tags = [tag.strip() for tag in tags_string.split(',')]
            todas_tags.extend(tags)
    
    from collections import Counter
    contador = Counter(todas_tags)
    
    print(f"\n📈 Estatísticas das Tags:")
    print(f"Total de tags únicas: {len(contador)}")
    print(f"Total de ocorrências: {len(todas_tags)}")
    
    print(f"\n🏷️ Tags mais comuns:")
    for tag, count in contador.most_common(20):
        print(f"  {tag}: {count}")
    
    conn.close()

if __name__ == "__main__":
    print("🚀 Iniciando padronização de tags...")
    
    # Mostra estatísticas antes
    print("\n--- ANTES DA PADRONIZAÇÃO ---")
    mostrar_estatisticas_tags()
    
    # Executa a padronização
    total_corrigidas, linhas_alteradas = padronizar_tags()
    
    # Mostra estatísticas depois
    print("\n--- DEPOIS DA PADRONIZAÇÃO ---")
    mostrar_estatisticas_tags()
    
    print(f"\n✅ Processo finalizado!")
    print(f"🎯 Tags corrigidas: {total_corrigidas}")
    print(f"📊 Linhas alteradas: {linhas_alteradas}")