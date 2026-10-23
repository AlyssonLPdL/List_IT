# padronizador_tags.py
import sqlite3
import re
from collections import Counter

def normalizar_texto(texto):
    """Remove acentos e converte para minúsculas para comparação"""
    import unicodedata
    if not texto:
        return ""
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    return texto.lower().strip()

def capitalizar_primeira_letra(texto):
    """Capitaliza apenas a primeira letra do texto"""
    if not texto:
        return ""
    texto = texto.strip()
    return texto[0].upper() + texto[1:] if len(texto) > 0 else ""

def padronizar_status_conteudo():
    """Padroniza status e conteúdo no banco de dados"""
    
    # Conjuntos corretos
    CONTENT_TYPES = {"Anime", "Filme", "Manga", "Manhwa", "Webtoon"}
    STATUS_SET = {"Concluido", "Vendo", "Cancelado", "Dropado", "Lendo", "Assistir", "Conheço", "Assistindo"}
    
    # Mapeamento de correções para Conteúdo
    mapeamento_conteudo = {
        "anime": "Anime",
        "filme": "Filme",
        "manga": "Manga",
        "manhwa": "Manhwa",
        "webtoon": "Webtoon",
        "webtoom": "Webtoon",  # erro comum
        "manhua": "Manhwa",    # muitos confundem
    }
    
    # Mapeamento de correções para Status
    mapeamento_status = {
        "concluido": "Concluido",
        "concluído": "Concluido",
        "finalizado": "Concluido",
        "completo": "Concluido",
        "vendo": "Vendo",
        "assistindo": "Assistindo",
        "assistir": "Assistir",
        "cancelado": "Cancelado",
        "dropado": "Dropado",
        "droppado": "Dropado",
        "lendo": "Lendo",
        "conheço": "Conheço",
        "conheco": "Conheço",
    }
    
    conn = sqlite3.connect('list_it.db')
    cursor = conn.cursor()
    
    # Verifica se as colunas existem
    cursor.execute("PRAGMA table_info(linhas)")
    colunas = [coluna[1] for coluna in cursor.fetchall()]
    
    alteracoes = {"conteudo": 0, "status": 0}
    linhas_alteradas = 0
    
    # Processa Conteúdo
    if 'conteudo' in colunas:
        print("\n📝 Corrigindo Conteúdo...")
        cursor.execute("SELECT id, conteudo FROM linhas WHERE conteudo IS NOT NULL AND conteudo != ''")
        linhas = cursor.fetchall()
        
        for linha_id, conteudo_original in linhas:
            if not conteudo_original:
                continue
                
            conteudo_limpo = conteudo_original.strip()
            conteudo_normalizado = normalizar_texto(conteudo_limpo)
            
            # Verifica se já está correto
            if conteudo_limpo in CONTENT_TYPES:
                continue
                
            # Tenta corrigir
            if conteudo_normalizado in mapeamento_conteudo:
                conteudo_corrigido = mapeamento_conteudo[conteudo_normalizado]
                cursor.execute("UPDATE linhas SET conteudo = ? WHERE id = ?", (conteudo_corrigido, linha_id))
                alteracoes["conteudo"] += 1
                linhas_alteradas += 1
                print(f"   🔄 Conteúdo '{conteudo_original}' → '{conteudo_corrigido}' (ID: {linha_id})")
            elif conteudo_normalizado:
                # Capitaliza se não encontrou no mapeamento
                conteudo_capitalizado = capitalizar_primeira_letra(conteudo_limpo)
                if conteudo_capitalizado != conteudo_limpo:
                    cursor.execute("UPDATE linhas SET conteudo = ? WHERE id = ?", (conteudo_capitalizado, linha_id))
                    alteracoes["conteudo"] += 1
                    linhas_alteradas += 1
                    print(f"   🔄 Conteúdo '{conteudo_original}' → '{conteudo_capitalizado}' (ID: {linha_id})")
    
    # Processa Status
    if 'status' in colunas:
        print("\n📝 Corrigindo Status...")
        cursor.execute("SELECT id, status FROM linhas WHERE status IS NOT NULL AND status != ''")
        linhas = cursor.fetchall()
        
        for linha_id, status_original in linhas:
            if not status_original:
                continue
                
            status_limpo = status_original.strip()
            status_normalizado = normalizar_texto(status_limpo)
            
            # Verifica se já está correto
            if status_limpo in STATUS_SET:
                continue
                
            # Tenta corrigir
            if status_normalizado in mapeamento_status:
                status_corrigido = mapeamento_status[status_normalizado]
                cursor.execute("UPDATE linhas SET status = ? WHERE id = ?", (status_corrigido, linha_id))
                alteracoes["status"] += 1
                linhas_alteradas += 1
                print(f"   🔄 Status '{status_original}' → '{status_corrigido}' (ID: {linha_id})")
            elif status_normalizado:
                # Capitaliza se não encontrou no mapeamento
                status_capitalizado = capitalizar_primeira_letra(status_limpo)
                if status_capitalizado != status_limpo:
                    cursor.execute("UPDATE linhas SET status = ? WHERE id = ?", (status_capitalizado, linha_id))
                    alteracoes["status"] += 1
                    linhas_alteradas += 1
                    print(f"   🔄 Status '{status_original}' → '{status_capitalizado}' (ID: {linha_id})")
    
    conn.commit()
    conn.close()
    
    print(f"\n📊 Resumo alterações:")
    print(f"  Conteúdo corrigidos: {alteracoes['conteudo']}")
    print(f"  Status corrigidos: {alteracoes['status']}")
    print(f"  Total de linhas alteradas: {linhas_alteradas}")
    
    return alteracoes, linhas_alteradas

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
        "Drama", "Tristeza", "Vergonhoso",
        
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
        "Ecchi", "Nudez", "Sexo", "Incesto", "NTR", "Harem", "Nudez Nippleless", "Hentai",
        
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
        "vergonhoso": "Vergonhoso",
        
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
        "hentai": "Hentai",
        
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
                # Se não encontrou correção, capitaliza a primeira letra
                tag_capitalizada = capitalizar_primeira_letra(tag_limpa)
                if tag_capitalizada != tag_limpa:
                    tags_corrigidas.append(tag_capitalizada)
                    total_corrigidas += 1
                    print(f"   🔄 '{tag_limpa}' → '{tag_capitalizada}' (capitalizada)")
                else:
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
    
    print(f"\n🎯 Padronização de tags concluída!")
    print(f"📊 Total de tags corrigidas: {total_corrigidas}")
    print(f"📊 Total de linhas alteradas: {linhas_alteradas}")
    
    return total_corrigidas, linhas_alteradas

