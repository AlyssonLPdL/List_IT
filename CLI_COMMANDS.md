# Comandos do CLI

Este arquivo reúne os comandos suportados pelo `cli.py` para usar a aplicação.

## Comandos gerais (antes de abrir uma lista)

- `show_lists`
  - Lista todas as listas disponíveis.

- `create_new_list <nome>`
  - Cria uma nova lista no servidor com o nome fornecido.
  - Exemplo: `create_new_list Minha Lista`

- `open_<id|nome>`
  - Abre uma lista para navegação usando o `id` ou o nome exato.
  - Exemplo: `open_1` ou `open_Minha Lista`

- `clear` ou `cls`
  - Limpa a tela do terminal.

- `exit` ou `quit`
  - Sai do CLI.

## Comandos dentro de um contexto de lista aberta

Ao abrir uma lista, você pode usar este conjunto de comandos para navegar e filtrar itens.

- `show_lines` [filtro]
  - Exibe as linhas da lista. Se passar um filtro, aplica busca avançada.
  - Exemplo: `show_lines +anime +Favorito -ruim`

- `show_tags`
  - Mostra as tags disponíveis na lista.

- `search_<termo>`
  - Busca itens pelo nome dentro da lista aberta.
  - Exemplo: `search_Naruto`

- `open_<nome>`
  - Abre diretamente um item da lista pelo nome.
  - Funcionará para correspondências exatas e tentará correspondências parciais quando houver apenas um resultado.
  - Exemplo: `open_Naruto`

- `show_<tag>`
  - Exibe itens que possuem a tag indicada.
  - Exemplo: `show_romance`

- `show_anime`, `show_filme`, `show_manga`, `show_manhwa`, `show_webtoon`
  - Filtra itens pelo tipo de conteúdo.

- `show_<status>`
  - Filtra itens por status, como `show_seeing`, `show_finished`, `show_canceled`, etc.

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
  - Ordena itens pela prioridade de opinião.

- `sort_rate -r`
  - Ordena itens pela prioridade de opinião em ordem reversa.

- `next` / `prev`
  - Navega páginas na exibição atual.

- `<número>`
  - Vai diretamente para a página indicada.

- `export_list` [nome_arquivo]
  - Exporta a exibição corrente para um arquivo `.xlsx`.
  - Exemplo: `export_list minha_lista.xlsx`

- `back` ou `b`
  - Volta para o menu principal.

## Comandos dentro de um item aberto

Quando você abre um item específico, os comandos abaixo estão disponíveis.

- `next` / `n`
  - Abre o próximo item na exibição atual.

- `prev` / `p`
  - Abre o item anterior.

- `show_details`
  - Mostra os detalhes completos do item.

- `edit <campo> <novo_valor>`
  - Edita um campo do item localmente.
  - Exemplo: `edit tags romance,aventura`

- `edit`
  - Entra em modo de edição interativo para vários campos.

- `save`
  - Salva as alterações do item de volta ao servidor.

- `refresh`
  - Recarrega o item do servidor.

- `delete`
  - Exclui o item (com confirmação).

- `back` ou `b`
  - Volta para a lista aberta.

- `clear` ou `cls`
  - Limpa a tela.

- `exit` ou `quit`
  - Sai do CLI.

## Notas úteis

- O servidor Flask deve estar rodando em `http://localhost:5000` para que o CLI funcione.
- Caso use outra porta ou host, configure a variável de ambiente `API_BASE` antes de rodar o CLI.
  - Exemplo (PowerShell):
    ```powershell
    $env:API_BASE = "http://localhost:5000"
    python cli.py
    ```
