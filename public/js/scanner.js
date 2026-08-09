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
  document.getElementById('scanner-fechar').addEventListener('click', fecharScanner);
}

// Abre a câmera e chama aoLer(texto) assim que detectar um código.
// Fecha a câmera automaticamente após a leitura.
async function abrirScanner(aoLer) {
  garantirModalScanner();

  if (typeof Html5Qrcode === 'undefined') {
    alert('Não foi possível carregar o leitor de câmera. Verifique sua conexão com a internet.');
    return;
  }

  const modal = document.getElementById('scanner-modal');
  modal.hidden = false;

  scannerAtivo = new Html5Qrcode('scanner-camera', {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.QR_CODE,
    ],
  });

  const config = {
    fps: 10,
    qrbox: { width: 280, height: 140 }, // retangulo, melhor formato pra codigo de barras (nao quadrado)
  };

  try {
    await scannerAtivo.start(
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

async function fecharScanner() {
  const modal = document.getElementById('scanner-modal');
  if (scannerAtivo) {
    try {
      await scannerAtivo.stop();
      scannerAtivo.clear();
    } catch (erro) {
      // camera pode ja ter sido parada, ignorar
    }
    scannerAtivo = null;
  }
  if (modal) modal.hidden = true;
}