-- ============================================================
-- Biblioteca Virtual - Colegio Luiz Setti
-- Schema PostgreSQL
-- ============================================================
-- Como usar:
--   createdb biblioteca_virtual
--   psql -d biblioteca_virtual -f db/schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- para gen_random_uuid(), se preferir UUID no futuro

-- ------------------------------------------------------------
-- Funcionarios (admins que cadastram alunos, livros e gerenciam estoque)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funcionarios (
  id             SERIAL PRIMARY KEY,
  cpf            VARCHAR(11) NOT NULL UNIQUE,
  nome           VARCHAR(150) NOT NULL,
  cargo          VARCHAR(80),
  senha_hash     VARCHAR(255) NOT NULL,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Alunos (cadastrados pelo funcionario, usam CGM + senha para logar)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alunos (
  id             SERIAL PRIMARY KEY,
  cgm            VARCHAR(20) NOT NULL UNIQUE,
  nome           VARCHAR(150) NOT NULL,
  turma          VARCHAR(40),
  turno          VARCHAR(20) CHECK (turno IN ('manha', 'tarde', 'noite')),
  email          VARCHAR(150),
  senha_hash     VARCHAR(255) NOT NULL,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por     INTEGER REFERENCES funcionarios(id)
);

-- ------------------------------------------------------------
-- Livros (dados bibliograficos - "titulo" do acervo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS livros (
  id                SERIAL PRIMARY KEY,
  titulo            VARCHAR(255) NOT NULL,
  autor             VARCHAR(255) NOT NULL,
  isbn              VARCHAR(20) UNIQUE,
  editora           VARCHAR(150),
  ano_publicacao    SMALLINT,
  categoria         VARCHAR(80),
  sinopse           TEXT,
  capa_url          VARCHAR(500),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por        INTEGER REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_livros_titulo ON livros (titulo);
CREATE INDEX IF NOT EXISTS idx_livros_autor ON livros (autor);
CREATE INDEX IF NOT EXISTS idx_livros_categoria ON livros (categoria);

-- ------------------------------------------------------------
-- Exemplares (cada copia fisica de um livro = 1 unidade de estoque)
-- Um "livro" (titulo) pode ter varios exemplares.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exemplares (
  id               SERIAL PRIMARY KEY,
  livro_id         INTEGER NOT NULL REFERENCES livros(id) ON DELETE CASCADE,
  codigo_patrimonio VARCHAR(40) UNIQUE,
  status           VARCHAR(20) NOT NULL DEFAULT 'disponivel'
                     CHECK (status IN ('disponivel', 'emprestado', 'reservado', 'manutencao', 'perdido')),
  localizacao      VARCHAR(80), -- ex: "Estante 3 - Prateleira B"
  observacoes      TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exemplares_livro ON exemplares (livro_id);
CREATE INDEX IF NOT EXISTS idx_exemplares_status ON exemplares (status);

-- ------------------------------------------------------------
-- Emprestimos (o que fica "pendente" para o aluno)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emprestimos (
  id                     SERIAL PRIMARY KEY,
  exemplar_id            INTEGER NOT NULL REFERENCES exemplares(id),
  aluno_id               INTEGER NOT NULL REFERENCES alunos(id),
  data_emprestimo        DATE NOT NULL DEFAULT CURRENT_DATE,
  data_prevista_devolucao DATE NOT NULL,
  data_devolucao         DATE,
  status                 VARCHAR(20) NOT NULL DEFAULT 'em_andamento'
                           CHECK (status IN ('em_andamento', 'devolvido', 'atrasado')),
  registrado_por         INTEGER REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_emprestimos_aluno ON emprestimos (aluno_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON emprestimos (status);

-- ------------------------------------------------------------
-- View auxiliar: quantidade disponivel por titulo (usada no catalogo)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW vw_catalogo_livros AS
SELECT
  l.id,
  l.titulo,
  l.autor,
  l.isbn,
  l.editora,
  l.ano_publicacao,
  l.categoria,
  l.sinopse,
  l.capa_url,
  COUNT(e.id) FILTER (WHERE e.status = 'disponivel') AS exemplares_disponiveis,
  COUNT(e.id) AS exemplares_total,
  COUNT(e.id) FILTER (WHERE e.status IN ('perdido', 'manutencao')) AS exemplares_perdidos_danificados
FROM livros l
LEFT JOIN exemplares e ON e.livro_id = l.id
GROUP BY l.id;