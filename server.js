// server.js — Proxy para a API do Google Fact Check
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// ⚠️ COLOQUE SUA CHAVE DE API AQUI
const API_KEY = 'AIzaSyDXlbWtCTFQgx2UjOMRecfR6eiWV_aEhqE';
const API_URL = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

app.use(cors());
app.use(express.json());

app.get('/api/factcheck', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({ error: 'Parâmetro "query" é obrigatório.' });
        }

        console.log(`🔍 Procurando: "${query}"`);
        const url = `${API_URL}?query=${encodeURIComponent(query)}&key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.claims && data.claims.length > 0) {
            console.log(`✅ Encontrado: ${data.claims.length} resultado(s).`);
        } else {
            console.log('⚠️ Nenhum resultado encontrado.');
        }

        res.json(data);
    } catch (error) {
        console.error('❌ Erro no servidor:', error.message);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'online', mensagem: 'Sentinela da Verdade - Proxy rodando!' });
});

app.listen(PORT, () => {
    console.log(`🛡️ Servidor proxy rodando em http://localhost:${PORT}`);
});