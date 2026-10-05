// public/js/barcode.js
// Abre o preview da etiqueta (QR Code) gerada pelo servidor e dispara a impressão.

const labelModal = document.getElementById('label-modal');
const labelQrcode = document.getElementById('label-qrcode');

function openLabelModal(itemId) {
  labelQrcode.src = `/api/barcode/qrcode/${itemId}?t=${Date.now()}`;
  labelModal.classList.remove('hidden');
}

document.getElementById('btn-close-label').addEventListener('click', () => {
  labelModal.classList.add('hidden');
});

document.getElementById('btn-print-label').addEventListener('click', () => {
  const printWindow = window.open('', '_blank', 'width=400,height=300');
  printWindow.document.write(`
    <html>
      <head><title>Etiqueta</title></head>
      <body style="text-align:center; font-family: sans-serif;">
        <img src="${labelQrcode.src}" style="max-width:200px;" />
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
});
