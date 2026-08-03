# Comandos do CLI

Este arquivo reúne os comandos suportados pelo `cli.py` para usar a aplicação.

---

## Comandos gerais (antes de abrir uma lista)

- `show_lists`
  - Lista todas as listas disponíveis no banco **principal**.

- `show_wait_lists`
  - Lista todas as listas disponíveis no banco de **espera**.

- `create_list <nome>`
  - Cria uma nova lista no banco **principal** com o nome fornecido.
  - Exemplo: `create_list Animes 2025`

- `create_wait_list <nome>`
  - Cria uma nova lista no banco de **espera** com o nome fornecido.
  - Exemplo: `create_wait_list Animes 2025 (offline)`

- `open <id|nome>`
  - Abre uma lista do banco **principal** para navegação usando o `id` ou o nome exato.
  - Exemplo: `open 1` ou `open Minha Lista`

- `open_wait <id|nome>`
  - Abre uma lista do banco de **espera** para navegação usando o `id` ou o nome exato.
  - Exemplo: `open_wait 1` ou `open_wait Minha Lista (offline)`

- `delete_list <id|nome>`
  - Deleta uma lista do banco **principal**. Será solicitada confirmação antes da exclusão.
  - Exemplo: `delete_list 3` ou `delete_list Minha Lista`

- `verify_api`
  - Verifica se a API do AniList está respondendo corretamente (útil para saber se dá para migrar ou buscar dados).

- `migrate_wait [id]`
  - **Migra** todas as listas (ou uma lista específica, se passar o `id`) do banco de **espera** para o banco **principal**.
  - Durante a migração, o sistema tenta buscar automaticamente a imagem, sinopse e sinônimos no AniList.
  - Se o AniList não retornar dados, mantém as informações que já estavam no banco de espera.
  - Exemplo: `migrate_wait` (migra tudo) ou `migrate_wait 1` (migra só a lista com ID 1).

- `migrate_wait_dry`
  - **Simula** a migração (dry-run) sem alterar nada, mostrando o que seria feito.
  - Útil para conferir antes de executar a migração de verdade.

- `clear_wait`
  - **Limpa** todo o banco de espera (remove todas as listas e linhas). Solicita confirmação antes de executar.

- `clear` ou `cls`
  - Limpa a tela do terminal.

- `help` ou `?`
  - Mostra os comandos disponíveis no contexto atual.

- `exit` ou `quit`
  - Sai do CLI.

---

## Comandos dentro de um contexto de lista aberta

Ao abrir uma lista (seja ela do banco principal ou de espera), você pode usar estes comandos para navegar e gerenciar os itens:

- `create_line <nome>`
  - Inicia o **assistente interativo** para criar uma nova linha na lista atual (banco principal).
  - O assistente pergunta, passo a passo:
    1. Tags (exibe todas as tags do sistema em colunas com números).
    2. Tipo de mídia (Anime, Filme, Manga, Manhwa, Webtoon).
    3. Status (adaptado automaticamente para "Assistindo/Lendo" ou "Assistir/Ler").
    4. Episódio/Capítulo atual.
    5. Opinião (de Favorito a Não Vi).
  - A tela é limpa a cada etapa para facilitar a leitura.
  - Exemplo: `create_line Sakamoto Days`

- `create_wait_line <nome>`
  - Mesmo funcionamento do `create_line`, mas preserva o comportamento de criar na lista atual.
  - Use `create_line` para o mesmo efeito; esse comando não precisa alterar o banco alvo.
  - Exemplo: `create_wait_line One Piece`

- `show_lines` [filtro]
  - Exibe as linhas da lista. Se passar um filtro, aplica busca avançada.
  - Exemplo: `show_lines +anime +Favorito -ruim`

- `show_tags`
  - Mostra todas as tags disponíveis na lista.

- `search_<termo>`
  - Busca itens pelo nome dentro da lista aberta.
  - Exemplo: `search_Naruto`

- `open_<nome>`
  - Abre diretamente um item da lista pelo nome.
  - Funciona para correspondências exatas e tentará correspondências parciais se houver apenas um resultado.
  - Exemplo: `open_Naruto`

- `show_<tag>`
  - Exibe itens que possuem a tag indicada.
  - Exemplo: `show_romance`

- `show_anime`, `show_filme`, `show_manga`, `show_manhwa`, `show_webtoon`
  - Filtra itens pelo tipo de conteúdo.

- `show_<status>`
  - Filtra itens por status, como `show_seeing`, `show_finished`, `show_canceled`, `show_lendo`, etc.

- `show_<opiniao>`
  - Filtra itens por opinião, como `show_favorito`, `show_muito_bom`, `show_recomendo`, etc.

- `sort_0-9`
  - Ordena itens por ID crescente.

- `sort_9-0`
  - Ordena itens por ID decrescente.

- `sort_a-z`
  - Ordena itens por nome em ordem alfabética crescente.

- `sort_z-a`
  - Ordena itens por nome em ordem alfabética decrescente.

- `sort_rate`
  - Ordena itens pela prioridade de opinião (Favorito > Muito Bom > ... > Não Vi).

- `sort_rate -r`
  - Ordena itens pela prioridade de opinião em ordem reversa.

- `next` / `prev`
  - Navega pelas páginas na exibição atual.

- `<número>`
  - Vai diretamente para a página indicada na exibição atual.

- `export_list` [nome_arquivo]
  - Exporta a exibição corrente para um arquivo `.xlsx`.
  - Pergunta quais colunas incluir e gera uma linha por tag.
  - Exemplo: `export_list minha_lista.xlsx`

- `back` ou `b`
  - Volta para o menu principal.

---

## Comandos dentro de um item aberto

Quando você abre um item específico (usando `open_<nome>` ou `open_<número>`), os comandos abaixo estão disponíveis:

- `next` / `n`
  - Abre o próximo item na exibição atual.

- `prev` / `p`
  - Abre o item anterior na exibição atual.

- `show_details`
  - Mostra os detalhes completos do item (ID, nome, sinopse, sinônimos, imagem, etc.).

- `edit <campo> <novo_valor>`
  - Edita um campo específico do item localmente.
  - Campos suportados: `nome`, `conteudo`, `status`, `episodio`, `opiniao`, `tags`, `sinopse`, `imagem_url`, `sinonimos`.
  - Exemplo: `edit tags romance,aventura`

- `edit`
  - Entra em modo de edição interativo, onde você pode alterar vários campos um por um.

- `save`
  - Salva as alterações do item de volta ao servidor (banco principal ou de espera, dependendo de onde veio).

- `refresh`
  - Recarrega os dados do item diretamente do servidor, descartando alterações locais não salvas.

- `delete`
  - Exclui o item permanentemente (solicita confirmação).

- `check`
  - Atualiza a data/hora do "highlight" deste item no servidor (usado para controle de exibição em destaques).

- `back` ou `b`
  - Volta para a lista aberta (contexto anterior).

- `clear` ou `cls`
  - Limpa a tela.

- `exit` ou `quit`
  - Sai do CLI.

---

## Notas úteis

- O servidor Flask deve estar rodando em `http://localhost:5000` para que o CLI funcione.
- Caso use outra porta ou host, configure a variável de ambiente `API_BASE` antes de rodar o CLI:
  - **Windows (PowerShell)**:
    ```powershell
    $env:API_BASE = "http://localhost:5000"
    python cli.py