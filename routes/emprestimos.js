const express = require('express');
const pool = require('../db/pool');
const { exigirFuncionario, exigirAluno } = require('./auth');

const router = express.Router();

// Prazo padrao (em dias) usado quando o funcionario nao informa outro valor
const PRAZO_PADRAO_DIAS = 7;

// ------------------------------------------------------------
// Atualiza para "atrasado" qualquer emprestimo em andamento cujo
// prazo ja passou. E chamado antes de cada listagem/consulta para
// manter o status sempre correto, sem depender de um job externo.
// ------------------------------------------------------------
async function atualizarAtrasados() {
  await pool.query(
    `UPDATE emprestimos
     SET status = 'atrasado'
     WHERE status = 'em_andamento' AND data_prevista_devolucao < CURRENT_DATE`
  );
}

// ------------------------------------------------------------
// GET /api/emprestimos/meus - o proprio aluno consulta os livros
// que pegou emprestado e as datas de devolucao. Fica ANTES do
// router.use(exigirFuncionario) abaixo, pois usa login de aluno.
// ------------------------------------------------------------
router.get('/meus', exigirAluno, async (req, res) => {
  try {
    await atualizarAtrasados();

    const { rows } = await pool.query(
      `SELECT em.id, em.data_emprestimo, em.data_prevista_devolucao, em.data_devolucao, em.status,
              l.titulo, l.autor, l.categoria,
              (em.data_prevista_devolucao - CURRENT_DATE) AS dias_restantes
       FROM emprestimos em
       JOIN exemplares ex ON ex.id = em.exemplar_id
       JOIN livros l ON l.id = ex.livro_id
       WHERE em.aluno_id = $1
       ORDER BY (em.status IN ('em_andamento', 'atrasado')) DESC,
                em.data_prevista_devolucao ASC`,
      [req.session.aluno.id]
    );

    const resumoPorStatus = rows.reduce(
      (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
      {}
    );

    res.json({ emprestimos: rows, resumoPorStatus });
  } catch (err) {
    console.error('Erro ao listar emprestimos do aluno:', err);
    res.status(500).json({ erro: 'Erro ao listar seus emprestimos.' });
  }
});

// Todas as rotas abaixo exigem login de funcionario (admin)
router.use(exigirFuncionario);

// ------------------------------------------------------------
// GET /api/emprestimos - listar emprestimos (com dados do aluno e do livro)
// Query params: q (nome do aluno ou titulo do livro), status, pagina, limite
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  const { q, status, pagina = 1, limite = 20 } = req.query;

  try {
    await atualizarAtrasados();

    const condicoes = [];
    const valores = [];

    if (q) {
      valores.push(`%${q}%`);
      condicoes.push(`(a.nome ILIKE $${valores.length} OR l.titulo ILIKE $${valores.length})`);
    }
    if (status) {
      valores.push(status);
      condicoes.push(`em.status = $${valores.length}`);
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
    const deslocamento = (Math.max(1, Number(pagina)) - 1) * Number(limite);
    valores.push(Number(limite));
    valores.push(deslocamento);

    const { rows } = await pool.query(
      `SELECT em.id, em.data_emprestimo, em.data_prevista_devolucao, em.data_devolucao, em.status,
              a.id AS aluno_id, a.nome AS aluno_nome, a.turma,
              l.id AS livro_id, l.titulo, l.autor,
              ex.id AS exemplar_id, ex.codigo_patrimonio,
              (em.data_prevista_devolucao - CURRENT_DATE) AS dias_restantes
       FROM emprestimos em
       JOIN alunos a ON a.id = em.aluno_id
       JOIN exemplares ex ON ex.id = em.exemplar_id
       JOIN livros l ON l.id = ex.livro_id
       ${where}
       ORDER BY (em.status = 'em_andamento' OR em.status = 'atrasado') DESC,
                em.data_prevista_devolucao ASC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores
    );

    const { rows: contagem } = await pool.query(
      `SELECT COUNT(*)
       FROM emprestimos em
       JOIN alunos a ON a.id = em.aluno_id
       JOIN exemplares ex ON ex.id = em.exemplar_id
       JOIN livros l ON l.id = ex.livro_id
       ${where}`,
      valores.slice(0, valores.length - 2)
    );

    const { rows: resumo } = await pool.query(`SELECT status, COUNT(*) FROM emprestimos GROUP BY status`);

    res.json({
      emprestimos: rows,
      total: Number(contagem[0].count),
      pagina: Number(pagina),
      limite: Number(limite),
      resumoPorStatus: resumo.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {}),
      prazoPadraoDias: PRAZO_PADRAO_DIAS,
    });
  } catch (err) {
    console.error('Erro ao listar emprestimos:', err);
    res.status(500).json({ erro: 'Erro ao listar emprestimos.' });
  }
});

// ------------------------------------------------------------
// GET /api/emprestimos/notificacoes - emprestimos vencendo em breve ou
// ja atrasados, para o sino de notificacoes do admin.
// Query params: dias (janela de "prestes a vencer", padrao 2)
// ------------------------------------------------------------
router.get('/notificacoes', async (req, res) => {
  const diasJanela = Number(req.query.dias) || 2;

  try {
    await atualizarAtrasados();

    const { rows } = await pool.query(
      `SELECT em.id, em.data_prevista_devolucao,
              a.nome AS aluno_nome,
              l.titulo,
              (em.data_prevista_devolucao - CURRENT_DATE) AS dias_restantes
       FROM emprestimos em
       JOIN alunos a ON a.id = em.aluno_id
       JOIN exemplares ex ON ex.id = em.exemplar_id
       JOIN livros l ON l.id = ex.livro_id
       WHERE em.status IN ('em_andamento', 'atrasado')
         AND em.data_prevista_devolucao <= (CURRENT_DATE + $1::int)
       ORDER BY em.data_prevista_devolucao ASC`,
      [diasJanela]
    );

    res.json({
      total: rows.length,
      notificacoes: rows.map((r) => ({
        ...r,
        tipo: r.dias_restantes < 0 ? 'atrasado' : 'prestes_a_vencer',
      })),
    });
  } catch (err) {
    console.error('Erro ao buscar notificacoes de emprestimos:', err);
    res.status(500).json({ erro: 'Erro ao buscar notificacoes.' });
  }
});

// ------------------------------------------------------------
// POST /api/emprestimos - registrar um novo emprestimo
// Body: { aluno_id, livro_id, prazo_dias }
// O sistema escolhe automaticamente um exemplar disponivel do livro.
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  const { aluno_id, livro_id, prazo_dias } = req.body;

  if (!aluno_id || !livro_id) {
    return res.status(400).json({ erro: 'Informe o aluno e o livro.' });
  }

  const prazo = Number(prazo_dias) > 0 ? Number(prazo_dias) : PRAZO_PADRAO_DIAS;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: exemplares } = await client.query(
      `SELECT id FROM exemplares
       WHERE livro_id = $1 AND status = 'disponivel'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [livro_id]
    );

    if (!exemplares[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Nao ha exemplares disponiveis para este livro.' });
    }

    const exemplarId = exemplares[0].id;

    const { rows: emprestimo } = await client.query(
      `INSERT INTO emprestimos (exemplar_id, aluno_id, data_emprestimo, data_prevista_devolucao, status, registrado_por)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + $3::int, 'em_andamento', $4)
       RETURNING *`,
      [exemplarId, aluno_id, prazo, req.session.funcionario.id]
    );

    await client.query(`UPDATE exemplares SET status = 'emprestado' WHERE id = $1`, [exemplarId]);

    await client.query('COMMIT');
    res.status(201).json({ emprestimo: emprestimo[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar emprestimo:', err);
    res.status(500).json({ erro: 'Erro ao registrar emprestimo.' });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------
// PATCH /api/emprestimos/:id - editar o prazo ou registrar a devolucao
// Body (um dos dois):
//   { prazo_dias }               -> recalcula a data prevista a partir
//                                     da data do emprestimo (permite
//                                     aumentar ou reduzir o prazo)
//   { acao: 'devolver' }         -> marca como devolvido e libera o exemplar
// ------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  const { prazo_dias, acao } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: atuais } = await client.query('SELECT * FROM emprestimos WHERE id = $1 FOR UPDATE', [
      req.params.id,
    ]);
    const emprestimo = atuais[0];
    if (!emprestimo) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Emprestimo nao encontrado.' });
    }

    if (acao === 'devolver') {
      if (emprestimo.status === 'devolvido') {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Este emprestimo ja foi devolvido.' });
      }
      const { rows } = await client.query(
        `UPDATE emprestimos SET data_devolucao = CURRENT_DATE, status = 'devolvido' WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      await client.query(`UPDATE exemplares SET status = 'disponivel' WHERE id = $1`, [emprestimo.exemplar_id]);
      await client.query('COMMIT');
      return res.json({ emprestimo: rows[0] });
    }

    if (prazo_dias !== undefined) {
      const dias = Number(prazo_dias);
      if (!Number.isFinite(dias) || dias <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ erro: 'Informe um prazo (em dias) maior que zero.' });
      }
      if (emprestimo.status === 'devolvido') {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro: 'Nao e possivel alterar o prazo de um emprestimo ja devolvido.' });
      }
      const { rows } = await client.query(
        `UPDATE emprestimos
         SET data_prevista_devolucao = data_emprestimo + $1::int,
             status = CASE WHEN (data_emprestimo + $1::int) < CURRENT_DATE THEN 'atrasado' ELSE 'em_andamento' END
         WHERE id = $2
         RETURNING *`,
        [dias, req.params.id]
      );
      await client.query('COMMIT');
      return res.json({ emprestimo: rows[0] });
    }

    await client.query('ROLLBACK');
    return res.status(400).json({ erro: 'Informe "prazo_dias" para editar o prazo ou "acao: devolver" para registrar a devolucao.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar emprestimo:', err);
    res.status(500).json({ erro: 'Erro ao atualizar emprestimo.' });
  } finally {
    client.release();
  }
});

module.exports = router;
