const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware para interpretar JSON no corpo da requisição
app.use(express.json());

// Middleware para servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rota GET para '/'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota POST para salvar os dados no arquivo JSON
app.post('/save-list', (req, res) => {
    const newList = req.body; //Dados enviados do formulario

    // caminho do arquivo data.json
    const filePath = path.join(__dirname, 'data.json');

    // Lê o arquivo atual ou inicializa com um array vazio
    fs.readFile(filePath, 'utf8', (err, data) => {
        let lists = [];
        if (!err && data) {
            lists = JSON.parse(data); // Converte os dados existentes para um array
        }

        // adciona a nova lista
        lists.push(newList);

        // Salva no arquivo data.json
        fs.writeFile(filePath, JSON.stringify(lists, null, 2), 'utf8', (writeErr) => {
            if (writeErr) {
                console.error('Erro ao salvar o arquivo:', writeErr);
                return res.status(500).json({ message: 'Erro ao salvar a lista.' });
            }

            res.status(200).json({ message: 'Lista salva com sucesso!' });
        });
    });
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

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
