// ============================================================
// Leitor de código de barras via câmera do celular/computador.
// Usa a biblioteca html5-qrcode (carregada via CDN nas páginas
// que precisam dela). Funciona junto com leitores físicos
// (pistola USB/Bluetooth), que digitam direto nos campos sem
// precisar desse script.
// ============================================================

let scannerAtivo = null;

function garantirModalScanner() {
  if (document.getElementById('scanner-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'scanner-modal';
  modal.className = 'scanner-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="scanner-caixa">
      <div class="scanner-cabecalho">
        <strong>Aponte a câmera para o código de barras</strong>
        <button type="button" id="scanner-fechar" aria-label="Fechar">✕</button>
      </div>
      <div id="scanner-camera"></div>
      <p class="scanner-dica">Funciona com códigos de barras (ISBN) e QR Code.</p>
    </div>
  `;
  document.body.appendChild(modal);

  // Fechar de tres formas diferentes, todas instantaneas:
  // pelo botao X, clicando fora da caixa (no fundo escuro), ou
  // apertando ESC. Nenhuma delas espera a camera responder.
  document.getElementById('scanner-fechar').addEventListener('click', fecharScanner);

  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) fecharScanner();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !modal.hidden) fecharScanner();
  });
}

// Abre a câmera e chama aoLer(texto) assim que detectar um código.
// Fecha a câmera automaticamente após a leitura.
async function abrirScanner(aoLer) {
  garantirModalScanner();

  if (typeof Html5Qrcode === 'undefined') {
    alert('Não foi possível carregar o leitor de câmera. Verifique sua conexão com a internet.');
    return;
  }

  // Se ja havia uma tentativa de camera rodando (ex: usuario abriu
  // duas vezes rapido), garante que ela e descartada antes de comecar
  // uma nova, pra nunca deixar duas instancias disputando a camera.
  if (scannerAtivo) {
    pararCameraEmSegundoPlano(scannerAtivo);
    scannerAtivo = null;
  }

  const modal = document.getElementById('scanner-modal');
  modal.hidden = false;

  const instancia = new Html5Qrcode('scanner-camera', {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.QR_CODE,
    ],
  });
  scannerAtivo = instancia;

  const config = {
    fps: 10,
    qrbox: { width: 280, height: 140 }, // retangulo, melhor formato pra codigo de barras (nao quadrado)
  };

  try {
    await instancia.start(
      { facingMode: 'environment' }, // camera traseira do celular
      config,
      (textoDecodificado) => {
        aoLer(textoDecodificado);
        fecharScanner();
      },
      () => {} // erro de leitura por frame (normal, ignorar - so nao achou nada ainda)
    );
  } catch (erro) {
    console.error('Erro ao iniciar a camera:', erro);
    alert('Não foi possível acessar a câmera: ' + (erro.message || erro));
    fecharScanner();
  }
}

// Fecha a janela IMEDIATAMENTE (nunca espera a camera responder) e
// desliga a camera em segundo plano. Assim, mesmo que a camera trave
// ou demore, o botao de fechar sempre funciona na hora.
function fecharScanner() {
  const modal = document.getElementById('scanner-modal');
  if (modal) modal.hidden = true;

  const instancia = scannerAtivo;
  scannerAtivo = null;
  if (instancia) {
    pararCameraEmSegundoPlano(instancia);
  }
}

function pararCameraEmSegundoPlano(instancia) {
  try {
    instancia
      .stop()
      .then(() => instancia.clear())
      .catch(() => {
        try { instancia.clear(); } catch (e) {}
      });
  } catch (e) {
    // instancia pode ja estar parada/invalida, ignorar
  }
}

// ============================================================
// Alternativa: tirar uma FOTO (usando a câmera nativa do celular,
// com foco automático de verdade) em vez de decodificar um vídeo
// ao vivo. Costuma funcionar melhor em celulares onde o vídeo ao
// vivo do navegador não focaliza bem de perto.
//
// Uso: crie um <input type="file" accept="image/*" capture="environment" hidden>
// e chame vincularInputFoto(input, aoLer) uma vez, passando o input.
// ============================================================

function vincularInputFoto(input, aoLer) {
  input.addEventListener('change', async () => {
    const arquivo = input.files[0];
    input.value = ''; // permite tirar outra foto depois, mesmo com o mesmo nome de arquivo
    if (!arquivo) return;

    if (!document.getElementById('scanner-oculto')) {
      const divOculta = document.createElement('div');
      divOculta.id = 'scanner-oculto';
      divOculta.style.display = 'none';
      document.body.appendChild(divOculta);
    }

    const leitorArquivo = new Html5Qrcode('scanner-oculto', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
    });

    try {
      const resultado = await leitorArquivo.scanFileV2(arquivo, false);
      const texto = typeof resultado === 'string' ? resultado : resultado.decodedText;
      aoLer(texto);
    } catch (erro) {
      console.error('Erro ao ler codigo na foto:', erro);
      alert('Não foi possível encontrar um código de barras nessa foto. Tente tirar de novo, bem de perto e com boa luz.');
    } finally {
      try { leitorArquivo.clear(); } catch (e) {}
    }
  });
}