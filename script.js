// ================================================================
// SENTINELA DA VERDADE — script.js (v10.0 - FUNCIONAL)
// ================================================================

// =================================================================
// 0. CONFIGURAÇÕES
// =================================================================

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

var memoriaFallback = {};
var sistema = {
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
        var raw = localStorage.getItem('sentinelaDados');
        if (raw) {
            var dados = JSON.parse(raw);
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
    var blob = new Blob([JSON.stringify(sistema, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sentinela_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
}

// =================================================================
// 2. TRADUTOR (Google Translate)
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
// 4. PALAVRAS PARA ANÁLISE LOCAL
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
// 6. DOM REFERÊNCIAS
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
// 7. FUNÇÕES DE UI
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

    var total = sistema.acertos + sistema.erros;
    var taxa = total > 0 ? Math.round((sistema.acertos / total) * 100) : 0;
    if (DOM.taxaAcerto) DOM.taxaAcerto.textContent = taxa + '%';
    if (DOM.maiorSequencia) DOM.maiorSequencia.textContent = sistema.maiorSequencia;

    if (sistema.dataInicio && DOM.mediaDia) {
        var dias = Math.max(1, Math.ceil((Date.now() - sistema.dataInicio) / (1000 * 60 * 60 * 24)));
        DOM.mediaDia.textContent = Math.round(sistema.analisadas / dias);
    }

    var totalGeral = sistema.fake + sistema.verdadeiras + sistema.suspeitas;
    if (totalGeral > 0) {
        if (DOM.barFake) DOM.barFake.style.width = ((sistema.fake / totalGeral) * 100) + '%';
        if (DOM.barVerdade) DOM.barVerdade.style.width = ((sistema.verdadeiras / totalGeral) * 100) + '%';
        if (DOM.barSuspeita) DOM.barSuspeita.style.width = ((sistema.suspeitas / totalGeral) * 100) + '%';
    }
    atualizarMedalha();
}

function atualizarMedalha() {
    var m = 'Nenhuma';
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
    var item = { texto, classificacao, motivo, score, data: Date.now() };
    sistema.historicoAnalises.unshift(item);
    if (sistema.historicoAnalises.length > CONFIG.MAX_HISTORICO) {
        sistema.historicoAnalises.pop();
    }
    renderizarHistorico();
}

function renderizarHistorico() {
    var container = DOM.listaHistorico;
    if (!container) return;
    if (sistema.historicoAnalises.length === 0) {
        container.innerHTML = '<p class="vazio">Nenhuma verificação realizada ainda.</p>';
        return;
    }
    container.innerHTML = sistema.historicoAnalises.map(function(item, idx) {
        var icone = { fake: '❌', verdadeira: '✅', suspeita: '⚠️' }[item.classificacao] || '❓';
        var data = new Date(item.data).toLocaleString('pt-BR');
        var classe = item.classificacao;
        var textoCurto = item.texto.length > 60 ? item.texto.substring(0, 60) + '…' : item.texto;
        return '<div class="item-historico ' + classe + '">' +
            '<div class="h-titulo">' + icone + ' ' + classe.toUpperCase() + ' — ' + item.score + '%</div>' +
            '<div class="h-texto">' + textoCurto + '</div>' +
            '<button class="btn-ver-mais-historico" data-idx="' + idx + '">Ver mais ▼</button>' +
            '<div class="h-detalhes" id="detalhes-' + idx + '">' + item.motivo + '</div>' +
            '<div class="h-data">' + data + '</div>' +
            '</div>';
    }).join('');

    document.querySelectorAll('.btn-ver-mais-historico').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = this.dataset.idx;
            var detalhes = document.getElementById('detalhes-' + idx);
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
    var textoLower = texto.toLowerCase();
    var scoreFake = 0,
        scoreConfiavel = 0;
    var palavrasSuspeitasEncontradas = 0,
        palavrasConfiaveisEncontradas = 0;

    for (var i = 0; i < PALAVRAS_FAKE.length; i++) {
        if (textoLower.indexOf(PALAVRAS_FAKE[i].palavra) !== -1) {
            scoreFake += PALAVRAS_FAKE[i].peso;
            palavrasSuspeitasEncontradas++;
        }
    }
    for (var j = 0; j < PALAVRAS_CONFIAVEIS.length; j++) {
        if (textoLower.indexOf(PALAVRAS_CONFIAVEIS[j].palavra) !== -1) {
            scoreConfiavel += PALAVRAS_CONFIAVEIS[j].peso;
            palavrasConfiaveisEncontradas++;
        }
    }

    var fontesEncontradas = 0;
    for (var k = 0; k < DOMINIOS_CONFIAVEIS.length; k++) {
        if (textoLower.indexOf(DOMINIOS_CONFIAVEIS[k]) !== -1) {
            fontesEncontradas++;
            scoreConfiavel += 10;
        }
    }

    var tamanho = texto.length;
    var estruturaScore = 0;
    if (tamanho < 10) estruturaScore += 2;
    else if (tamanho < 30) estruturaScore += 4;
    else if (tamanho < 60) estruturaScore += 5;
    else if (tamanho > 300) estruturaScore += 3;

    var maiusculas = (texto.match(/[A-Z]/g) || []).length;
    if (tamanho > 0 && (maiusculas / tamanho) > 0.25) estruturaScore += 8;

    var exclamacoes = (texto.match(/!/g) || []).length;
    if (exclamacoes > 2) estruturaScore += 6;
    if (exclamacoes > 5) estruturaScore += 4;

    var perguntas = (texto.match(/\?/g) || []).length;
    if (perguntas > 1) estruturaScore += 3;

    var palavras = textoLower.split(/\s+/);
    var freq = {};
    for (var p = 0; p < palavras.length; p++) {
        freq[palavras[p]] = (freq[palavras[p]] || 0) + 1;
    }
    var repeticoes = 0;
    for (var key in freq) {
        if (freq[key] > 4) repeticoes++;
    }
    if (repeticoes > 0) estruturaScore += 5;

    var scoreFinal = 50;
    scoreFinal += (scoreConfiavel * 1.2) - (scoreFake * 1.0) - estruturaScore;
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
    if (BASE_CONHECIMENTO.length === 0) return { encontrou: false };
    var textoLower = texto.toLowerCase().trim();
    var palavrasUsuario = textoLower.split(/\s+/).filter(function(p) { return p.length > 3; });
    var melhorFato = null;
    var melhorPontuacao = 0;

    for (var i = 0; i < BASE_CONHECIMENTO.length; i++) {
        var fato = BASE_CONHECIMENTO[i];
        var perguntaFato = fato.pergunta.toLowerCase();
        var pontuacao = 0;
        for (var u = 0; u < palavrasUsuario.length; u++) {
            if (perguntaFato.indexOf(palavrasUsuario[u]) !== -1) {
                pontuacao++;
            }
        }
        if (pontuacao > melhorPontuacao && pontuacao >= 2) {
            melhorPontuacao = pontuacao;
            melhorFato = fato;
        }
    }

    if (melhorFato) {
        var confidence = melhorPontuacao >= 4 ? 85 : 70;
        return {
            encontrou: true,
            classificacao: melhorFato.resposta,
            explicacao: melhorFato.explicacao,
            score: confidence
        };
    }
    return { encontrou: false };
}

// ================================================================
// ANÁLISE COM IA GROQ (GRÁTIS, SEM CORS)
// ================================================================

const GROQ_API_KEY = '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';

async function analisarComIA(texto) {
    try {
        exibirResultado('🧠', 'Analisando com IA...', '#2563eb', texto, 'Processando com Groq...', 0, 'suspeita');

        const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer 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',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama3-8b-8192',
                messages: [
                    {
                        role: 'system',
                        content: 'Classifique a notícia como verdadeira, fake ou suspeita. Responda apenas com um objeto JSON: {"classificacao": "verdadeira/fake/suspeita", "score": 0-100, "explicacao": "texto em português"}'
                    },
                    {
                        role: 'user',
                        content: texto
                    }
                ],
                temperature: 0.3,
                max_tokens: 200
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            console.error('❌ Detalhes do erro da Groq:', dados);
            return { encontrou: false };
        }

        const conteudo = dados.choices[0].message.content;
        console.log('🧠 IA respondeu:', conteudo);

        let json;
        try {
            const match = conteudo.match(/\{[\s\S]*\}/);
            json = JSON.parse(match ? match[0] : conteudo);
        } catch (e) {
            const classificacao = conteudo.includes('verdade') ? 'verdadeira' :
                (conteudo.includes('fake') || conteudo.includes('falso')) ? 'fake' : 'suspeita';
            return {
                encontrou: true,
                classificacao: classificacao,
                explicacao: conteudo.substring(0, 300),
                score: 70
            };
        }

        return {
            encontrou: true,
            classificacao: json.classificacao || 'suspeita',
            explicacao: json.explicacao || 'Análise concluída.',
            score: json.score || 70
        };

    } catch (erro) {
        console.error('❌ Erro na IA:', erro.message);
        return { encontrou: false };
    }
}

        if (!resposta.ok) {
            console.warn('⚠️ Erro na API:', resposta.status);
            return { encontrou: false };
        }

        const dados = await resposta.json();
        const conteudo = dados.choices[0].message.content;
        console.log('🧠 IA respondeu:', conteudo);

        let json;
        try {
            const match = conteudo.match(/\{[\s\S]*\}/);
            json = JSON.parse(match ? match[0] : conteudo);
        } catch (e) {
            const classificacao = conteudo.includes('verdade') ? 'verdadeira' :
                (conteudo.includes('fake') || conteudo.includes('falso')) ? 'fake' : 'suspeita';
            return {
                encontrou: true,
                classificacao: classificacao,
                explicacao: conteudo.substring(0, 300),
                score: 70
            };
        }

        return {
            encontrou: true,
            classificacao: json.classificacao || 'suspeita',
            explicacao: json.explicacao || 'Análise concluída.',
            score: json.score || 70
        };

    } catch (erro) {
        console.error('❌ Erro na IA:', erro.message);
        return { encontrou: false };
    }
}