def mostrar_estatisticas_completas():
    """Mostra estatísticas completas do banco"""
    
    conn = sqlite3.connect('list_it.db')
    cursor = conn.cursor()
    
    # Estatísticas de Tags
    cursor.execute("SELECT tags FROM linhas WHERE tags IS NOT NULL AND tags != ''")
    linhas_tags = cursor.fetchall()
    
    todas_tags = []
    for tags_string, in linhas_tags:
        if tags_string:
            tags = [tag.strip() for tag in tags_string.split(',')]
            todas_tags.extend(tags)
    
    contador_tags = Counter(todas_tags)
    
    print(f"\n📊 ESTATÍSTICAS DAS TAGS:")
    print(f"  Total de tags únicas: {len(contador_tags)}")
    print(f"  Total de ocorrências: {len(todas_tags)}")
    
    print(f"\n  🏷️ Tags mais comuns:")
    for tag, count in contador_tags.most_common(20):
        print(f"    {tag}: {count}")
    
    # Estatísticas de Conteúdo
    cursor.execute("PRAGMA table_info(linhas)")
    colunas = [coluna[1] for coluna in cursor.fetchall()]
    
    if 'conteudo' in colunas:
        cursor.execute("SELECT conteudo FROM linhas WHERE conteudo IS NOT NULL AND conteudo != ''")
        conteudos = [row[0] for row in cursor.fetchall()]
        contador_conteudo = Counter(conteudos)
        
        print(f"\n📊 ESTATÍSTICAS DE CONTEÚDO:")
        for tipo, count in contador_conteudo.most_common():
            print(f"  {tipo}: {count}")
    
    # Estatísticas de Status
    if 'status' in colunas:
        cursor.execute("SELECT status FROM linhas WHERE status IS NOT NULL AND status != ''")
        statuses = [row[0] for row in cursor.fetchall()]
        contador_status = Counter(statuses)
        
        print(f"\n📊 ESTATÍSTICAS DE STATUS:")
        for status, count in contador_status.most_common():
            print(f"  {status}: {count}")
    
    conn.close()

if __name__ == "__main__":
    print("🚀 Iniciando padronização completa...")
    
    # Mostra estatísticas antes
    print("\n--- ANTES DA PADRONIZAÇÃO ---")
    mostrar_estatisticas_completas()
    
    # Executa a padronização de status e conteúdo
    print("\n" + "="*50)
    print("ETAPA 1: Padronizando Status e Conteúdo")
    print("="*50)
    alteracoes, linhas_alteradas_sc = padronizar_status_conteudo()
    
    # Executa a padronização de tags
    print("\n" + "="*50)
    print("ETAPA 2: Padronizando Tags")
    print("="*50)
    total_corrigidas, linhas_alteradas_tags = padronizar_tags()
    
    # Mostra estatísticas depois
    print("\n" + "="*50)
    print("--- DEPOIS DA PADRONIZAÇÃO ---")
    mostrar_estatisticas_completas()
    
    print("\n" + "="*50)
    print("✅ PROCESSO FINALIZADO!")
    print("="*50)
    print(f"📊 Resumo total:")
    print(f"  Status corrigidos: {alteracoes['status']}")
    print(f"  Conteúdo corrigidos: {alteracoes['conteudo']}")
    print(f"  Tags corrigidas: {total_corrigidas}")
    print(f"  Linhas alteradas (Status/Conteúdo): {linhas_alteradas_sc}")
    print(f"  Linhas alteradas (Tags): {linhas_alteradas_tags}")