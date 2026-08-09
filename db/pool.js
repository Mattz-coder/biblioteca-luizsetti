// Pool de conexoes com o PostgreSQL.
// As credenciais vem das variaveis de ambiente (ver .env.example),
// entao este arquivo nao muda quando o banco for de fato provisionado.

const { Pool } = require('pg');

// Supabase (e a maioria dos provedores de PostgreSQL em nuvem) exige
// conexao criptografada (SSL). Em desenvolvimento local isso normalmente
// nao e necessario, entao so ativamos quando PGSSLMODE=require estiver
// definido (ver .env.example).
const usarSSL = process.env.PGSSLMODE === 'require';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE || 'biblioteca_virtual',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
  ssl: usarSSL ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

module.exports = pool;
