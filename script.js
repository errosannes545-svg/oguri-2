
/* ================================================================
   SENTINELA DA VERDADE — script.js (v9.0 - CORRIGIDO)
   Motor principal com busca inteligente na base de conhecimento
   ================================================================ */

/// =================================================================
// 0. CONFIGURAÇÕES
// =================================================================

// =================================================================
// 0.5. PERSISTÊNCIA (DEFINIDA ANTES DE SER USADA)
// =================================================================

var memoriaFallback = {};

function salvarDados() {
    try {
        localStorage.setItem('sentinelaDados', JSON.stringify(sistema));
    } catch (e) {
        console.warn('⚠️ localStorage indisponível. Salvando em memória.');
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
            renderizarHistorico();
            atualizarDashboard();
            return;
        }
    } catch (e) {
        console.warn('⚠️ localStorage indisponível. Usando fallback em memória.');
    }
    if (Object.keys(memoriaFallback).length > 0) {
        Object.assign(sistema, memoriaFallback);
        renderizarHistorico();
        atualizarDashboard();
    }
}

function resetarDados() {
    if (!confirm('⚠️ Tem certeza? Todos os dados serão perdidos!')) return;
    if (!confirm('Última chance!')) return;
    try {
        localStorage.removeItem('sentinelaDados');
    } catch(e) {}
    memoriaFallback = {};
    location.reload();
}

