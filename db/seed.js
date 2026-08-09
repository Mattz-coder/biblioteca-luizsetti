// Script auxiliar para criar o primeiro funcionario (admin) do sistema,
// ja que nao existe tela de auto-cadastro de funcionario por seguranca.
//
// Uso:
//   node db/seed.js
//
// Voce pode editar os dados abaixo antes de rodar.

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./pool');

async function principal() {
  const cpf = process.env.SEED_ADMIN_CPF || '00000000000';
  const nome = process.env.SEED_ADMIN_NOME || 'Administrador da Biblioteca';
  const senha = process.env.SEED_ADMIN_SENHA || 'troque-esta-senha';

  const senha_hash = await bcrypt.hash(senha, 10);

  try {
    const existente = await pool.query('SELECT id FROM funcionarios WHERE cpf = $1', [cpf]);
    if (existente.rows.length) {
      console.log(`Ja existe um funcionario com o CPF ${cpf}. Nada foi alterado.`);
    } else {
      await pool.query(
        `INSERT INTO funcionarios (cpf, nome, cargo, senha_hash) VALUES ($1, $2, $3, $4)`,
        [cpf, nome, 'Bibliotecário(a)', senha_hash]
      );
      console.log(`Funcionario criado: CPF ${cpf} / senha "${senha}" (troque no primeiro acesso).`);
    }
  } catch (err) {
    console.error('Erro ao criar funcionario inicial:', err);
  } finally {
    await pool.end();
  }
}

principal();
