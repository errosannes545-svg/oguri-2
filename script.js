// ================================================================
// SENTINELA DA VERDADE — script.js (v13.0 - GROQ FUNCIONAL)
// ================================================================

const CONFIG = {
    API_KEY: 'AIzaSyDXlbWtCTFQgx2UjOMRecfR6eiWV_aEhqE',
    API_URL: 'https://factchecktools.googleapis.com/v1alpha1/claims:search',
    SCORE_API_REF: 85,
    MAX_HISTORICO: 50,
    AUTO_SAVE_INTERVAL: 5000,
};

// =================================================================
// 1. PERSISTÊNCIA
// =================================================================

let memoriaFallback = {};
const sistema = {
    pontos: 0,
    medalha: 'Nenhuma',
    analisadas: 0,
    fake: 0,
    verdadeiras: 0,
    suspeitas: 0,
    acertos: 0,
    erros: 0,
    sequenciaAtual: 0,
    maiorSequencia: 0,
    historicoAnalises: [],
    ultimaAnalise: null,
    dataInicio: Date.now()
};

function salvarDados() {
    try {
        localStorage.setItem('sentinelaDados', JSON.stringify(sistema));
    } catch (e) {
        memoriaFallback = JSON.parse(JSON.stringify(sistema));
    }
}

function carregarDados() {
    try {
        const raw = localStorage.getItem('sentinelaDados');
        if (raw) {
            const dados = JSON.parse(raw);
            Object.assign(sistema, dados);
            if (!sistema.historicoAnalises) sistema.historicoAnalises = [];
        }
    } catch (e) {}
    atualizarDashboard();
    renderizarHistorico();
}

function resetarDados() {
    if (!confirm('⚠️ Tem certeza?')) return;
    localStorage.removeItem('sentinelaDados');
    location.reload();
}

