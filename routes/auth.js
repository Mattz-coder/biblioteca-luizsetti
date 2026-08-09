const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');

const router = express.Router();

// ------------------------------------------------------------
// Middlewares de protecao de rota, usados pelos outros arquivos
// de rotas (livros.js, alunos.js, estoque.js)
// ------------------------------------------------------------
function exigirFuncionario(req, res, next) {
  if (req.session && req.session.funcionario) return next();
  return res.status(401).json({ erro: 'E preciso estar logado como funcionario.' });
}

function exigirAluno(req, res, next) {
  if (req.session && req.session.aluno) return next();
  return res.status(401).json({ erro: 'E preciso estar logado como aluno.' });
}

// ------------------------------------------------------------
// POST /api/auth/login-aluno
// ------------------------------------------------------------
router.post('/login-aluno', async (req, res) => {
  const { cgm, senha } = req.body;
  if (!cgm || !senha) {
    return res.status(400).json({ erro: 'Informe CGM e senha.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, nome, cgm, senha_hash, ativo FROM alunos WHERE cgm = $1',
      [cgm]
    );
    const aluno = rows[0];
    if (!aluno || !aluno.ativo) {
      return res.status(401).json({ erro: 'CGM ou senha invalidos.' });
    }

    const senhaOk = await bcrypt.compare(senha, aluno.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ erro: 'CGM ou senha invalidos.' });
    }

    req.session.aluno = { id: aluno.id, nome: aluno.nome, cgm: aluno.cgm };
    delete req.session.funcionario; // evita sessao "mista" se o mesmo navegador tinha um funcionario logado
    return res.json({ aluno: req.session.aluno });
  } catch (err) {
    console.error('Erro no login do aluno:', err);
    return res.status(500).json({ erro: 'Erro ao processar login.' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/login-funcionario
// ------------------------------------------------------------
router.post('/login-funcionario', async (req, res) => {
  const { cpf, senha } = req.body;
  if (!cpf || !senha) {
    return res.status(400).json({ erro: 'Informe CPF e senha.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, nome, cpf, cargo, senha_hash, ativo FROM funcionarios WHERE cpf = $1',
      [cpf]
    );
    const funcionario = rows[0];
    if (!funcionario || !funcionario.ativo) {
      return res.status(401).json({ erro: 'CPF ou senha invalidos.' });
    }

    const senhaOk = await bcrypt.compare(senha, funcionario.senha_hash);
    if (!senhaOk) {
      return res.status(401).json({ erro: 'CPF ou senha invalidos.' });
    }

    req.session.funcionario = { id: funcionario.id, nome: funcionario.nome, cargo: funcionario.cargo };
    delete req.session.aluno; // evita sessao "mista" se o mesmo navegador tinha um aluno logado
    return res.json({ funcionario: req.session.funcionario });
  } catch (err) {
    console.error('Erro no login do funcionario:', err);
    return res.status(500).json({ erro: 'Erro ao processar login.' });
  }
});

// ------------------------------------------------------------
// POST /api/auth/logout
// ------------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ------------------------------------------------------------
// GET /api/auth/sessao - para as paginas saberem quem esta logado
// ------------------------------------------------------------
router.get('/sessao', (req, res) => {
  res.json({
    aluno: req.session.aluno || null,
    funcionario: req.session.funcionario || null,
  });
});

module.exports = { router, exigirFuncionario, exigirAluno };