function analisarLocalComScore(texto, scoreFinal) {
    var classificacao = 'suspeita',
        icone = '⚠️',
        titulo = 'Suspeita',
        cor = '#a16207';
    if (scoreFinal >= 70) { classificacao = 'verdadeira';
        icone = '✅';
        titulo = 'Verdadeira';
        cor = '#166534'; } else if (scoreFinal <= 30) { classificacao = 'fake';
        icone = '❌';
        titulo = 'Falsa';
        cor = '#991b1b'; }

    var textoLower = texto.toLowerCase();
    var palavrasSuspeitas = [],
        palavrasConfiaveis = [];
    for (var i = 0; i < PALAVRAS_FAKE.length; i++) {
        if (textoLower.indexOf(PALAVRAS_FAKE[i].palavra) !== -1) palavrasSuspeitas.push(PALAVRAS_FAKE[i].palavra);
    }
    for (var j = 0; j < PALAVRAS_CONFIAVEIS.length; j++) {
        if (textoLower.indexOf(PALAVRAS_CONFIAVEIS[j].palavra) !== -1) palavrasConfiaveis.push(PALAVRAS_CONFIAVEIS[j].palavra);
    }

    var motivo = '';
    if (classificacao === 'fake') {
        motivo = '🔍 Palavras suspeitas: ' + (palavrasSuspeitas.slice(0, 6).join(', ') || 'nenhuma específica') + '.<br>';
        motivo += '💡 Não compartilhe! Verifique em sites oficiais.';
    } else if (classificacao === 'verdadeira') {
        motivo = '✅ Palavras confiáveis: ' + (palavrasConfiaveis.slice(0, 6).join(', ') || 'termos genéricos') + '.<br>';
        motivo += '💡 Pode confiar, mas sempre confira a data e o contexto.';
    } else {
        motivo = '🔎 Análise inconclusiva.<br>';
        if (palavrasSuspeitas.length && palavrasConfiaveis.length) {
            motivo += '⚠️ Conflito entre suspeitas (' + palavrasSuspeitas.slice(0, 4).join(', ') + ') e confiáveis (' + palavrasConfiaveis.slice(0, 4).join(', ') + ').<br>';
        } else if (palavrasSuspeitas.length) {
            motivo += '⚠️ Palavras suspeitas: ' + palavrasSuspeitas.slice(0, 5).join(', ') + '.<br>';
        } else if (palavrasConfiaveis.length) {
            motivo += 'ℹ️ Palavras confiáveis: ' + palavrasConfiaveis.slice(0, 5).join(', ') + '.<br>';
        } else {
            motivo += '📌 Nenhuma palavra-chave forte.<br>';
        }
        motivo += '💡 Pesquise em fontes oficiais antes de compartilhar.';
    }

    sistema.analisadas++;
    sistema.ultimaAnalise = Date.now();
    if (classificacao === 'fake') { sistema.fake++;
        sistema.pontos += 15; } else if (classificacao === 'verdadeira') { sistema.verdadeiras++;
        sistema.pontos += 10; } else { sistema.suspeitas++;
        sistema.pontos += 5; }

    exibirResultado(icone, titulo, cor, texto, motivo, scoreFinal, classificacao);
    adicionarAoHistorico(texto, classificacao, motivo, scoreFinal);
    atualizarDashboard();
    salvarDados();
    if (DOM.textoNoticia) DOM.textoNoticia.value = '';
}

