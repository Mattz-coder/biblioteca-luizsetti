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
// Botao de "mostrar/ocultar senha" (olhinho), adicionado
// automaticamente a todo campo type="password" da pagina -
// funciona no login do aluno, do funcionario, cadastro de
// aluno e redefinicao de senha, sem precisar editar cada tela.
// ------------------------------------------------------------
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
    botao.textContent = '👁';
    wrapper.appendChild(botao);

    botao.addEventListener('click', () => {
      const mostrando = input.type === 'text';
      input.type = mostrando ? 'password' : 'text';
      botao.textContent = mostrando ? '👁' : '🙈';
      botao.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
    });
  });
}

document.addEventListener('DOMContentLoaded', iniciarOlhosDeSenha);