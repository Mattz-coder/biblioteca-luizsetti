require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');

const pool = require('./db/pool');
const { router: authRouter } = require('./routes/auth');
const livrosRouter = require('./routes/livros');
const alunosRouter = require('./routes/alunos');
const estoqueRouter = require('./routes/estoque');
const emprestimosRouter = require('./routes/emprestimos');

const app = express();
const emProducao = process.env.NODE_ENV === 'production';

// Necessario no Render (e em qualquer host atras de proxy/load balancer)
// para que o Express reconheca corretamente conexoes HTTPS e os
// cookies "secure" funcionem.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use(
  session({
    store: new pgSession({
      pool,
      createTableIfMissing: true, // cria a tabela "session" sozinho, no primeiro acesso
    }),
    secret: process.env.SESSION_SECRET || 'segredo-de-desenvolvimento',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: emProducao, // exige HTTPS em producao (Render ja fornece)
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  })
);

app.use('/api/auth', authRouter);
app.use('/api/livros', livrosRouter);
app.use('/api/alunos', alunosRouter);
app.use('/api/estoque', estoqueRouter);
app.use('/api/emprestimos', emprestimosRouter);

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.status(404).json({ erro: 'Rota nao encontrada.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Biblioteca Virtual rodando em http://localhost:${PORT}`);
});