// ================================================================
// FUNÇÃO PRINCIPAL DE ANÁLISE (IA + FALLBACK)
// ================================================================

async function analisarNoticia() {
    if (!DOM.textoNoticia) return;
    var texto = DOM.textoNoticia.value.trim();
    if (!texto) {
        exibirResultadoErro('⚠️ Digite uma informação para verificar.');
        return;
    }

    // ---- TENTAR IA DEEPSEEK ----
    var resultadoIA = await analisarComIA(texto);
    if (resultadoIA && resultadoIA.encontrou) {
        var icone = resultadoIA.classificacao === 'verdadeira' ? '✅' :
            resultadoIA.classificacao === 'fake' ? '❌' : '⚠️';
        var titulo = resultadoIA.classificacao === 'verdadeira' ? 'Verdadeira' :
            resultadoIA.classificacao === 'fake' ? 'Falsa' : 'Suspeita';
        var cor = resultadoIA.classificacao === 'verdadeira' ? '#166534' :
            resultadoIA.classificacao === 'fake' ? '#991b1b' : '#a16207';
        exibirResultado(icone, titulo, cor, texto, resultadoIA.explicacao, resultadoIA.score, resultadoIA.classificacao);
        sistema.analisadas++;
        sistema.ultimaAnalise = Date.now();
        if (resultadoIA.classificacao === 'fake') { sistema.fake++;
            sistema.pontos += 15; } else if (resultadoIA.classificacao === 'verdadeira') { sistema.verdadeiras++;
            sistema.pontos += 10; } else { sistema.suspeitas++;
            sistema.pontos += 5; }
        adicionarAoHistorico(texto, resultadoIA.classificacao, resultadoIA.explicacao, resultadoIA.score);
        atualizarDashboard();
        salvarDados();
        DOM.textoNoticia.value = '';
        return;
    }

    // ---- FATOS DE EMERGÊNCIA ----
    var fatosEmergencia = [
        { pergunta: 'vacinas causam autismo', resposta: 'fake', explicacao: '❌ Falso! Estudo fraudulento. Fonte: OMS.' },
        { pergunta: 'vacina causa autismo', resposta: 'fake', explicacao: '❌ Falso! Estudo fraudulento. Fonte: OMS.' },
        { pergunta: 'a terra é plana', resposta: 'fake', explicacao: '❌ Falso! Terra é esferoide.' },
        { pergunta: 'cloroquina cura covid', resposta: 'fake', explicacao: '❌ Falso! Estudos mostraram ineficácia.' },
        { pergunta: 'o sol é uma estrela', resposta: 'verdadeira', explicacao: '✅ Verdadeiro! Sol é uma estrela.' },
        { pergunta: 'a lua tem luz própria', resposta: 'fake', explicacao: '❌ Falso! Lua reflete luz do Sol.' }
    ];

    var textoLower = texto.toLowerCase();
    for (var f = 0; f < fatosEmergencia.length; f++) {
        var fato = fatosEmergencia[f];
        if (textoLower.indexOf(fato.pergunta) !== -1) {
            var icone2 = fato.resposta === 'verdadeira' ? '✅' : '❌';
            var titulo2 = fato.resposta === 'verdadeira' ? 'Verdadeira' : 'Falsa';
            var cor2 = fato.resposta === 'verdadeira' ? '#166534' : '#991b1b';
            exibirResultado(icone2, titulo2, cor2, texto, fato.explicacao, 95, fato.resposta);
            sistema.analisadas++;
            sistema.ultimaAnalise = Date.now();
            if (fato.resposta === 'fake') { sistema.fake++;
                sistema.pontos += 15; } else { sistema.verdadeiras++;
                sistema.pontos += 10; }
            adicionarAoHistorico(texto, fato.resposta, fato.explicacao, 95);
            atualizarDashboard();
            salvarDados();
            DOM.textoNoticia.value = '';
            return;
        }
    }

    // ---- FALLBACK BASE LOCAL ----
    var temPortugues = /[áàâãéèêíïóôõúç]/i.test(texto);
    var textoBusca = temPortugues ? await traduzirParaIngles(texto) : texto;
    var resultadoBase = verificarBaseConhecimento(textoBusca);
    if (resultadoBase.encontrou) {
        var icone3 = resultadoBase.classificacao === 'verdadeira' ? '✅' :
            resultadoBase.classificacao === 'fake' ? '❌' : '⚠️';
        var titulo3 = resultadoBase.classificacao === 'verdadeira' ? 'Verdadeira' :
            resultadoBase.classificacao === 'fake' ? 'Falsa' : 'Suspeita';
        var cor3 = resultadoBase.classificacao === 'verdadeira' ? '#166534' :
            resultadoBase.classificacao === 'fake' ? '#991b1b' : '#a16207';
        exibirResultado(icone3, titulo3, cor3, texto, resultadoBase.explicacao, resultadoBase.score, resultadoBase.classificacao);
        sistema.analisadas++;
        sistema.ultimaAnalise = Date.now();
        if (resultadoBase.classificacao === 'fake') { sistema.fake++;
            sistema.pontos += 15; } else if (resultadoBase.classificacao === 'verdadeira') { sistema.verdadeiras++;
            sistema.pontos += 10; } else { sistema.suspeitas++;
            sistema.pontos += 5; }
        adicionarAoHistorico(texto, resultadoBase.classificacao, resultadoBase.explicacao, resultadoBase.score);
        atualizarDashboard();
        salvarDados();
        DOM.textoNoticia.value = '';
        return;
    }

    // ---- FALLBACK LOCAL (palavras) ----
    var scoreLocal = calcularScoreLocal(texto);
    analisarLocalComScore(texto, scoreLocal);
}