function exportarDados() {
    var blob = new Blob([JSON.stringify(sistema, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sentinela_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
}

const CONFIG = {
    API_KEY: 'AIzaSyDXlbWtCTFQgx2UjOMRecfR6eiWV_aEhqE',
    API_URL: 'https://factchecktools.googleapis.com/v1alpha1/claims:search',
    SCORE_API_REF: 85,
    MAX_HISTORICO: 50,
    AUTO_SAVE_INTERVAL: 5000,
};

// ================================================================
// TRADUTOR (usa Google Translate - gratuito, sem CORS)
// ================================================================

async function traduzirParaIngles(texto) {
    try {
        // Usa a API do Google Translate (não tem bloqueio CORS)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(texto)}`;
        const resposta = await fetch(url);
        const dados = await resposta.json();
        if (dados && dados[0] && dados[0][0]) {
            return dados[0][0][0];
        }
        console.warn('⚠️ Tradução falhou. Usando texto original.');
        return texto;
    } catch (erro) {
        console.warn('⚠️ Erro na tradução:', erro.message);
        return texto;
    }
}

// =================================================================
// 1. CARREGAR BASE DE CONHECIMENTO
// =================================================================

let BASE_CONHECIMENTO = [];

// Carrega a base diretamente do window (arquivo conhecimento.js)
if (typeof window.BASE_CONHECIMENTO !== 'undefined' && window.BASE_CONHECIMENTO) {
    BASE_CONHECIMENTO = window.BASE_CONHECIMENTO;
    console.log('✅ Base carregada do window:', BASE_CONHECIMENTO.length, 'fatos.');
} else {
    console.warn('⚠️ Base não encontrada no window. O arquivo conhecimento.js pode não ter carregado.');
    // Tenta carregar do Drive apenas como último recurso, mas com CORS ignorado
    try {
        fetch('https://drive.google.com/uc?export=download&id=16VscIwXmnHt8uesA1ccfDaKAPRZHA1us', { mode: 'no-cors' })
            .then(() => console.warn('⚠️ Drive com no-cors não retorna dados. Use a base local.'))
            .catch(() => console.warn('⚠️ Drive inacessível. Usando base local.'));
    } catch (e) {}
}

// =================================================================
// 2. PALAVRAS PARA ANÁLISE LOCAL (FALLBACK)
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
// 3. PERGUNTAS DO JOGO
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
// 4. ESTADO DO SISTEMA
// =================================================================

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

// =================================================================
// 5. REFERÊNCIAS DOM (com verificação)
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
// 6. FUNÇÕES DE ATUALIZAÇÃO
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

// =================================================================
// 7. EXIBIÇÃO DE RESULTADO
// =================================================================

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
    if (DOM.btnVerMais) {
        DOM.btnVerMais.textContent = '📖 Ver mais ▼';
        DOM.btnVerMais.style.display = 'inline-block';
    }
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

// =================================================================
// 8. HISTÓRICO
// =================================================================

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

// =================================================================
// 9. CÁLCULO DO SCORE LOCAL (FALLBACK)
// =================================================================

function calcularScoreLocal(texto) {
    var textoLower = texto.toLowerCase();
    var scoreFake = 0, scoreConfiavel = 0;
    var palavrasSuspeitasEncontradas = 0, palavrasConfiaveisEncontradas = 0;

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

// =================================================================
// 10. BUSCA INTELIGENTE NA BASE DE CONHECIMENTO
// =================================================================

function verificarBaseConhecimento(texto) {
    if (BASE_CONHECIMENTO.length === 0) return { encontrou: false };

    const textoLower = texto.toLowerCase().trim();
    const palavrasUsuario = textoLower.split(/\s+/).filter(p => p.length > 2);

    // ----- PASSO 1: CORRESPONDÊNCIA EXATA (prioridade máxima) -----
    for (const fato of BASE_CONHECIMENTO) {
        const perguntaFato = fato.pergunta.toLowerCase();
        if (textoLower.includes(perguntaFato)) {
            const palavrasFato = perguntaFato.split(/\s+/);
            if (palavrasFato.length >= 3 || textoLower === perguntaFato) {
                return {
                    encontrou: true,
                    classificacao: fato.resposta,
                    explicacao: fato.explicacao,
                    score: 95,
                };
            }
        }
    }

    // ----- PASSO 2: BUSCA POR PALAVRAS-CHAVE (mais tolerante) -----
    let melhorFato = null;
    let melhorPontuacao = 0;

    for (const fato of BASE_CONHECIMENTO) {
        const perguntaFato = fato.pergunta.toLowerCase();
        let pontuacao = 0;

        // Conta quantas palavras significativas do usuário aparecem no fato
        for (const pUser of palavrasUsuario) {
            if (perguntaFato.includes(pUser) || pUser.includes(perguntaFato)) {
                pontuacao++;
                continue;
            }
            // Tenta cada palavra do fato
            const palavrasFato = perguntaFato.split(/\s+/);
            for (const pFato of palavrasFato) {
                if (pFato.length > 2 && (pUser === pFato || pUser.includes(pFato) || pFato.includes(pUser))) {
                    pontuacao++;
                    break;
                }
            }
        }

        // Exige apenas 1 palavra coincidente e proporção de 30%
        const proporcao = palavrasUsuario.length > 0 ? pontuacao / palavrasUsuario.length : 0;
        if (proporcao >= 0.3 && pontuacao > melhorPontuacao) {
            melhorPontuacao = pontuacao;
            melhorFato = fato;
        }
    }

    if (melhorFato) {
        const confidence = melhorPontuacao >= 3 ? 85 : 70;
        return {
            encontrou: true,
            classificacao: melhorFato.resposta,
            explicacao: melhorFato.explicacao,
            score: confidence,
        };
    }

    return { encontrou: false };
}
    

// =================================================================
// 11. CONSULTA À API DO GOOGLE FACT CHECK (DIRETO, SEM PROXY)
// =================================================================

async function verificarComGoogleFactCheck(texto) {
    try {
        const query = encodeURIComponent(texto);
        const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${query}&key=${CONFIG.API_KEY}`;
        
        const resposta = await fetch(url);
        if (!resposta.ok) {
            console.warn('⚠️ API do Google retornou erro:', resposta.status);
            return { encontrou: false };
        }

        const dados = await resposta.json();

        if (dados.claims && dados.claims.length > 0) {
            const primeiro = dados.claims[0];
            const review = primeiro.claimReview[0];
            const textoRating = (review.textualRating || '').toLowerCase();

            let classificacao = 'suspeita';
            let scoreBase = 50;

            // Verifica palavras-chave de classificação (multilíngue)
            if (textoRating.includes('falso') || textoRating.includes('false') || 
                textoRating.includes('fałsz') || textoRating.includes('errado')) {
                classificacao = 'fake';
                scoreBase = 15;
            } else if (textoRating.includes('verdade') || textoRating.includes('true') || 
                       textoRating.includes('prawda') || textoRating.includes('correto')) {
                classificacao = 'verdadeira';
                scoreBase = 90;
            } else if (textoRating.includes('parcial') || textoRating.includes('parcialmente')) {
                classificacao = 'suspeita';
                scoreBase = 50;
            } else if (textoRating.includes('enganoso') || textoRating.includes('manipulação')) {
                classificacao = 'suspeita';
                scoreBase = 40;
            }

            const explicacao = review.review || 'Verificação disponível.';
            const fonte = review.publisher?.name || 'Fonte não identificada';

            return {
                encontrou: true,
                classificacao: classificacao,
                explicacao: `${explicacao} (Fonte: ${fonte})`,
                scoreReferencia: scoreBase,
            };
        }
        return { encontrou: false };
    } catch (erro) {
        console.warn('⚠️ Erro na API:', erro.message);
        return { encontrou: false };
    }
}

// =================================================================
// 12. ANÁLISE LOCAL (FALLBACK)
// =================================================================

function analisarLocalComScore(texto, scoreFinal) {
    var classificacao = 'suspeita';
    var icone = '⚠️';
    var titulo = 'Suspeita';
    var cor = '#a16207';
    if (scoreFinal >= 70) {
        classificacao = 'verdadeira';
        icone = '✅';
        titulo = 'Verdadeira';
        cor = '#166534';
    } else if (scoreFinal <= 30) {
        classificacao = 'fake';
        icone = '❌';
        titulo = 'Falsa';
        cor = '#991b1b';
    }

    var textoLower = texto.toLowerCase();
    var palavrasSuspeitas = [];
    var palavrasConfiaveis = [];
    for (var i = 0; i < PALAVRAS_FAKE.length; i++) {
        if (textoLower.indexOf(PALAVRAS_FAKE[i].palavra) !== -1) {
            palavrasSuspeitas.push(PALAVRAS_FAKE[i].palavra);
        }
    }
    for (var j = 0; j < PALAVRAS_CONFIAVEIS.length; j++) {
        if (textoLower.indexOf(PALAVRAS_CONFIAVEIS[j].palavra) !== -1) {
            palavrasConfiaveis.push(PALAVRAS_CONFIAVEIS[j].palavra);
        }
    }

    var motivo = '';
    if (classificacao === 'fake') {
        motivo = '🔍 Palavras suspeitas: ' + (palavrasSuspeitas.slice(0,6).join(', ') || 'nenhuma específica') + '.<br>';
        motivo += '💡 Não compartilhe! Verifique em sites oficiais.';
    } else if (classificacao === 'verdadeira') {
        motivo = '✅ Palavras confiáveis: ' + (palavrasConfiaveis.slice(0,6).join(', ') || 'termos genéricos') + '.<br>';
        motivo += '💡 Pode confiar, mas sempre confira a data e o contexto.';
    } else {
        motivo = '🔎 Análise inconclusiva.<br>';
        if (palavrasSuspeitas.length && palavrasConfiaveis.length) {
            motivo += '⚠️ Conflito entre suspeitas (' + palavrasSuspeitas.slice(0,4).join(', ') + ') e confiáveis (' + palavrasConfiaveis.slice(0,4).join(', ') + ').<br>';
        } else if (palavrasSuspeitas.length) {
            motivo += '⚠️ Palavras suspeitas: ' + palavrasSuspeitas.slice(0,5).join(', ') + '.<br>';
        } else if (palavrasConfiaveis.length) {
            motivo += 'ℹ️ Palavras confiáveis: ' + palavrasConfiaveis.slice(0,5).join(', ') + '.<br>';
        } else {
            motivo += '📌 Nenhuma palavra-chave forte.<br>';
        }
        motivo += '💡 Pesquise em fontes oficiais antes de compartilhar.';
    }

    sistema.analisadas++;
    sistema.ultimaAnalise = Date.now();
    if (classificacao === 'fake') { sistema.fake++; sistema.pontos += 15; }
    else if (classificacao === 'verdadeira') { sistema.verdadeiras++; sistema.pontos += 10; }
    else { sistema.suspeitas++; sistema.pontos += 5; }

    exibirResultado(icone, titulo, cor, texto, motivo, scoreFinal, classificacao);
    adicionarAoHistorico(texto, classificacao, motivo, scoreFinal);

    if (classificacao === 'fake') { enviarParaMicrobit('F'); mudarCorSphero('#dc2626'); piscarLEDs('vermelho'); }
    else if (classificacao === 'verdadeira') { enviarParaMicrobit('V'); mudarCorSphero('#16a34a'); piscarLEDs('verde'); }
    else { enviarParaMicrobit('S'); mudarCorSphero('#eab308'); piscarLEDs('amarelo'); }

    atualizarDashboard();
    salvarDados();
    if (DOM.textoNoticia) DOM.textoNoticia.value = '';
}

// =================================================================
// 13. FUNÇÃO PRINCIPAL DE ANÁLISE
// =================================================================

// =================================================================
// 13. FUNÇÃO PRINCIPAL DE ANÁLISE (COM TRADUÇÃO)
// =================================================================

async function analisarNoticia() {
    if (!DOM.textoNoticia) return;
    let texto = DOM.textoNoticia.value.trim();
    if (!texto) {
        exibirResultadoErro('⚠️ Digite uma informação para verificar.');
        return;
    }

    // ---- DETECTA SE É PORTUGUÊS (tem acentos ou ç) ----
    const temPortugues = /[áàâãéèêíïóôõúç]/i.test(texto);
    let textoBusca = texto;
    let textoExibicao = texto;

    if (temPortugues) {
        // Mostra "Traduzindo..." para o usuário
        exibirResultado('⏳', 'Traduzindo...', '#2563eb', texto, 'Convertendo para inglês...', 0, 'suspeita');
        
        try {
            textoBusca = await traduzirParaIngles(texto);
            console.log(`🔄 Traduzido: "${texto}" → "${textoBusca}"`);
            textoExibicao = texto; // Mantém o texto original para exibição
        } catch (e) {
            console.warn('⚠️ Tradução falhou, usando texto original.');
            textoBusca = texto;
            textoExibicao = texto;
        }
    } else {
        textoBusca = texto;
        textoExibicao = texto;
    }

    // ---- PASSO 1: BUSCAR NA BASE DE CONHECIMENTO (usando textoBusca) ----
    const resultadoBase = verificarBaseConhecimento(textoBusca);
    if (resultadoBase.encontrou) {
        const icone = resultadoBase.classificacao === 'verdadeira' ? '✅' :
                      resultadoBase.classificacao === 'fake' ? '❌' : '⚠️';
        const titulo = resultadoBase.classificacao === 'verdadeira' ? 'Verdadeira' :
                       resultadoBase.classificacao === 'fake' ? 'Falsa' : 'Suspeita';
        const cor = resultadoBase.classificacao === 'verdadeira' ? '#166534' :
                    resultadoBase.classificacao === 'fake' ? '#991b1b' : '#a16207';

        // Exibe com o texto original (textoExibicao) e a explicação em inglês (ou traduzida)
        exibirResultado(icone, titulo, cor, textoExibicao, resultadoBase.explicacao, resultadoBase.score, resultadoBase.classificacao);
        sistema.analisadas++;
        sistema.ultimaAnalise = Date.now();
        if (resultadoBase.classificacao === 'fake') { sistema.fake++; sistema.pontos += 15; }
        else if (resultadoBase.classificacao === 'verdadeira') { sistema.verdadeiras++; sistema.pontos += 10; }
        else { sistema.suspeitas++; sistema.pontos += 5; }
        adicionarAoHistorico(textoExibicao, resultadoBase.classificacao, resultadoBase.explicacao, resultadoBase.score);
        atualizarDashboard();
        salvarDados();
        if (DOM.textoNoticia) DOM.textoNoticia.value = '';
        return;
    }

    // ---- PASSO 2: MOSTRAR "PESQUISANDO..." ----
    exibirResultado('⏳', 'Pesquisando...', '#2563eb', textoExibicao, 'Buscando em fontes confiáveis...', 0, 'suspeita');

    // ---- PASSO 3: TENTAR API DO GOOGLE (usando textoBusca) ----
    const scoreLocal = calcularScoreLocal(textoBusca);
    const resultadoAPI = await verificarComGoogleFactCheck(textoBusca);

    if (resultadoAPI && resultadoAPI.encontrou) {
        const scoreAPI = resultadoAPI.scoreReferencia || CONFIG.SCORE_API_REF;
        const scoreFinal = Math.round((scoreAPI * 0.7) + (scoreLocal * 0.3));
        const icone2 = resultadoAPI.classificacao === 'verdadeira' ? '✅' :
                       resultadoAPI.classificacao === 'fake' ? '❌' : '⚠️';
        const titulo2 = resultadoAPI.classificacao === 'verdadeira' ? 'Verdadeira' :
                        resultadoAPI.classificacao === 'fake' ? 'Falsa' : 'Suspeita';
        const cor2 = resultadoAPI.classificacao === 'verdadeira' ? '#166534' :
                     resultadoAPI.classificacao === 'fake' ? '#991b1b' : '#a16207';
        exibirResultado(icone2, titulo2, cor2, textoExibicao, resultadoAPI.explicacao, scoreFinal, resultadoAPI.classificacao);
        sistema.analisadas++;
        sistema.ultimaAnalise = Date.now();
        if (resultadoAPI.classificacao === 'fake') { sistema.fake++; sistema.pontos += 15; }
        else if (resultadoAPI.classificacao === 'verdadeira') { sistema.verdadeiras++; sistema.pontos += 10; }
        else { sistema.suspeitas++; sistema.pontos += 5; }
        adicionarAoHistorico(textoExibicao, resultadoAPI.classificacao, resultadoAPI.explicacao, scoreFinal);
        atualizarDashboard();
        salvarDados();
        if (DOM.textoNoticia) DOM.textoNoticia.value = '';
        return;
    }

    // ---- PASSO 4: FALLBACK LOCAL (usando textoBusca) ----
    console.log('⚠️ API não retornou. Usando fallback local.');
    analisarLocalComScore(textoBusca, scoreLocal);
}
// =================================================================
// 14. JOGO — MISSÃO DOS SENTINELAS
// =================================================================

var perguntaAtual = null;

function novaMissao() {
    var idx = Math.floor(Math.random() * PERGUNTAS.length);
    perguntaAtual = PERGUNTAS[idx];
    if (DOM.pergunta) DOM.pergunta.textContent = perguntaAtual.texto;
    if (DOM.feedbackMissao) DOM.feedbackMissao.style.display = 'none';
}

function responderMissao(resposta) {
    if (!perguntaAtual) {
        alert('Clique em "Nova Missão" primeiro!');
        return;
    }
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

// =================================================================
// 15. ROBÓTICA (CONEXÃO REAL ATIVADA)
// =================================================================

// ---- CONTROLE ----
const USAR_DISPOSITIVOS_REAIS = true; // ← JÁ ESTÁ TRUE PARA O DIA DA APRESENTAÇÃO

// ---- MAKEY MAKEY (sempre funciona, é USB) ----
document.addEventListener('keydown', function(e) {
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

// ================================================================
// MICRO:BIT (real ou fallback simulação)
// ================================================================

let microConectado = false;
let microbitDevice = null;

// --- SIMULAÇÃO (fallback) ---
function simularMicrobit(comando) {
    const mapa = { F: '🚨 FAKE', V: '✅ VERDADE', S: '⚠️ SUSPEITA' };
    if (DOM.comandoMicro) DOM.comandoMicro.textContent = 'Último comando: ' + (mapa[comando] || comando);
}

function simularPiscarLEDs(cor) {
    const leds = document.querySelectorAll('.led');
    const classe = cor === 'vermelho' ? 'aceso' : cor === 'verde' ? 'aceso-verde' : 'aceso-amarelo';
    leds.forEach(l => l.className = 'led');
    leds.forEach(l => l.classList.add(classe));
    setTimeout(() => leds.forEach(l => l.className = 'led'), 1500);
}

// --- REAL (Web Bluetooth) ---
async function conectarMicrobitReal() {
    try {
        if (typeof MicrobitConnection === 'undefined') {
            throw new Error('Biblioteca Micro:bit não carregada. Usando simulação.');
        }
        const { createBluetoothConnection } = MicrobitConnection;
        const connection = createBluetoothConnection();
        await connection.connect();
        microbitDevice = connection;
        microConectado = true;
        DOM.statusMicro.textContent = '🟢 Conectado!';
        DOM.conectarMicro.textContent = 'Desconectar';
        console.log('✅ Micro:bit conectado!');
    } catch (error) {
        console.warn('⚠️ Micro:bit real falhou, usando simulação:', error.message);
        microConectado = false;
        DOM.statusMicro.textContent = '🔴 Usando simulação';
    }
}

function desconectarMicrobitReal() {
    if (microbitDevice) {
        microbitDevice.disconnect();
        microbitDevice = null;
        microConectado = false;
        DOM.statusMicro.textContent = '🔴 Desconectado';
        DOM.conectarMicro.textContent = 'Conectar';
    }
}

async function enviarParaMicrobitReal(comando) {
    if (!microConectado || !microbitDevice) return simularMicrobit(comando);
    try {
        const icones = { 'F': '❌', 'V': '✅', 'S': '⚠️' };
        await microbitDevice.write('uart', icones[comando] || '?');
        DOM.comandoMicro.textContent = 'Último comando: ' + comando;
    } catch (error) {
        console.warn('⚠️ Erro ao enviar comando, usando simulação:', error.message);
        simularMicrobit(comando);
    }
}

async function piscarLEDsReal(cor) {
    if (!microConectado || !microbitDevice) return simularPiscarLEDs(cor);
    try {
        if (cor === 'verde') await microbitDevice.write('display', 'tick');
        else if (cor === 'vermelho') await microbitDevice.write('display', 'cross');
        else if (cor === 'amarelo') await microbitDevice.write('display', 'question_mark');
    } catch (error) {
        console.warn('⚠️ Erro ao piscar LEDs, usando simulação:', error.message);
        simularPiscarLEDs(cor);
    }
}

// --- ESCOLHA (prioriza real, fallback simulação) ---
const enviarParaMicrobit = USAR_DISPOSITIVOS_REAIS ? enviarParaMicrobitReal : simularMicrobit;
const piscarLEDs = USAR_DISPOSITIVOS_REAIS ? piscarLEDsReal : simularPiscarLEDs;


// --- EVENTOS DO BOTÃO ---
if (DOM.conectarMicro) {
    DOM.conectarMicro.addEventListener('click', async function() {
        if (USAR_DISPOSITIVOS_REAIS) {
            if (microConectado) {
                desconectarMicrobitReal();
            } else {
                await conectarMicrobitReal();
            }
        } else {
            // Simulação
            microConectado = !microConectado;
            DOM.statusMicro.textContent = microConectado ? '🟢 Conectado (Simulação)' : '🔴 Desconectado (Simulação)';
            this.textContent = microConectado ? 'Desconectar (Simulação)' : 'Conectar (Simulação)';
        }
    });
}

if (DOM.btnTestarMicro) {
    DOM.btnTestarMicro.addEventListener('click', async function() {
        if (!microConectado) { alert('Conecte o Micro:bit primeiro!'); return; }
        await piscarLEDs('verde');
        setTimeout(() => piscarLEDs('amarelo'), 800);
        setTimeout(() => piscarLEDs('vermelho'), 1600);
    });
}

// ================================================================
// SPHERO (real ou fallback simulação)
// ================================================================

let spheroConectado = false;
let spheroDevice = null;
let spheroX = 0, spheroY = 0;

// --- SIMULAÇÃO (fallback) ---
function simularMoverSphero(dir) {
    const passo = 25;
    if (dir === 'frente') spheroY -= passo;
    else if (dir === 'tras') spheroY += passo;
    else if (dir === 'esquerda') spheroX -= passo;
    else if (dir === 'direita') spheroX += passo;
    const sim = document.getElementById('spheroSim');
    if (sim) sim.style.transform = `translate(${spheroX}px, ${spheroY}px)`;
}

function simularMudarCorSphero(cor) {
    const el = document.getElementById('spheroSim');
    if (!el) return;
    el.style.background = cor;
    setTimeout(() => { if (!spheroConectado) el.style.background = '#2563eb'; }, 2000);
}

// --- REAL (Web Bluetooth) ---
async function conectarSpheroReal() {
    try {
        if (typeof spheron === 'undefined') {
            throw new Error('Biblioteca Spheron não carregada. Usando simulação.');
        }
        const device = await spheron.scan();
        await device.connect();
        spheroDevice = device;
        spheroConectado = true;
        DOM.statusSphero.textContent = '🟢 Conectado!';
        DOM.conectarSphero.textContent = 'Desconectar';
        console.log('✅ Sphero conectado!');
    } catch (error) {
        console.warn('⚠️ Sphero real falhou, usando simulação:', error.message);
        spheroConectado = false;
        DOM.statusSphero.textContent = '🔴 Usando simulação';
    }
}

function desconectarSpheroReal() {
    if (spheroDevice) {
        spheroDevice.disconnect();
        spheroDevice = null;
        spheroConectado = false;
        DOM.statusSphero.textContent = '🔴 Desconectado';
        DOM.conectarSphero.textContent = 'Conectar';
    }
}

function moverSpheroReal(dir) {
    if (!spheroConectado || !spheroDevice) {
        simularMoverSphero(dir);
        return;
    }
    try {
        const comandos = {
            'frente': { speed: 50, heading: 0 },
            'tras': { speed: 50, heading: 180 },
            'esquerda': { speed: 50, heading: 270 },
            'direita': { speed: 50, heading: 90 }
        };
        const cmd = comandos[dir];
        if (cmd) spheroDevice.roll(cmd.speed, cmd.heading);
    } catch (error) {
        console.warn('⚠️ Erro ao mover Sphero, usando simulação:', error.message);
        simularMoverSphero(dir);
    }
}

function mudarCorSpheroReal(cor) {
    if (!spheroConectado || !spheroDevice) return simularMudarCorSphero(cor);
    try {
        spheroDevice.setColor(cor);
    } catch (error) {
        console.warn('⚠️ Erro ao mudar cor do Sphero, usando simulação:', error.message);
        simularMudarCorSphero(cor);
    }
}

// --- ESCOLHA (prioriza real, fallback simulação) ---
const moverSphero = USAR_DISPOSITIVOS_REAIS ? moverSpheroReal : simularMoverSphero;
const mudarCorSphero = USAR_DISPOSITIVOS_REAIS ? mudarCorSpheroReal : simularMudarCorSphero;

// --- EVENTOS DO BOTÃO ---
if (DOM.conectarSphero) {
    DOM.conectarSphero.addEventListener('click', async function() {
        if (USAR_DISPOSITIVOS_REAIS) {
            if (spheroConectado) {
                desconectarSpheroReal();
            } else {
                await conectarSpheroReal();
            }
        } else {
            spheroConectado = !spheroConectado;
            DOM.statusSphero.textContent = spheroConectado ? '🟢 Conectado (Simulação)' : '🔴 Desconectado (Simulação)';
            this.textContent = spheroConectado ? 'Desconectar (Simulação)' : 'Conectar (Simulação)';
            if (!spheroConectado) {
                spheroX = 0; spheroY = 0;
                const sim = document.getElementById('spheroSim');
                if (sim) sim.style.transform = 'translate(0,0)';
            }
        }
    });
}

// =================================================================
// 17. EVENTOS E INICIALIZAÇÃO
// =================================================================

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

// =================================================================
// 18. INICIALIZAÇÃO
// =================================================================

var temaSalvo = localStorage.getItem('sentinelaTema') || 'escuro';
document.documentElement.setAttribute('data-tema', temaSalvo);
if (DOM.btnModoEscuro) DOM.btnModoEscuro.textContent = temaSalvo === 'escuro' ? '🌙' : '☀️';

carregarDados();
novaMissao();
setInterval(salvarDados, CONFIG.AUTO_SAVE_INTERVAL);

console.log('🛡️ Sentinela da Verdade v9.0 carregado!');
console.log('📚 Base:', BASE_CONHECIMENTO.length, 'fatos.');
console.log('🔑 API Key:', CONFIG.API_KEY ? '✅ Configurada' : '❌ Não configurada');