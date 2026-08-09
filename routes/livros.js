const express = require('express');
const pool = require('../db/pool');
const { exigirFuncionario } = require('./auth');

const router = express.Router();

// ------------------------------------------------------------
// GET /api/livros
// Catalogo publico (aluno ou funcionario). Suporta busca e filtro.
// Query params: q (titulo/autor), categoria, disponivel=true, pagina, limite
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  const { q, categoria, disponivel, pagina = 1, limite = 20 } = req.query;

  const condicoes = [];
  const valores = [];

  if (q) {
    valores.push(`%${q}%`);
    condicoes.push(`(titulo ILIKE $${valores.length} OR autor ILIKE $${valores.length})`);
  }
  if (categoria) {
    valores.push(categoria);
    condicoes.push(`categoria = $${valores.length}`);
  }
  if (disponivel === 'true') {
    condicoes.push('exemplares_disponiveis > 0');
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const deslocamento = (Math.max(1, Number(pagina)) - 1) * Number(limite);

  valores.push(Number(limite));
  valores.push(deslocamento);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM vw_catalogo_livros ${where}
       ORDER BY titulo ASC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores
    );

    const { rows: contagem } = await pool.query(
      `SELECT COUNT(*) FROM vw_catalogo_livros ${where}`,
      valores.slice(0, valores.length - 2)
    );

    res.json({
      livros: rows,
      total: Number(contagem[0].count),
      pagina: Number(pagina),
      limite: Number(limite),
    });
  } catch (err) {
    console.error('Erro ao buscar catalogo:', err);
    res.status(500).json({ erro: 'Erro ao buscar catalogo de livros.' });
  }
});

// ------------------------------------------------------------
// GET /api/livros/categorias - lista de categorias distintas (para filtro)
// ------------------------------------------------------------
router.get('/categorias', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT categoria FROM livros WHERE categoria IS NOT NULL ORDER BY categoria'
    );
    res.json({ categorias: rows.map((r) => r.categoria) });
  } catch (err) {
    console.error('Erro ao buscar categorias:', err);
    res.status(500).json({ erro: 'Erro ao buscar categorias.' });
  }
});

// ------------------------------------------------------------
// GET /api/livros/:id - detalhe de um livro + seus exemplares
// ------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM vw_catalogo_livros WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ erro: 'Livro nao encontrado.' });

    const { rows: exemplares } = await pool.query(
      'SELECT id, codigo_patrimonio, status, localizacao FROM exemplares WHERE livro_id = $1 ORDER BY id',
      [req.params.id]
    );

    res.json({ livro: rows[0], exemplares });
  } catch (err) {
    console.error('Erro ao buscar livro:', err);
    res.status(500).json({ erro: 'Erro ao buscar livro.' });
  }
});

// ------------------------------------------------------------
// POST /api/livros - cadastrar novo livro (somente funcionario)
// ------------------------------------------------------------
router.post('/', exigirFuncionario, async (req, res) => {
  const { titulo, autor, isbn, editora, ano_publicacao, categoria, sinopse, capa_url, quantidade_exemplares } = req.body;

  if (!titulo || !autor) {
    return res.status(400).json({ erro: 'Titulo e autor sao obrigatorios.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO livros (titulo, autor, isbn, editora, ano_publicacao, categoria, sinopse, capa_url, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [titulo, autor, isbn || null, editora || null, ano_publicacao || null, categoria || null, sinopse || null, capa_url || null, req.session.funcionario.id]
    );
    const livro = rows[0];

    // Cria os exemplares iniciais de estoque, se informado
    const qtd = Number(quantidade_exemplares) || 0;
    for (let i = 0; i < qtd; i += 1) {
      await client.query(
        `INSERT INTO exemplares (livro_id, status) VALUES ($1, 'disponivel')`,
        [livro.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ livro });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao cadastrar livro:', err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Ja existe um livro com esse ISBN.' });
    }
    res.status(500).json({ erro: 'Erro ao cadastrar livro.' });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------
// PUT /api/livros/:id - editar dados bibliograficos (somente funcionario)
// ------------------------------------------------------------
router.put('/:id', exigirFuncionario, async (req, res) => {
  const { titulo, autor, isbn, editora, ano_publicacao, categoria, sinopse, capa_url } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE livros SET
         titulo = COALESCE($1, titulo),
         autor = COALESCE($2, autor),
         isbn = COALESCE($3, isbn),
         editora = COALESCE($4, editora),
         ano_publicacao = COALESCE($5, ano_publicacao),
         categoria = COALESCE($6, categoria),
         sinopse = COALESCE($7, sinopse),
         capa_url = COALESCE($8, capa_url)
       WHERE id = $9
       RETURNING *`,
      [titulo, autor, isbn, editora, ano_publicacao, categoria, sinopse, capa_url, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Livro nao encontrado.' });
    res.json({ livro: rows[0] });
  } catch (err) {
    console.error('Erro ao editar livro:', err);
    res.status(500).json({ erro: 'Erro ao editar livro.' });
  }
});

// ------------------------------------------------------------
// DELETE /api/livros/:id - remover livro do acervo (somente funcionario)
// ------------------------------------------------------------
router.delete('/:id', exigirFuncionario, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM livros WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: 'Livro nao encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover livro:', err);
    if (err.code === '23503') {
      return res.status(409).json({ erro: 'Não é possível remover: existem empréstimos vinculados a exemplares deste livro.' });
    }
    res.status(500).json({ erro: 'Erro ao remover livro.' });
  }
});

module.exports = router;
