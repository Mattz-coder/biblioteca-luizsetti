const express = require('express');
const pool = require('../db/pool');
const { exigirFuncionario } = require('./auth');

const router = express.Router();

// Toda a administracao de estoque exige login de funcionario (admin)
router.use(exigirFuncionario);

// ------------------------------------------------------------
// GET /api/estoque - listar exemplares (com dados do livro), com filtros
// Query params: q (titulo do livro), status, pagina, limite
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  const { q, status, pagina = 1, limite = 20 } = req.query;

  const condicoes = [];
  const valores = [];

  if (q) {
    valores.push(`%${q}%`);
    condicoes.push(`(l.titulo ILIKE $${valores.length} OR e.codigo_patrimonio ILIKE $${valores.length})`);
  }
  if (status) {
    valores.push(status);
    condicoes.push(`e.status = $${valores.length}`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const deslocamento = (Math.max(1, Number(pagina)) - 1) * Number(limite);
  valores.push(Number(limite));
  valores.push(deslocamento);

  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.codigo_patrimonio, e.status, e.localizacao, e.observacoes,
              l.id AS livro_id, l.titulo, l.autor
       FROM exemplares e
       JOIN livros l ON l.id = e.livro_id
       ${where}
       ORDER BY l.titulo ASC, e.id ASC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores
    );

    const { rows: contagem } = await pool.query(
      `SELECT COUNT(*) FROM exemplares e JOIN livros l ON l.id = e.livro_id ${where}`,
      valores.slice(0, valores.length - 2)
    );

    const { rows: resumo } = await pool.query(
      `SELECT status, COUNT(*) FROM exemplares GROUP BY status`
    );

    res.json({
      exemplares: rows,
      total: Number(contagem[0].count),
      pagina: Number(pagina),
      limite: Number(limite),
      resumoPorStatus: resumo.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {}),
    });
  } catch (err) {
    console.error('Erro ao listar estoque:', err);
    res.status(500).json({ erro: 'Erro ao listar estoque.' });
  }
});

// ------------------------------------------------------------
// POST /api/estoque - adicionar novo(s) exemplar(es) a um livro ja existente
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  const { livro_id, codigo_patrimonio, localizacao, quantidade } = req.body;

  if (!livro_id) {
    return res.status(400).json({ erro: 'Informe o livro ao qual o exemplar pertence.' });
  }

  const qtd = Number(quantidade) || 1;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inseridos = [];
    for (let i = 0; i < qtd; i += 1) {
      const { rows } = await client.query(
        `INSERT INTO exemplares (livro_id, codigo_patrimonio, localizacao, status)
         VALUES ($1, $2, $3, 'disponivel')
         RETURNING *`,
        [livro_id, qtd === 1 ? (codigo_patrimonio || null) : null, localizacao || null]
      );
      inseridos.push(rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ exemplares: inseridos });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar exemplar:', err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Ja existe um exemplar com esse codigo de patrimonio.' });
    }
    res.status(500).json({ erro: 'Erro ao adicionar exemplar.' });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------
// PATCH /api/estoque/:id - atualizar status/localizacao de um exemplar
// (ex: marcar como "manutencao", "perdido", ou de volta "disponivel")
// ------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  const { status, localizacao, observacoes, codigo_patrimonio } = req.body;

  const statusValidos = ['disponivel', 'emprestado', 'reservado', 'manutencao', 'perdido'];
  if (status && !statusValidos.includes(status)) {
    return res.status(400).json({ erro: `Status invalido. Use um de: ${statusValidos.join(', ')}.` });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE exemplares SET
         status = COALESCE($1, status),
         localizacao = COALESCE($2, localizacao),
         observacoes = COALESCE($3, observacoes),
         codigo_patrimonio = COALESCE($4, codigo_patrimonio)
       WHERE id = $5
       RETURNING *`,
      [status, localizacao, observacoes, codigo_patrimonio, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Exemplar nao encontrado.' });
    res.json({ exemplar: rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar exemplar:', err);
    res.status(500).json({ erro: 'Erro ao atualizar exemplar.' });
  }
});

// ------------------------------------------------------------
// DELETE /api/estoque/:id - remover exemplar do estoque (baixa definitiva)
// ------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM exemplares WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: 'Exemplar nao encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover exemplar:', err);
    res.status(500).json({ erro: 'Erro ao remover exemplar.' });
  }
});

module.exports = router;
