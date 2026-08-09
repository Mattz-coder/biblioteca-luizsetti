# Biblioteca Virtual — Colégio Luiz Setti

Sistema web para a biblioteca do colégio: login de alunos e funcionários,
catálogo de livros, cadastro de alunos, cadastro de livros e controle de
estoque de exemplares. O backend já é feito para rodar com **PostgreSQL**.

## Estrutura do projeto

```
biblioteca-virtual/
├── db/
│   ├── schema.sql       -> cria todas as tabelas no PostgreSQL
│   ├── seed.js          -> cria o primeiro funcionario (admin)
│   └── pool.js          -> conexão com o banco (usa variáveis de ambiente)
├── routes/
│   ├── auth.js          -> login/logout de aluno e funcionário
│   ├── livros.js        -> catálogo e cadastro de livros
│   ├── alunos.js        -> cadastro e gestão de alunos
│   └── estoque.js       -> controle de estoque (exemplares)
├── public/               -> frontend (HTML/CSS/JS puro, sem framework)
│   ├── index.html        -> tela de login
│   ├── catalogo.html      -> catálogo (alunos e funcionários)
│   ├── admin-livros.html   -> cadastro de livros (funcionário)
│   ├── admin-alunos.html   -> cadastro de alunos (funcionário)
│   ├── admin-estoque.html  -> controle de estoque (funcionário)
│   ├── styles.css
│   └── js/api.js          -> helper de chamadas à API
├── server.js             -> servidor Express
├── package.json
└── .env.example
```

## Passo a passo para rodar localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar o banco de dados PostgreSQL

Crie um banco (ajuste o nome se quiser):

```bash
createdb biblioteca_virtual
```

Copie o arquivo de variáveis de ambiente e ajuste usuário/senha/host do seu PostgreSQL:

```bash
cp .env.example .env
```

Rode o schema para criar as tabelas:

```bash
npm run db:setup
```

### 3. Criar o primeiro funcionário (admin)

Não existe tela de auto-cadastro de funcionário por segurança — o primeiro
acesso é criado por um script. Você pode editar o CPF/nome/senha direto no
`.env` (variáveis `SEED_ADMIN_CPF`, `SEED_ADMIN_NOME`, `SEED_ADMIN_SENHA`) ou
usá-los como estão e trocar depois:

```bash
npm run db:seed
```

Depois de logado, esse funcionário pode cadastrar os demais diretamente no
banco, ou você pode estender o sistema com uma tela de gestão de funcionários
seguindo o mesmo padrão das telas já existentes.

### 4. Rodar o servidor

```bash
npm start
```

Acesse **http://localhost:3000** no navegador.

## Como o sistema funciona

- **Login (`index.html`)**: aluno entra com CGM + senha; funcionário entra
  com CPF + senha. Cada um tem seu próprio popover de login, herdado do
  design original da página.
- **Catálogo (`catalogo.html`)**: qualquer usuário logado (aluno ou
  funcionário) pode buscar livros por título/autor, filtrar por categoria e
  ver quantos exemplares estão disponíveis. Os dados vêm da view
  `vw_catalogo_livros`, que já calcula a disponibilidade a partir da tabela
  de exemplares.
- **Cadastro de livros (`admin-livros.html`)**: só funcionários acessam.
  Cadastra o título (dados bibliográficos) e já permite informar quantos
  exemplares físicos entram no estoque no mesmo cadastro.
- **Cadastro de alunos (`admin-alunos.html`)**: só funcionários acessam.
  Cadastra CGM, nome, turma, turno, e-mail e senha de acesso do aluno; também
  permite redefinir senha e desativar o acesso (exclusão lógica, não apaga o
  histórico do aluno).
- **Controle de estoque (`admin-estoque.html`)**: só funcionários acessam.
  Mostra um resumo por status (disponível, emprestado, reservado, em
  manutenção, perdido), permite adicionar novos exemplares a um livro já
  cadastrado, mudar o status de cada exemplar e remover exemplares
  definitivamente.

## Modelo de dados (resumo)

- `funcionarios` — quem administra o sistema.
- `alunos` — quem consulta o catálogo e pega livros emprestados.
- `livros` — dados bibliográficos de cada título (pode ter vários
  exemplares físicos).
- `exemplares` — cada cópia física de um livro; é a unidade de estoque.
- `emprestimos` — tabela já criada no schema para o próximo passo natural do
  sistema (registrar empréstimo/devolução), ainda sem tela própria.

## Segurança e observações importantes

- Senhas são armazenadas com hash (`bcrypt`), nunca em texto puro.
- A sessão de login usa cookie de sessão (`express-session`). O projeto usa
  o *MemoryStore* padrão, que é ótimo para desenvolvimento, mas **não é
  recomendado em produção** (ele perde as sessões se o servidor reiniciar e
  não funciona com múltiplas instâncias). Para produção, troque por um store
  persistente, por exemplo `connect-pg-simple` (guarda as sessões no próprio
  PostgreSQL).
- Troque `SESSION_SECRET` no `.env` antes de colocar em produção.
- Este projeto não inclui HTTPS — em produção, sirva atrás de um proxy
  (nginx, Caddy etc.) com certificado válido.

## Próximos passos sugeridos

- Tela de empréstimo/devolução (a tabela `emprestimos` já existe no schema).
- Tela de gestão de funcionários (hoje só existe via `db/seed.js` ou SQL
  direto).
- Notificação de livros atrasados.
