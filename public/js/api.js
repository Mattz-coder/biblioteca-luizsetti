// Helper simples para conversar com a API da Biblioteca Virtual.
// Todas as paginas incluem este arquivo antes do seu proprio script.

const api = {
  async _chamar(metodo, caminho, corpo) {
    const opcoes = {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // envia o cookie de sessao
    };
    if (corpo !== undefined) {
      opcoes.body = JSON.stringify(corpo);
    }

    const resposta = await fetch(`/api${caminho}`, opcoes);
    let dados = null;
    try {
      dados = await resposta.json();
    } catch (_) {
      dados = null;
    }

    if (!resposta.ok) {
      const erro = new Error((dados && dados.erro) || 'Erro inesperado.');
      erro.mensagem = (dados && dados.erro) || 'Erro inesperado.';
      erro.status = resposta.status;
      throw erro;
    }

    return dados;
  },

  get(caminho) {
    return this._chamar('GET', caminho);
  },
  post(caminho, corpo) {
    return this._chamar('POST', caminho, corpo || {});
  },
  put(caminho, corpo) {
    return this._chamar('PUT', caminho, corpo || {});
  },
  patch(caminho, corpo) {
    return this._chamar('PATCH', caminho, corpo || {});
  },
  delete(caminho) {
    return this._chamar('DELETE', caminho);
  },
};

// ------------------------------------------------------------
// Protecao de pagina: redireciona para o login se a sessao
// necessaria (aluno ou funcionario) nao existir.
// Cada pagina interna chama uma destas no carregamento.
// ------------------------------------------------------------
async function exigirSessaoFuncionario() {
  try {
    const { funcionario } = await api.get('/auth/sessao');
    if (!funcionario) {
      window.location.href = 'index.html';
      return null;
    }
    return funcionario;
  } catch (_) {
    window.location.href = 'index.html';
    return null;
  }
}

async function exigirSessaoAluno() {
  try {
    const { aluno } = await api.get('/auth/sessao');
    if (!aluno) {
      window.location.href = 'index.html';
      return null;
    }
    return aluno;
  } catch (_) {
    window.location.href = 'index.html';
    return null;
  }
}

async function sair() {
  await api.post('/auth/logout');
  window.location.href = 'index.html';
}

// ------------------------------------------------------------
// Sino de notificacoes de emprestimos (usado em todas as paginas
// administrativas). Avisa o funcionario quando um emprestimo esta
// atrasado ou vencendo nos proximos dias.
// ------------------------------------------------------------
async function carregarNotificacoes() {
  const btnSino = document.getElementById('btn-sino');
  const contador = document.getElementById('sino-contador');
  const lista = document.getElementById('lista-notificacoes');
  if (!btnSino) return; // pagina sem o sino (ex: login)

  try {
    const { notificacoes } = await api.get('/emprestimos/notificacoes?dias=2');

    if (notificacoes.length === 0) {
      contador.hidden = true;
      lista.innerHTML = '<p style="color: var(--muted); font-size: 0.88rem; margin: 0;">Nenhum empréstimo vencendo por enquanto.</p>';
      return;
    }

    contador.hidden = false;
    contador.textContent = notificacoes.length;

    lista.innerHTML = notificacoes.map((n) => {
      const atrasado = n.tipo === 'atrasado';
      const texto = atrasado
        ? `${Math.abs(n.dias_restantes)} dia(s) de atraso`
        : n.dias_restantes === 0
          ? 'Vence hoje'
          : `Vence em ${n.dias_restantes} dia(s)`;
      return `
        <div class="notificacao-item ${atrasado ? 'atrasado' : ''}">
          <strong>${n.aluno_nome}</strong>
          <span>${n.titulo}</span>
          <span class="notificacao-prazo">${texto}</span>
        </div>
      `;
    }).join('');
  } catch (erro) {
    console.error('Erro ao carregar notificacoes:', erro);
  }
}

function iniciarNotificacoes() {
  const btnSino = document.getElementById('btn-sino');
  const painel = document.getElementById('painel-notificacoes');
  if (!btnSino || !painel) return;

  btnSino.addEventListener('click', (evento) => {
    evento.stopPropagation();
    painel.hidden = !painel.hidden;
  });
  document.addEventListener('click', (evento) => {
    if (!painel.hidden && !painel.contains(evento.target) && evento.target !== btnSino) {
      painel.hidden = true;
    }
  });

  carregarNotificacoes();
  setInterval(carregarNotificacoes, 60000); // atualiza a cada 1 minuto
}

// ------------------------------------------------------------
// Botao de "mostrar/ocultar senha" (olho), adicionado
// automaticamente a todo campo type="password" da pagina -
// funciona no login do aluno, do funcionario, cadastro de
// aluno e redefinicao de senha, sem precisar editar cada tela.
// ------------------------------------------------------------
const ICONE_OLHO_ABERTO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICONE_OLHO_FECHADO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a21.7 21.7 0 0 1-2.61 3.85M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`;

function iniciarOlhosDeSenha() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.olhoAtivo) return;
    input.dataset.olhoAtivo = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'campo-senha-wrap';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn-olho';
    botao.setAttribute('aria-label', 'Mostrar senha');
    botao.innerHTML = ICONE_OLHO_ABERTO;
    wrapper.appendChild(botao);

    botao.addEventListener('click', () => {
      const mostrando = input.type === 'text';
      input.type = mostrando ? 'password' : 'text';
      botao.innerHTML = mostrando ? ICONE_OLHO_ABERTO : ICONE_OLHO_FECHADO;
      botao.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
    });
  });
}

document.addEventListener('DOMContentLoaded', iniciarOlhosDeSenha);

// ------------------------------------------------------------
// Tema claro/escuro, com preferencia salva no navegador.
// Botao flutuante presente em todas as paginas (adicionado por
// aqui, ja que este arquivo e carregado em todo lugar).
// ------------------------------------------------------------
const ICONE_SOL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const ICONE_LUA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>`;

function aplicarTema(tema) {
  if (tema === 'escuro') {
    document.documentElement.setAttribute('data-tema', 'escuro');
  } else {
    document.documentElement.removeAttribute('data-tema');
  }
}

function iniciarBotaoTema() {
  const salvo = localStorage.getItem('bv_tema') || 'claro';
  aplicarTema(salvo);

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'btn-tema';
  botao.setAttribute('aria-label', 'Alternar tema claro/escuro');
  botao.innerHTML = salvo === 'escuro' ? ICONE_SOL : ICONE_LUA;
  document.body.appendChild(botao);

  botao.addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'escuro' : 'claro';
    const novo = atual === 'escuro' ? 'claro' : 'escuro';
    aplicarTema(novo);
    localStorage.setItem('bv_tema', novo);
    botao.innerHTML = novo === 'escuro' ? ICONE_SOL : ICONE_LUA;
  });
}

// Aplica o tema salvo assim que possivel (antes do resto carregar),
// pra evitar um "flash" da tela clara antes de escurecer.
aplicarTema(localStorage.getItem('bv_tema') || 'claro');
document.addEventListener('DOMContentLoaded', iniciarBotaoTema);