// ================================================================
// JOGO — MISSÃO DOS SENTINELAS
// ================================================================

var perguntaAtual = null;

function novaMissao() {
    var idx = Math.floor(Math.random() * PERGUNTAS.length);
    perguntaAtual = PERGUNTAS[idx];
    if (DOM.pergunta) DOM.pergunta.textContent = perguntaAtual.texto;
    if (DOM.feedbackMissao) DOM.feedbackMissao.style.display = 'none';
}

function responderMissao(resposta) {
    if (!perguntaAtual) { alert('Clique em "Nova Missão" primeiro!'); return; }
    var acertou = resposta === perguntaAtual.resposta;
    var fb = DOM.feedbackMissao;
    if (!fb) return;
    fb.style.display = 'block';
    if (acertou) {
        sistema.acertos++;
        sistema.sequenciaAtual++;
        if (sistema.sequenciaAtual > sistema.maiorSequencia) sistema.maiorSequencia = sistema.sequenciaAtual;
        sistema.pontos += 20;
        fb.style.background = '#166534';
        fb.innerHTML = '✅ Acertou! ' + perguntaAtual.explicacao + ' +20 pontos! Sequência: ' + sistema.sequenciaAtual;
    } else {
        sistema.erros++;
        sistema.sequenciaAtual = 0;
        sistema.pontos = Math.max(0, sistema.pontos - 10);
        fb.style.background = '#991b1b';
        fb.innerHTML = '❌ Errou. A correta era "' + perguntaAtual.resposta + '". ' + perguntaAtual.explicacao + ' -10 pontos.';
    }
    atualizarMedalha();
    atualizarDashboard();
    salvarDados();
    setTimeout(novaMissao, 3000);
}

