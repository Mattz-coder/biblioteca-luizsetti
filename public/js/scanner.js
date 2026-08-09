// ============================================================
// Leitor de código de barras via câmera do celular/computador.
// Usa a biblioteca html5-qrcode (carregada via CDN nas páginas
// que precisam dela). Funciona junto com leitores físicos
// (pistola USB/Bluetooth), que digitam direto nos campos sem
// precisar desse script.
//
// Funciona tirando uma FOTO (usando a câmera nativa do celular,
// com foco automático de verdade) em vez de decodificar um vídeo
// ao vivo dentro do navegador - mais confiável e sem risco de
// travar numa tela de câmera que não fecha.
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