// public/js/scanner.js
const scannerInput = document.getElementById('scanner-input');
const feedback = document.getElementById('scan-feedback');

const SCAN_MAX_INTERVAL_MS = 50; // intervalo típico entre caracteres de um scanner
let lastKeyTime = 0;
let buffer = '';
let fastStreak = true;

// mantém o campo sempre focado, mesmo que o usuário clique em outro lugar da tela
function refocusScanner() {
  // não rouba o foco se o usuário estiver digitando em um campo de formulário
  const active = document.activeElement;
  const isTyping = active && ['INPUT', 'TEXTAREA'].includes(active.tagName) && active !== scannerInput;
  if (!isTyping) scannerInput.focus();
}

document.addEventListener('click', refocusScanner);
window.addEventListener('load', refocusScanner);

scannerInput.addEventListener('keydown', (e) => {
  const now = Date.now();
  const interval = now - lastKeyTime;

  if (e.key === 'Enter') {
    if (buffer.length > 0 && fastStreak) {
      handleScan(buffer);
    }
    buffer = '';
    fastStreak = true;
    lastKeyTime = now;
    return;
  }

  // se o intervalo entre teclas for grande demais, é digitação humana
  if (buffer.length > 0 && interval > SCAN_MAX_INTERVAL_MS) {
    fastStreak = false;
  }

  if (e.key.length === 1) buffer += e.key;
  lastKeyTime = now;
});

async function handleScan(code) {
  const res = await fetch('/api/barcode/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const result = await res.json();

  if (result.found && result.multiple) {
    showFeedback(`⚠ ${result.items.length} itens bateram com "${code}" — refine a descrição pra ficar único, ou edite pela lista abaixo.`, 'not-found');
    state.items = result.items;
    render();
    return;
  }

  if (result.found) {
    showFeedback(`✔ ${result.item.description} — ${result.item.model} (Qtd: ${result.item.quantity}, Sala: ${result.item.room})`, 'found');
    loadItems();
  } else {
    showFeedback(`✘ Nenhum item encontrado para: ${result.scannedValue}`, 'not-found');
  }
}

function showFeedback(text, cls) {
  feedback.textContent = text;
  feedback.className = `scan-feedback ${cls}`;
  clearTimeout(showFeedback._t);
  showFeedback._t = setTimeout(() => feedback.classList.add('hidden'), 4000);
}