// ================================================================
// ROBÓTICA (SIMULAÇÃO)
// ================================================================

// Makey Makey
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var tecla = e.key.toLowerCase();
    var mapa = { 'a': 'btnVerdade', 's': 'btnSuspeita', 'd': 'btnFake', 'n': 'novaMissao' };
    if (mapa[tecla]) {
        var btn = document.getElementById(mapa[tecla]);
        if (btn) {
            btn.style.transform = 'scale(0.9)';
            setTimeout(function() { btn.style.transform = ''; }, 200);
        }
    }
    if (tecla === 'a') responderMissao('verdadeira');
    else if (tecla === 's') responderMissao('suspeita');
    else if (tecla === 'd') responderMissao('fake');
    else if (tecla === 'n') novaMissao();
});

// Micro:bit (simulação)
var microConectado = false;
if (DOM.conectarMicro) {
    DOM.conectarMicro.addEventListener('click', function() {
        microConectado = !microConectado;
        if (DOM.statusMicro) DOM.statusMicro.textContent = microConectado ? '🟢 Conectado (Simulação)' : '🔴 Desconectado (Simulação)';
        this.textContent = microConectado ? 'Desconectar (Simulação)' : 'Conectar (Simulação)';
    });
}

function enviarParaMicrobit(comando) {
    if (!microConectado) return;
    var mapa = { F: '🚨 FAKE', V: '✅ VERDADE', S: '⚠️ SUSPEITA' };
    if (DOM.comandoMicro) DOM.comandoMicro.textContent = 'Último comando: ' + (mapa[comando] || comando);
}