function exportarDados() {
    const blob = new Blob([JSON.stringify(sistema, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sentinela_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
}

// =================================================================
// 2. TRADUTOR
// =================================================================

async function traduzirParaIngles(texto) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(texto)}`;
        const resposta = await fetch(url);
        const dados = await resposta.json();
        return dados[0][0][0] || texto;
    } catch (e) {
        return texto;
    }
}

// =================================================================
// 3. BASE DE CONHECIMENTO
// =================================================================

let BASE_CONHECIMENTO = [];
if (typeof window.BASE_CONHECIMENTO !== 'undefined' && window.BASE_CONHECIMENTO) {
    BASE_CONHECIMENTO = window.BASE_CONHECIMENTO;
    console.log('✅ Base carregada:', BASE_CONHECIMENTO.length, 'fatos.');
}

// =================================================================
// 4. PALAVRAS
// =================================================================

const PALAVRAS_FAKE = [
    { palavra: 'pix', peso: 8 }, { palavra: 'ganhe', peso: 7 }, { palavra: 'prêmio', peso: 7 },
    { palavra: 'promoção', peso: 6 }, { palavra: 'dinheiro', peso: 6 }, { palavra: 'receba', peso: 5 },
    { palavra: 'deposite', peso: 8 }, { palavra: 'compartilhe', peso: 7 }, { palavra: 'repasse', peso: 7 },
    { palavra: 'corrente', peso: 8 }, { palavra: 'urgente', peso: 6 }, { palavra: 'alerta', peso: 5 },
    { palavra: 'clique', peso: 6 }, { palavra: 'link', peso: 6 }, { palavra: 'whatsapp', peso: 5 },
    { palavra: 'milagroso', peso: 7 }, { palavra: 'cura', peso: 6 }, { palavra: 'gratuito', peso: 5 },
    { palavra: 'testemunha', peso: 5 }, { palavra: 'depoimento', peso: 4 }, { palavra: 'golpe', peso: 6 },
    { palavra: 'boato', peso: 7 }
];

const PALAVRAS_CONFIAVEIS = [
    { palavra: 'ministério', peso: 9 }, { palavra: 'prefeitura', peso: 8 }, { palavra: 'governo', peso: 8 },
    { palavra: 'universidade', peso: 8 }, { palavra: 'instituto', peso: 7 }, { palavra: 'pesquisa', peso: 7 },
    { palavra: 'estudo', peso: 7 }, { palavra: 'cientistas', peso: 8 }, { palavra: 'portal oficial', peso: 9 },
    { palavra: 'site oficial', peso: 9 }, { palavra: 'g1', peso: 8 }, { palavra: 'reuters', peso: 9 },
    { palavra: 'bbc', peso: 9 }, { palavra: 'cnn', peso: 8 }, { palavra: 'ap', peso: 8 },
    { palavra: 'comunicado', peso: 7 }, { palavra: 'nota oficial', peso: 8 }, { palavra: 'dados oficiais', peso: 8 }
];

const DOMINIOS_CONFIAVEIS = [
    'g1.globo.com', 'reuters.com', 'bbc.com', 'cnn.com',
    'ap.org', 'gov.br', 'org.br', 'edu.br',
    'agencialupa.org', 'aosfatos.org', 'boatos.org'
];

// =================================================================
// 5. PERGUNTAS DO JOGO
// =================================================================

const PERGUNTAS = [
    { texto: 'Ganhe R$1000 compartilhando esta mensagem no WhatsApp!', resposta: 'fake', explicacao: 'Corrente falsa.' },
    { texto: 'O Ministério da Saúde publicou em seu site oficial uma nova campanha.', resposta: 'verdadeira', explicacao: 'Fonte oficial.' },
    { texto: 'Recebi uma mensagem no WhatsApp dizendo que a escola vai fechar, mas não tem fonte.', resposta: 'suspeita', explicacao: 'Desconfie sem fonte.' },
    { texto: 'Clique neste link para receber um prêmio exclusivo!', resposta: 'fake', explicacao: 'Golpe de phishing.' },
    { texto: 'A prefeitura divulgou oficialmente o calendário escolar.', resposta: 'verdadeira', explicacao: 'Publicação oficial.' },
    { texto: 'Cientistas descobriram a cura para o câncer, segundo post nas redes.', resposta: 'suspeita', explicacao: 'Verifique fontes sérias.' },
    { texto: 'O governo anunciou novas medidas econômicas em coletiva.', resposta: 'verdadeira', explicacao: 'Coletiva de imprensa.' },
    { texto: 'Facebook vai doar R$1 para cada compartilhamento!', resposta: 'fake', explicacao: 'Corrente antiga.' },
    { texto: 'O INMET emitiu alerta de tempestade.', resposta: 'verdadeira', explicacao: 'INMET é órgão oficial.' },
    { texto: 'Vacinas causam autismo, segundo um estudo que circula.', resposta: 'fake', explicacao: 'Mito desmentido.' },
];

// =================================================================
// 6. DOM
// =================================================================

function getElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn('⚠️ Elemento "' + id + '" não encontrado.');
    return el;
}

const DOM = {
    textoNoticia: getElement('textoNoticia'),
    btnAnalisar: getElement('btnAnalisar'),
    btnLimpar: getElement('btnLimpar'),
    resultado: getElement('resultado'),
    resultadoIcone: getElement('resultadoIcone'),
    resultadoTitulo: getElement('resultadoTitulo'),
    resultadoScore: getElement('resultadoScore'),
    resultadoCorpo: getElement('resultadoCorpo'),
    resultadoMotivo: getElement('resultadoMotivo'),
    resultadoTexto: getElement('resultadoTexto'),
    resultadoAnaliseDetalhada: getElement('resultadoAnaliseDetalhada'),
    resultadoScoreDetalhado: getElement('resultadoScoreDetalhado'),
    btnVerMais: getElement('btnVerMais'),
    resultadoDetalhes: getElement('resultadoDetalhes'),
    pergunta: getElement('pergunta'),
    novaMissao: getElement('novaMissao'),
    btnVerdade: getElement('btnVerdade'),
    btnFake: getElement('btnFake'),
    btnSuspeita: getElement('btnSuspeita'),
    feedbackMissao: getElement('feedbackMissao'),
    pontos: getElement('pontos'),
    medalha: getElement('medalha'),
    acertos: getElement('acertos'),
    erros: getElement('erros'),
    sequencia: getElement('sequencia'),
    totalAnalises: getElement('totalAnalises'),
    totalFake: getElement('totalFake'),
    totalVerdade: getElement('totalVerdade'),
    totalSuspeita: getElement('totalSuspeita'),
    barFake: getElement('barFake'),
    barVerdade: getElement('barVerdade'),
    barSuspeita: getElement('barSuspeita'),
    taxaAcerto: getElement('taxaAcerto'),
    maiorSequencia: getElement('maiorSequencia'),
    mediaDia: getElement('mediaDia'),
    listaHistorico: getElement('listaHistorico'),
    btnLimparHistorico: getElement('btnLimparHistorico'),
    statusMicro: getElement('statusMicro'),
    comandoMicro: getElement('comandoMicro'),
    conectarMicro: getElement('conectarMicro'),
    btnTestarMicro: getElement('btnTestarMicro'),
    statusSphero: getElement('statusSphero'),
    conectarSphero: getElement('conectarSphero'),
    btnModoEscuro: getElement('btnModoEscuro'),
    btnExportarDados: getElement('btnExportarDados'),
    btnResetarDados: getElement('btnResetarDados')
};

// =================================================================
// 7. UI
// =================================================================

function atualizarDashboard() {
    if (DOM.pontos) DOM.pontos.textContent = sistema.pontos;
    if (DOM.medalha) DOM.medalha.textContent = sistema.medalha;
    if (DOM.totalAnalises) DOM.totalAnalises.textContent = sistema.analisadas;
    if (DOM.totalFake) DOM.totalFake.textContent = sistema.fake;
    if (DOM.totalVerdade) DOM.totalVerdade.textContent = sistema.verdadeiras;
    if (DOM.totalSuspeita) DOM.totalSuspeita.textContent = sistema.suspeitas;
    if (DOM.acertos) DOM.acertos.textContent = sistema.acertos;
    if (DOM.erros) DOM.erros.textContent = sistema.erros;
    if (DOM.sequencia) DOM.sequencia.textContent = sistema.sequenciaAtual;

    const total = sistema.acertos + sistema.erros;
    const taxa = total > 0 ? Math.round((sistema.acertos / total) * 100) : 0;
    if (DOM.taxaAcerto) DOM.taxaAcerto.textContent = taxa + '%';
    if (DOM.maiorSequencia) DOM.maiorSequencia.textContent = sistema.maiorSequencia;

    if (sistema.dataInicio && DOM.mediaDia) {
        const dias = Math.max(1, Math.ceil((Date.now() - sistema.dataInicio) / (1000 * 60 * 60 * 24)));
        DOM.mediaDia.textContent = Math.round(sistema.analisadas / dias);
    }

    const totalGeral = sistema.fake + sistema.verdadeiras + sistema.suspeitas;
    if (totalGeral > 0) {
        if (DOM.barFake) DOM.barFake.style.width = ((sistema.fake / totalGeral) * 100) + '%';
        if (DOM.barVerdade) DOM.barVerdade.style.width = ((sistema.verdadeiras / totalGeral) * 100) + '%';
        if (DOM.barSuspeita) DOM.barSuspeita.style.width = ((sistema.suspeitas / totalGeral) * 100) + '%';
    }
    atualizarMedalha();
}

function atualizarMedalha() {
    let m = 'Nenhuma';
    if (sistema.pontos >= 500) m = '👑 Mestre Sentinela';
    else if (sistema.pontos >= 350) m = '🥇 Ouro';
    else if (sistema.pontos >= 200) m = '🥈 Prata';
    else if (sistema.pontos >= 80) m = '🥉 Bronze';
    sistema.medalha = m;
    if (DOM.medalha) DOM.medalha.textContent = m;
}

function exibirResultado(icone, titulo, cor, texto, motivo, score, classificacao) {
    if (!DOM.resultado) return;
    DOM.resultado.style.display = 'block';
    DOM.resultado.style.borderLeftColor = cor;
    DOM.resultado.style.background = cor + '33';
    if (DOM.resultadoIcone) DOM.resultadoIcone.textContent = icone;
    if (DOM.resultadoTitulo) DOM.resultadoTitulo.textContent = titulo;
    if (DOM.resultadoScore) DOM.resultadoScore.textContent = score + '%';
    if (DOM.resultadoCorpo) DOM.resultadoCorpo.style.display = 'block';
    if (DOM.resultadoMotivo) DOM.resultadoMotivo.innerHTML = motivo;
    if (DOM.resultadoTexto) DOM.resultadoTexto.textContent = texto;
    if (DOM.resultadoAnaliseDetalhada) DOM.resultadoAnaliseDetalhada.innerHTML = motivo;
    if (DOM.resultadoScoreDetalhado) DOM.resultadoScoreDetalhado.textContent = score;
    if (DOM.resultadoDetalhes) DOM.resultadoDetalhes.style.display = 'none';
    if (DOM.btnVerMais) DOM.btnVerMais.textContent = '📖 Ver mais ▼';
}

function exibirResultadoErro(msg) {
    if (!DOM.resultado) return;
    DOM.resultado.style.display = 'block';
    DOM.resultado.style.borderLeftColor = '#b91c1c';
    DOM.resultado.style.background = '#b91c1c33';
    if (DOM.resultadoIcone) DOM.resultadoIcone.textContent = '⚠️';
    if (DOM.resultadoTitulo) DOM.resultadoTitulo.textContent = 'Erro';
    if (DOM.resultadoScore) DOM.resultadoScore.textContent = '';
    if (DOM.resultadoCorpo) DOM.resultadoCorpo.style.display = 'block';
    if (DOM.resultadoMotivo) DOM.resultadoMotivo.textContent = msg;
    if (DOM.resultadoDetalhes) DOM.resultadoDetalhes.style.display = 'none';
    if (DOM.btnVerMais) DOM.btnVerMais.style.display = 'none';
}

function adicionarAoHistorico(texto, classificacao, motivo, score) {
    const item = { texto, classificacao, motivo, score, data: Date.now() };
    sistema.historicoAnalises.unshift(item);
    if (sistema.historicoAnalises.length > CONFIG.MAX_HISTORICO) {
        sistema.historicoAnalises.pop();
    }
    renderizarHistorico();
}

function renderizarHistorico() {
    const container = DOM.listaHistorico;
    if (!container) return;
    if (sistema.historicoAnalises.length === 0) {
        container.innerHTML = '<p class="vazio">Nenhuma verificação realizada ainda.</p>';
        return;
    }
    container.innerHTML = sistema.historicoAnalises.map((item, idx) => {
        const icone = { fake: '❌', verdadeira: '✅', suspeita: '⚠️' }[item.classificacao] || '❓';
        const data = new Date(item.data).toLocaleString('pt-BR');
        const textoCurto = item.texto.length > 60 ? item.texto.substring(0, 60) + '…' : item.texto;
        return `<div class="item-historico ${item.classificacao}">
            <div class="h-titulo">${icone} ${item.classificacao.toUpperCase()} — ${item.score}%</div>
            <div class="h-texto">${textoCurto}</div>
            <button class="btn-ver-mais-historico" data-idx="${idx}">Ver mais ▼</button>
            <div class="h-detalhes" id="detalhes-${idx}" style="display:none">${item.motivo}</div>
            <div class="h-data">${data}</div>
        </div>`;
    }).join('');

    document.querySelectorAll('.btn-ver-mais-historico').forEach(btn => {
        btn.addEventListener('click', function () {
            const idx = this.dataset.idx;
            const detalhes = document.getElementById('detalhes-' + idx);
            if (detalhes.style.display === 'none') {
                detalhes.style.display = 'block';
                this.textContent = 'Ver menos ▲';
            } else {
                detalhes.style.display = 'none';
                this.textContent = 'Ver mais ▼';
            }
        });
    });
}

function calcularScoreLocal(texto) {
    const textoLower = texto.toLowerCase();
    let scoreFake = 0, scoreConfiavel = 0;
    let palavrasSuspeitasEncontradas = 0, palavrasConfiaveisEncontradas = 0;

    PALAVRAS_FAKE.forEach(p => {
        if (textoLower.includes(p.palavra)) {
            scoreFake += p.peso;
            palavrasSuspeitasEncontradas++;
        }
    });
    PALAVRAS_CONFIAVEIS.forEach(p => {
        if (textoLower.includes(p.palavra)) {
            scoreConfiavel += p.peso;
            palavrasConfiaveisEncontradas++;
        }
    });

    let fontesEncontradas = 0;
    DOMINIOS_CONFIAVEIS.forEach(d => {
        if (textoLower.includes(d)) {
            fontesEncontradas++;
            scoreConfiavel += 10;
        }
    });

    const tamanho = texto.length;
    let estruturaScore = 0;
    if (tamanho < 10) estruturaScore += 2;
    else if (tamanho < 30) estruturaScore += 4;
    else if (tamanho < 60) estruturaScore += 5;
    else if (tamanho > 300) estruturaScore += 3;

    const maiusculas = (texto.match(/[A-Z]/g) || []).length;
    if (tamanho > 0 && (maiusculas / tamanho) > 0.25) estruturaScore += 8;
    const exclamacoes = (texto.match(/!/g) || []).length;
    if (exclamacoes > 2) estruturaScore += 6;
    if (exclamacoes > 5) estruturaScore += 4;
    const perguntas = (texto.match(/\?/g) || []).length;
    if (perguntas > 1) estruturaScore += 3;

    const palavras = textoLower.split(/\s+/);
    const freq = {};
    palavras.forEach(p => freq[p] = (freq[p] || 0) + 1);
    let repeticoes = 0;
    for (const key in freq) if (freq[key] > 4) repeticoes++;
    if (repeticoes > 0) estruturaScore += 5;

    let scoreFinal = 50 + (scoreConfiavel * 1.2) - (scoreFake * 1.0) - estruturaScore;
    if (palavrasSuspeitasEncontradas > 0 && palavrasConfiaveisEncontradas === 0) scoreFinal -= 15;
    if (palavrasConfiaveisEncontradas > 0 && palavrasSuspeitasEncontradas === 0) scoreFinal += 15;
    if (fontesEncontradas > 0) scoreFinal += 10;
    if (palavrasSuspeitasEncontradas === 0 && palavrasConfiaveisEncontradas === 0 && fontesEncontradas === 0) {
        if (tamanho > 100) scoreFinal += 8;
        else if (tamanho > 50) scoreFinal += 3;
        else scoreFinal -= 3;
    }
    return Math.max(5, Math.min(100, Math.round(scoreFinal)));
}

function verificarBaseConhecimento(texto) {
    if (!BASE_CONHECIMENTO.length) return { encontrou: false };
    const textoLower = texto.toLowerCase().trim();
    const palavrasUsuario = textoLower.split(/\s+/).filter(p => p.length > 3);
    let melhorFato = null, melhorPontuacao = 0;

    BASE_CONHECIMENTO.forEach(fato => {
        const perguntaFato = fato.pergunta.toLowerCase();
        let pontuacao = 0;
        palavrasUsuario.forEach(p => {
            if (perguntaFato.includes(p)) pontuacao++;
        });
        if (pontuacao > melhorPontuacao && pontuacao >= 2) {
            melhorPontuacao = pontuacao;
            melhorFato = fato;
        }
    });

    if (melhorFato) {
        const confidence = melhorPontuacao >= 4 ? 85 : 70;
        return {
            encontrou: true,
            classificacao: melhorFato.resposta,
            explicacao: melhorFato.explicacao,
            score: confidence
        };
    }
    return { encontrou: false };
}

async function analisarComIA(texto) {
    const GROQ_API_KEY = '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';

    const modelosPreferidos = [
        'qwen/qwen3.6-27b',
        'openai/gpt-oss-20b',
        'groq/compound-mini'
    ];

    for (const modelo of modelosPreferidos) {
        try {
            exibirResultado('🧠', 'Analisando com IA...', '#2563eb', texto, `Usando ${modelo}...`, 0, 'suspeita');

            const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + GROQ_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: modelo,
                    messages: [
                        {
                            role: 'system',
                            content: 'Classifique a notícia como verdadeira, fake ou suspeita. Responda apenas com JSON: {"classificacao":"verdadeira|fake|suspeita", "score":0-100, "explicacao":"texto curto em português"}'
                        },
                        { role: 'user', content: texto }
                    ],
                    temperature: 0.2,
                    max_tokens: 200
                })
            });

            const dados = await resposta.json();
            if (!resposta.ok) {
                console.warn(`⚠️ ${modelo} falhou:`, dados.error?.message);
                continue;
            }

            const conteudo = dados.choices?.[0]?.message?.content || '';
            const jsonRegex = /\{\s*"classificacao"\s*:\s*"(verdadeira|fake|suspeita)"\s*,\s*"score"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"explicacao"\s*:\s*"([\s\S]*?)"\s*\}/i;
            const match = conteudo.match(jsonRegex);
            if (match) {
                let score = parseFloat(match[2]);
                if (score > 0 && score <= 1) score = Math.round(score * 100);
                else score = Math.round(score);
                return {
                    encontrou: true,
                    classificacao: match[1],
                    explicacao: match[3] || 'Análise concluída.',
                    score: score
                };
            }
            console.warn(`⚠️ JSON não extraído do modelo ${modelo}, tentando próximo...`);
        } catch (erro) {
            console.warn(`⚠️ Erro no ${modelo}:`, erro.message);
            continue;
        }
    }

    return { encontrou: false };
}

function analisarLocalComScore(texto, score) {
    let classificacao = 'suspeita';
    if (score < 40) classificacao = 'fake';
    else if (score >= 70) classificacao = 'verdadeira';

    const cor = classificacao === 'verdadeira' ? '#166534' : classificacao === 'fake' ? '#991b1b' : '#a16207';
    const icone = classificacao === 'verdadeira' ? '✅' : classificacao === 'fake' ? '❌' : '⚠️';
    const titulo = classificacao === 'verdadeira' ? 'Verdadeira' : classificacao === 'fake' ? 'Falsa' : 'Suspeita';
    const explicacao = `Análise local: ${score}% de confiança. ` +
        (classificacao === 'fake' ? 'Palavras suspeitas encontradas.' :
         classificacao === 'verdadeira' ? 'Fontes confiáveis detectadas.' :
         'Sem fontes claras.');

    exibirResultado(icone, titulo, cor, texto, explicacao, score, classificacao);
    sistema.analisadas++;
    sistema.ultimaAnalise = Date.now();
    if (classificacao === 'fake') { sistema.fake++; sistema.pontos += 15; }
    else if (classificacao === 'verdadeira') { sistema.verdadeiras++; sistema.pontos += 10; }
    else { sistema.suspeitas++; sistema.pontos += 5; }
    adicionarAoHistorico(texto, classificacao, explicacao, score);
    atualizarDashboard();
    salvarDados();
    DOM.textoNoticia.value = '';
    enviarParaMicrobit(classificacao === 'fake' ? 'F' : classificacao === 'verdadeira' ? 'V' : 'S');
}

async function analisarNoticia() {
    if (!DOM.textoNoticia) return;
    const texto = DOM.textoNoticia.value.trim();
    if (!texto) {
        exibirResultadoErro('⚠️ Digite uma informação para verificar.');
        return;
    }
   
    // Fatos atuais (pós-treino dos modelos)
    
const fatosAtuais = [
    { chave: 'espanha é bicampeã', resp: 'verdadeira', expl: '✅ A Espanha venceu a Copa do Mundo de 2026, tornando-se bicampeã mundial.' },
    { chave: 'espanha é bicampea', resp: 'verdadeira', expl: '✅ A Espanha venceu a Copa do Mundo de 2026, tornando-se bicampeã mundial.' },
    { chave: 'espanha venceu a copa de 2026', resp: 'verdadeira', expl: '✅ A Espanha venceu a Copa do Mundo de 2026.' },
    { chave: 'espanha ganhou a copa de 2026', resp: 'verdadeira', expl: '✅ A Espanha venceu a Copa do Mundo de 2026.' },
    { chave: 'espanha é campeã do mundo', resp: 'verdadeira', expl: '✅ A Espanha é a atual campeã mundial (2026).' },
    { chave: 'espanha é campea do mundo', resp: 'verdadeira', expl: '✅ A Espanha é a atual campeã mundial (2026).' },
    { chave: 'enchentes do rio grande do sul', resp: 'verdadeira', expl: '✅ As enchentes no Rio Grande do Sul são eventos reais, confirmados por autoridades e mídia.' },
    { chave: 'enchente no rio grande do sul', resp: 'verdadeira', expl: '✅ As enchentes no Rio Grande do Sul foram reais e amplamente documentadas.' },
    { chave: 'rio grande do sul tem enchente', resp: 'verdadeira', expl: '✅ Sim, o Rio Grande do Sul sofreu graves enchentes, confirmadas por fontes oficiais.' },
    { chave: 'enchentes no rio grande do sul sao reais', resp: 'verdadeira', expl: '✅ Sim, as enchentes no Rio Grande do Sul foram reais e causaram grandes danos.' },
    { chave: 'tem uranio nas vacinas', resp: 'fake', expl: '❌ Falso! Não há evidências científicas de urânio em vacinas.' },
    { chave: 'vacinas tem uranio', resp: 'fake', expl: '❌ Falso! Não há evidências científicas de urânio em vacinas.' },
    { chave: 'vacina tem uranio', resp: 'fake', expl: '❌ Falso! Não há evidências científicas de urânio em vacinas.' },
    { chave: 'uranio nas vacinas', resp: 'fake', expl: '❌ Falso! Não há evidências científicas de urânio em vacinas.' }
];

for (const fato of fatosAtuais) {
    if (texto.toLowerCase().includes(fato.chave)) {
        const iconeFato = fato.resp === 'verdadeira' ? '✅' : '❌';
        const tituloFato = fato.resp === 'verdadeira' ? 'Verdadeira' : 'Falsa';
        const corFato = fato.resp === 'verdadeira' ? '#166534' : '#991b1b';
        exibirResultado(iconeFato, tituloFato, corFato, texto, fato.expl, 98, fato.resp);
        sistema.analisadas++;
        sistema.ultimaAnalise = Date.now();
        if (fato.resp === 'fake') {
            sistema.fake++;
            sistema.pontos += 15;
        } else {
            sistema.verdadeiras++;
            sistema.pontos += 10;
        }
        adicionarAoHistorico(texto, fato.resp, fato.expl, 98);
        atualizarDashboard();
        salvarDados();
        DOM.textoNoticia.value = '';
        enviarParaMicrobit(fato.resp === 'fake' ? 'F' : 'V');
        return;
    }
}

    // 1. Tentar IA
    const resultadoIA = await analisarComIA(texto);
    if (resultadoIA.encontrou) {
        const icone = resultadoIA.classificacao === 'verdadeira' ? '✅' : resultadoIA.classificacao === 'fake' ? '❌' : '⚠️';
        const titulo = resultadoIA.classificacao === 'verdadeira' ? 'Verdadeira' : resultadoIA.classificacao === 'fake' ? 'Falsa' : 'Suspeita';
        const cor = resultadoIA.classificacao === 'verdadeira' ? '#166534' : resultadoIA.classificacao === 'fake' ? '#991b1b' : '#a16207';
        exibirResultado(icone, titulo, cor, texto, resultadoIA.explicacao, resultadoIA.score, resultadoIA.classificacao);
        sistema.analisadas++;
        sistema.ultimaAnalise = Date.now();
        if (resultadoIA.classificacao === 'fake') { sistema.fake++; sistema.pontos += 15; }
        else if (resultadoIA.classificacao === 'verdadeira') { sistema.verdadeiras++; sistema.pontos += 10; }
        else { sistema.suspeitas++; sistema.pontos += 5; }
        adicionarAoHistorico(texto, resultadoIA.classificacao, resultadoIA.explicacao, resultadoIA.score);
        atualizarDashboard();
        salvarDados();
        DOM.textoNoticia.value = '';
        enviarParaMicrobit(resultadoIA.classificacao === 'fake' ? 'F' : resultadoIA.classificacao === 'verdadeira' ? 'V' : 'S');
        return;
    }

    // 2. Fatos de emergência
    const fatosEmergencia = [
        { pergunta: 'vacinas causam autismo', resposta: 'fake', explicacao: '❌ Falso! Estudo fraudulento. Fonte: OMS.' },
        { pergunta: 'vacina causa autismo', resposta: 'fake', explicacao: '❌ Falso! Estudo fraudulento. Fonte: OMS.' },
        { pergunta: 'a terra é plana', resposta: 'fake', explicacao: '❌ Falso! Terra é esferoide.' },
        { pergunta: 'cloroquina cura covid', resposta: 'fake', explicacao: '❌ Falso! Estudos mostraram ineficácia.' },
        { pergunta: 'o sol é uma estrela', resposta: 'verdadeira', explicacao: '✅ Verdadeiro! Sol é uma estrela.' },
        { pergunta: 'a lua tem luz própria', resposta: 'fake', explicacao: '❌ Falso! Lua reflete luz do Sol.' }
    ];
    const textoLower = texto.toLowerCase();
    for (const fato of fatosEmergencia) {
        if (textoLower.includes(fato.pergunta)) {
            exibirResultado('✅', fato.resposta === 'verdadeira' ? 'Verdadeira' : 'Falsa', fato.resposta === 'verdadeira' ? '#166534' : '#991b1b', texto, fato.explicacao, 95, fato.resposta);
            sistema.analisadas++;
            sistema.ultimaAnalise = Date.now();
            if (fato.resposta === 'fake') { sistema.fake++; sistema.pontos += 15; }
            else { sistema.verdadeiras++; sistema.pontos += 10; }
            adicionarAoHistorico(texto, fato.resposta, fato.explicacao, 95);
            atualizarDashboard();
            salvarDados();
            DOM.textoNoticia.value = '';
            enviarParaMicrobit(fato.resposta === 'fake' ? 'F' : 'V');
            return;
        }
    }

    // 3. Base local
    const temPortugues = /[áàâãéèêíïóôõúç]/i.test(texto);
    const textoBusca = temPortugues ? await traduzirParaIngles(texto) : texto;
    const resultadoBase = verificarBaseConhecimento(textoBusca);
    if (resultadoBase.encontrou) {
        exibirResultado(
            resultadoBase.classificacao === 'verdadeira' ? '✅' : resultadoBase.classificacao === 'fake' ? '❌' : '⚠️',
            resultadoBase.classificacao === 'verdadeira' ? 'Verdadeira' : resultadoBase.classificacao === 'fake' ? 'Falsa' : 'Suspeita',
            resultadoBase.classificacao === 'verdadeira' ? '#166534' : resultadoBase.classificacao === 'fake' ? '#991b1b' : '#a16207',
            texto, resultadoBase.explicacao, resultadoBase.score, resultadoBase.classificacao
        );
        sistema.analisadas++;
        sistema.ultimaAnalise = Date.now();
        if (resultadoBase.classificacao === 'fake') { sistema.fake++; sistema.pontos += 15; }
        else if (resultadoBase.classificacao === 'verdadeira') { sistema.verdadeiras++; sistema.pontos += 10; }
        else { sistema.suspeitas++; sistema.pontos += 5; }
        adicionarAoHistorico(texto, resultadoBase.classificacao, resultadoBase.explicacao, resultadoBase.score);
        atualizarDashboard();
        salvarDados();
        DOM.textoNoticia.value = '';
        enviarParaMicrobit(resultadoBase.classificacao === 'fake' ? 'F' : resultadoBase.classificacao === 'verdadeira' ? 'V' : 'S');
        return;
    }

    // 4. Fallback local
    const scoreLocal = calcularScoreLocal(texto);
    analisarLocalComScore(texto, scoreLocal);
}

// ================================================================
// JOGO
// ================================================================

let perguntaAtual = null;

function novaMissao() {
    const idx = Math.floor(Math.random() * PERGUNTAS.length);
    perguntaAtual = PERGUNTAS[idx];
    if (DOM.pergunta) DOM.pergunta.textContent = perguntaAtual.texto;
    if (DOM.feedbackMissao) DOM.feedbackMissao.style.display = 'none';
}

function responderMissao(resposta) {
    if (!perguntaAtual) { alert('Clique em "Nova Missão" primeiro!'); return; }
    const acertou = resposta === perguntaAtual.resposta;
    const fb = DOM.feedbackMissao;
    if (!fb) return;
    fb.style.display = 'block';
    if (acertou) {
        sistema.acertos++;
        sistema.sequenciaAtual++;
        if (sistema.sequenciaAtual > sistema.maiorSequencia) sistema.maiorSequencia = sistema.sequenciaAtual;
        sistema.pontos += 20;
        fb.style.background = '#166534';
        fb.innerHTML = `✅ Acertou! ${perguntaAtual.explicacao} +20 pontos! Sequência: ${sistema.sequenciaAtual}`;
    } else {
        sistema.erros++;
        sistema.sequenciaAtual = 0;
        sistema.pontos = Math.max(0, sistema.pontos - 10);
        fb.style.background = '#991b1b';
        fb.innerHTML = `❌ Errou. A correta era "${perguntaAtual.resposta}". ${perguntaAtual.explicacao} -10 pontos.`;
    }
    atualizarMedalha();
    atualizarDashboard();
    salvarDados();
    setTimeout(novaMissao, 3000);
}

// ================================================================
// ROBÓTICA REAL
// ================================================================

// --- Makey Makey (teclado real) ---
document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const tecla = e.key.toLowerCase();
    const mapa = { 'a': 'btnVerdade', 's': 'btnSuspeita', 'd': 'btnFake', 'n': 'novaMissao' };
    if (mapa[tecla]) {
        const btn = document.getElementById(mapa[tecla]);
        if (btn) {
            btn.style.transform = 'scale(0.9)';
            setTimeout(() => btn.style.transform = '', 200);
        }
    }
    if (tecla === 'a') responderMissao('verdadeira');
    else if (tecla === 's') responderMissao('suspeita');
    else if (tecla === 'd') responderMissao('fake');
    else if (tecla === 'n') novaMissao();
});

// --- Micro:bit Real (Web Bluetooth) ---
let microCaracteristica = null;
let microConectado = false;

async function conectarMicrobitReal() {
    if (!navigator.bluetooth) {
        alert('❌ Web Bluetooth não suportado neste navegador. Use Chrome/Edge.');
        return;
    }
    try {
        const dispositivo = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'BBC micro:bit' }],
            optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'] // UART Service
        });
        const servidor = await dispositivo.gatt.connect();
        const servico = await servidor.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
        microCaracteristica = await servico.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e'); // TX
        microConectado = true;
        if (DOM.statusMicro) DOM.statusMicro.textContent = '🟢 Micro:bit conectado (real)';
        if (DOM.conectarMicro) DOM.conectarMicro.textContent = 'Desconectar Micro:bit';
        console.log('✅ Micro:bit conectado!');
    } catch (erro) {
        console.error('❌ Falha ao conectar Micro:bit:', erro);
        alert('Não foi possível conectar ao Micro:bit.');
    }
}

function enviarParaMicrobit(comando) {
    if (!microConectado || !microCaracteristica) return;
    const texto = comando === 'F' ? 'FAKE\n' : comando === 'V' ? 'VERDADE\n' : 'SUSPEITA\n';
    const encoder = new TextEncoder();
    microCaracteristica.writeValue(encoder.encode(texto)).catch(erro => console.error('Erro enviando Micro:bit:', erro));
    if (DOM.comandoMicro) DOM.comandoMicro.textContent = 'Último comando: ' + (comando === 'F' ? '🚨 FAKE' : comando === 'V' ? '✅ VERDADE' : '⚠️ SUSPEITA');
}

if (DOM.conectarMicro) {
    DOM.conectarMicro.addEventListener('click', function () {
        if (microConectado) {
            microConectado = false;
            microCaracteristica = null;
            if (DOM.statusMicro) DOM.statusMicro.textContent = '🔴 Desconectado';
            this.textContent = 'Conectar Micro:bit real';
        } else {
            conectarMicrobitReal();
        }
    });
}

// --- Sphero (simulação) ---
let spheroConectado = false;
let spheroX = 0, spheroY = 0;
if (DOM.conectarSphero) {
    DOM.conectarSphero.addEventListener('click', function () {
        spheroConectado = !spheroConectado;
        if (DOM.statusSphero) DOM.statusSphero.textContent = spheroConectado ? '🟢 Conectado (Simulação)' : '🔴 Desconectado';
        this.textContent = spheroConectado ? 'Desconectar Sphero' : 'Conectar Sphero';
        if (!spheroConectado) {
            spheroX = 0;
            spheroY = 0;
            const sim = document.getElementById('spheroSim');
            if (sim) sim.style.transform = 'translate(0,0)';
        }
    });
}

function moverSphero(dir) {
    if (!spheroConectado) { alert('Conecte o Sphero!'); return; }
    const passo = 25;
    if (dir === 'frente') spheroY -= passo;
    else if (dir === 'tras') spheroY += passo;
    else if (dir === 'esquerda') spheroX -= passo;
    else if (dir === 'direita') spheroX += passo;
    const sim = document.getElementById('spheroSim');
    if (sim) sim.style.transform = 'translate(' + spheroX + 'px, ' + spheroY + 'px)';
}

function mudarCorSphero(cor) {
    if (!spheroConectado) return;
    const el = document.getElementById('spheroSim');
    if (!el) return;
    el.style.background = cor;
    setTimeout(() => { if (spheroConectado) el.style.background = '#2563eb'; }, 2000);
}

// ================================================================
// EVENTOS E INICIALIZAÇÃO
// ================================================================

if (DOM.btnAnalisar) DOM.btnAnalisar.addEventListener('click', analisarNoticia);
if (DOM.textoNoticia) {
    DOM.textoNoticia.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            analisarNoticia();
        }
    });
}
if (DOM.btnLimpar) {
    DOM.btnLimpar.addEventListener('click', () => {
        if (DOM.textoNoticia) DOM.textoNoticia.value = '';
        if (DOM.resultado) DOM.resultado.style.display = 'none';
    });
}

document.querySelectorAll('.btn-exemplo').forEach(btn => {
    btn.addEventListener('click', function () {
        if (DOM.textoNoticia) DOM.textoNoticia.value = this.dataset.texto;
        analisarNoticia();
    });
});

if (DOM.btnVerMais) {
    DOM.btnVerMais.addEventListener('click', function () {
        const detalhes = DOM.resultadoDetalhes;
        if (!detalhes) return;
        if (detalhes.style.display === 'none') {
            detalhes.style.display = 'block';
            this.textContent = '📖 Ver menos ▲';
        } else {
            detalhes.style.display = 'none';
            this.textContent = '📖 Ver mais ▼';
        }
    });
}

if (DOM.novaMissao) DOM.novaMissao.addEventListener('click', novaMissao);
if (DOM.btnVerdade) DOM.btnVerdade.addEventListener('click', () => responderMissao('verdadeira'));
if (DOM.btnFake) DOM.btnFake.addEventListener('click', () => responderMissao('fake'));
if (DOM.btnSuspeita) DOM.btnSuspeita.addEventListener('click', () => responderMissao('suspeita'));

if (DOM.btnLimparHistorico) {
    DOM.btnLimparHistorico.addEventListener('click', () => {
        if (!sistema.historicoAnalises.length) return;
        if (confirm('Limpar todo o histórico?')) {
            sistema.historicoAnalises = [];
            renderizarHistorico();
            salvarDados();
        }
    });
}

if (DOM.btnModoEscuro) {
    DOM.btnModoEscuro.addEventListener('click', function () {
        const atual = document.documentElement.getAttribute('data-tema');
        const novo = atual === 'claro' ? 'escuro' : 'claro';
        document.documentElement.setAttribute('data-tema', novo);
        localStorage.setItem('sentinelaTema', novo);
        this.textContent = novo === 'escuro' ? '🌙' : '☀️';
    });
}

if (DOM.btnExportarDados) DOM.btnExportarDados.addEventListener('click', exportarDados);
if (DOM.btnResetarDados) DOM.btnResetarDados.addEventListener('click', resetarDados);

// Inicialização
const temaSalvo = localStorage.getItem('sentinelaTema') || 'escuro';
document.documentElement.setAttribute('data-tema', temaSalvo);
if (DOM.btnModoEscuro) DOM.btnModoEscuro.textContent = temaSalvo === 'escuro' ? '🌙' : '☀️';

carregarDados();
novaMissao();
setInterval(salvarDados, CONFIG.AUTO_SAVE_INTERVAL);

console.log('🛡️ Sentinela da Verdade v13.0 carregado!');
console.log('📚 Base:', BASE_CONHECIMENTO.length, 'fatos.');
console.log('🔑 IA Groq: ✅ Configurada');