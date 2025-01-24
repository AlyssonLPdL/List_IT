const express = require('express');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');

const app = express();
const PORT = 3000;

// Configura o simple-git
const git = simpleGit();

// Middleware para interpretar JSON no corpo da requisição
app.use(express.json());

// Middleware para servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rota GET para '/'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota POST para salvar os dados no arquivo JSON
app.post('/save-list', async (req, res) => {
    const newList = req.body; //Dados enviados do formulario

    // caminho do arquivo data.json
    const filePath = path.join(__dirname, 'data.json');

    // Lê o arquivo atual ou inicializa com um array vazio
    try {
        const data = fs.existsSync(filePath)
            ? await fs.promises.readFile(filePath, 'utf8')
            : '[]';
        const lists = JSON.parse(data);

        // adciona a nova lista
        lists.push(newList);

        // Salva no arquivo data.json
        await fs.promises.writeFile(filePath, JSON.stringify(lists, null, 2), 'utf8');
        
        res.status(200).json({ message: 'Lista salva com sucesso!' });
        
        // Commit automatico
        await git.add('./*');
        await git.commit('Auto-commit: Nova Lista ${newList.name}');
        await git.push('origin', 'main');
        console.log('Commit automatico realizado');

    } catch (err) {
        console.log('Erro ao salvar a lista:', err);
    }
});

// Rota GET para obter as listas do arquivo data.json
app.get('/lists', (req, res) => {
    const filePath = path.join(__dirname, 'data.json');

    // lê o arquivo data.json
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Erro ao ler o arquivo:', err);
            return res.status(500).json({ message: 'errp ao carregar as listas.' });
        }

        const lists = data ? JSON.parse(data) : [] // Converte para array ou usa uma arrray vazia
        res.status(200).json(lists); // retorna as listas como JSON
    });
});

// Rota POST para adicionar nova linha à lista existente
app.post('/add-line', async (req, res) => {
    const newLine = req.body; // Nova linha
    const listName = req.body.listName;

    const filePath = path.join(__dirname, 'data.json');

    try {
        const data = fs.existsSync(filePath)
            ? await fs.promises.readFile(filePath, 'utf8')
            :'[]';
        const lists = JSON.parse(data);

        // Encontre a lista correspondente e adicione a nova linha
        const listIndex = lists.findIndex(list => list.name === listName);
        
        if (listIndex !== -1) {
            lists[listIndex].items.push({
                name: newLine.name,
                tags: newLine.tags,
                content: newLine.content,
                status: newLine.status,
                episode: newLine.episode,
                opinion: newLine.opinion
            });
        } else {
            return res.status(400).json({ message: 'Lista não encontrada' });
        }

        await fs.promises.writeFile(filePath, JSON.stringify(lists, null, 2), 'utf8');

        res.status(200).json({ message: 'Linha salva com sucesso!' });
    } catch (err) {
        console.log('Erro ao adicionar linha:', err)
        res.status(500).json({ message: 'Erro ao adicionar linha.' });
    }
});

// Rota PUT para atualizar uma linha existente em uma lista
app.put('/update-line', async (req, res) => {
    const updatedLine = req.body; // Linha atualizada
    console.log(updatedLine); // Verifique se os campos estão sendo passados corretamente
    const listName = updatedLine.listName;

    const filePath = path.join(__dirname, 'data.json');

    try {
        const data = fs.existsSync(filePath)
            ? await fs.promises.readFile(filePath, 'utf8')
            : '[]';
        const lists = JSON.parse(data);

        // Encontre a lista correspondente
        const listIndex = lists.findIndex(list => list.name === listName);
        
        if (listIndex !== -1) {
            const lineIndex = lists[listIndex].items.findIndex(item => item.name === updatedLine.originalName);
            
            if (lineIndex !== -1) {
                // Atualize a linha
                lists[listIndex].items[lineIndex] = {
                    ...lists[listIndex].items[lineIndex],
                    name: updatedLine.name || lists[listIndex].items[lineIndex].name,
                    tags: updatedLine.tags || lists[listIndex].items[lineIndex].tags,
                    content: updatedLine.content || lists[listIndex].items[lineIndex].content,
                    status: updatedLine.status || lists[listIndex].items[lineIndex].status,
                    episode: updatedLine.episode || lists[listIndex].items[lineIndex].episode,
                    opinion: updatedLine.opinion || lists[listIndex].items[lineIndex].opinion,
                };

                // Salva novamente no arquivo JSON
                await fs.promises.writeFile(filePath, JSON.stringify(lists, null, 2), 'utf8');
                res.status(200).json({ message: 'Linha atualizada com sucesso!' });
            } else {
                return res.status(400).json({ message: 'Linha não encontrada' });
            }
        } else {
            return res.status(400).json({ message: 'Lista não encontrada' });
        }
    } catch (err) {
        console.error('Erro ao atualizar linha:', err);
        res.status(500).json({ message: 'Erro ao atualizar linha.' });
    }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
