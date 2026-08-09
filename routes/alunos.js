const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const { exigirFuncionario } = require('./auth');

const router = express.Router();

// Todas as rotas de alunos exigem login de funcionario (admin)
router.use(exigirFuncionario);

// ------------------------------------------------------------
// GET /api/alunos - listar/buscar alunos cadastrados
// ------------------------------------------------------------
router.get('/', async (req, res) => {
  const { q, turma, pagina = 1, limite = 20 } = req.query;

  const condicoes = [];
  const valores = [];

  if (q) {
    valores.push(`%${q}%`);
    condicoes.push(`(nome ILIKE $${valores.length} OR cgm ILIKE $${valores.length})`);
  }
  if (turma) {
    valores.push(turma);
    condicoes.push(`turma = $${valores.length}`);
  }

  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const deslocamento = (Math.max(1, Number(pagina)) - 1) * Number(limite);
  valores.push(Number(limite));
  valores.push(deslocamento);

  try {
    const { rows } = await pool.query(
      `SELECT id, cgm, nome, turma, turno, email, ativo, criado_em
       FROM alunos ${where}
       ORDER BY nome ASC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores
    );
    const { rows: contagem } = await pool.query(`SELECT COUNT(*) FROM alunos ${where}`, valores.slice(0, valores.length - 2));

    res.json({ alunos: rows, total: Number(contagem[0].count), pagina: Number(pagina), limite: Number(limite) });
  } catch (err) {
    console.error('Erro ao listar alunos:', err);
    res.status(500).json({ erro: 'Erro ao listar alunos.' });
  }
});

// ------------------------------------------------------------
// POST /api/alunos - cadastrar novo aluno
// ------------------------------------------------------------
router.post('/', async (req, res) => {
  const { cgm, nome, turma, turno, email, senha } = req.body;

  if (!cgm || !nome || !senha) {
    return res.status(400).json({ erro: 'CGM, nome e senha sao obrigatorios.' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  try {
    const senha_hash = await bcrypt.hash(senha, 10);
    const { rows } = await pool.query(
      `INSERT INTO alunos (cgm, nome, turma, turno, email, senha_hash, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, cgm, nome, turma, turno, email, ativo, criado_em`,
      [cgm, nome, turma || null, turno || null, email || null, senha_hash, req.session.funcionario.id]
    );
    res.status(201).json({ aluno: rows[0] });
  } catch (err) {
    console.error('Erro ao cadastrar aluno:', err);
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Ja existe um aluno cadastrado com esse CGM.' });
    }
    res.status(500).json({ erro: 'Erro ao cadastrar aluno.' });
  }
});

// ------------------------------------------------------------
// PUT /api/alunos/:id - editar dados do aluno
// ------------------------------------------------------------
router.put('/:id', async (req, res) => {
  const { nome, turma, turno, email, ativo } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE alunos SET
         nome = COALESCE($1, nome),
         turma = COALESCE($2, turma),
         turno = COALESCE($3, turno),
         email = COALESCE($4, email),
         ativo = COALESCE($5, ativo)
       WHERE id = $6
       RETURNING id, cgm, nome, turma, turno, email, ativo, criado_em`,
      [nome, turma, turno, email, ativo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Aluno nao encontrado.' });
    res.json({ aluno: rows[0] });
  } catch (err) {
    console.error('Erro ao editar aluno:', err);
    res.status(500).json({ erro: 'Erro ao editar aluno.' });
  }
});

// ------------------------------------------------------------
// PATCH /api/alunos/:id/redefinir-senha
// ------------------------------------------------------------
router.patch('/:id/redefinir-senha', async (req, res) => {
  const { senha } = req.body;
  if (!senha || senha.length < 6) {
    return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }
  try {
    const senha_hash = await bcrypt.hash(senha, 10);
    const { rowCount } = await pool.query('UPDATE alunos SET senha_hash = $1 WHERE id = $2', [senha_hash, req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: 'Aluno nao encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    res.status(500).json({ erro: 'Erro ao redefinir senha.' });
  }
});

// ------------------------------------------------------------
// DELETE /api/alunos/:id - desativar aluno (exclusao logica)
// ------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('UPDATE alunos SET ativo = FALSE WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ erro: 'Aluno nao encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao desativar aluno:', err);
    res.status(500).json({ erro: 'Erro ao desativar aluno.' });
  }
});

module.exports = router;