function piscarLEDs(cor) {
    var leds = document.querySelectorAll('.led');
    var classe = cor === 'vermelho' ? 'aceso' : cor === 'verde' ? 'aceso-verde' : 'aceso-amarelo';
    leds.forEach(function(l) { l.className = 'led'; });
    leds.forEach(function(l) { l.classList.add(classe); });
    setTimeout(function() { leds.forEach(function(l) { l.className = 'led'; }); }, 1500);
}

if (DOM.btnTestarMicro) {
    DOM.btnTestarMicro.addEventListener('click', function() {
        if (!microConectado) { alert('Conecte o Micro:bit primeiro!'); return; }
        piscarLEDs('verde');
        setTimeout(function() { piscarLEDs('amarelo'); }, 800);
        setTimeout(function() { piscarLEDs('vermelho'); }, 1600);
    });
}

// Sphero (simulação)
var spheroConectado = false;
var spheroX = 0,
    spheroY = 0;
if (DOM.conectarSphero) {
    DOM.conectarSphero.addEventListener('click', function() {
        spheroConectado = !spheroConectado;
        if (DOM.statusSphero) DOM.statusSphero.textContent = spheroConectado ? '🟢 Conectado (Simulação)' : '🔴 Desconectado (Simulação)';
        this.textContent = spheroConectado ? 'Desconectar (Simulação)' : 'Conectar (Simulação)';
        if (!spheroConectado) {
            spheroX = 0;
            spheroY = 0;
            var sim = document.getElementById('spheroSim');
            if (sim) sim.style.transform = 'translate(0,0)';
        }
    });
}

function moverSphero(dir) {
    if (!spheroConectado) { alert('Conecte o Sphero!'); return; }
    var passo = 25;
    if (dir === 'frente') spheroY -= passo;
    else if (dir === 'tras') spheroY += passo;
    else if (dir === 'esquerda') spheroX -= passo;
    else if (dir === 'direita') spheroX += passo;
    var sim = document.getElementById('spheroSim');
    if (sim) sim.style.transform = 'translate(' + spheroX + 'px, ' + spheroY + 'px)';
}

function mudarCorSphero(cor) {
    if (!spheroConectado) return;
    var el = document.getElementById('spheroSim');
    if (!el) return;
    el.style.background = cor;
    setTimeout(function() { if (spheroConectado) el.style.background = '#2563eb'; }, 2000);
}

// ================================================================
// EVENTOS E INICIALIZAÇÃO
// ================================================================

if (DOM.btnAnalisar) {
    DOM.btnAnalisar.addEventListener('click', analisarNoticia);
}

if (DOM.textoNoticia) {
    DOM.textoNoticia.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            analisarNoticia();
        }
    });
}

if (DOM.btnLimpar) {
    DOM.btnLimpar.addEventListener('click', function() {
        if (DOM.textoNoticia) DOM.textoNoticia.value = '';
        if (DOM.resultado) DOM.resultado.style.display = 'none';
    });
}

document.querySelectorAll('.btn-exemplo').forEach(function(btn) {
    btn.addEventListener('click', function() {
        if (DOM.textoNoticia) DOM.textoNoticia.value = this.dataset.texto;
        analisarNoticia();
    });
});

if (DOM.btnVerMais) {
    DOM.btnVerMais.addEventListener('click', function() {
        var detalhes = DOM.resultadoDetalhes;
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
if (DOM.btnVerdade) DOM.btnVerdade.addEventListener('click', function() { responderMissao('verdadeira'); });
if (DOM.btnFake) DOM.btnFake.addEventListener('click', function() { responderMissao('fake'); });
if (DOM.btnSuspeita) DOM.btnSuspeita.addEventListener('click', function() { responderMissao('suspeita'); });

if (DOM.btnLimparHistorico) {
    DOM.btnLimparHistorico.addEventListener('click', function() {
        if (sistema.historicoAnalises.length === 0) return;
        if (confirm('Limpar todo o histórico?')) {
            sistema.historicoAnalises = [];
            renderizarHistorico();
            salvarDados();
        }
    });
}

if (DOM.btnModoEscuro) {
    DOM.btnModoEscuro.addEventListener('click', function() {
        var atual = document.documentElement.getAttribute('data-tema');
        var novo = atual === 'claro' ? 'escuro' : 'claro';
        document.documentElement.setAttribute('data-tema', novo);
        localStorage.setItem('sentinelaTema', novo);
        this.textContent = novo === 'escuro' ? '🌙' : '☀️';
    });
}

if (DOM.btnExportarDados) DOM.btnExportarDados.addEventListener('click', exportarDados);
if (DOM.btnResetarDados) DOM.btnResetarDados.addEventListener('click', resetarDados);

// ---- INICIALIZAÇÃO ----
var temaSalvo = localStorage.getItem('sentinelaTema') || 'escuro';
document.documentElement.setAttribute('data-tema', temaSalvo);
if (DOM.btnModoEscuro) DOM.btnModoEscuro.textContent = temaSalvo === 'escuro' ? '🌙' : '☀️';

carregarDados();
novaMissao();
setInterval(salvarDados, CONFIG.AUTO_SAVE_INTERVAL);

console.log('🛡️ Sentinela da Verdade v10.0 carregado!');
console.log('📚 Base:', BASE_CONHECIMENTO.length, 'fatos.');
console.log('🔑 DeepSeek: ✅ Configurada');