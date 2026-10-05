// public/js/inventory.js

const state = {
  items: [],
  view: 'list',
  room: '',
  search: '',
};

const container = document.getElementById('items-container');
const searchInput = document.getElementById('search-input');
const roomFilter = document.getElementById('room-filter');
const viewButtons = document.querySelectorAll('.view-btn');

// ---------------------------------------------------------------------
// CARREGAMENTO DE DADOS
// ---------------------------------------------------------------------

async function loadRooms() {
  const res = await fetch('/api/items/rooms');
  const rooms = await res.json();

  roomFilter.innerHTML = '<option value="">Todas as salas</option>' +
    rooms.map(r => `<option value="${r}">${r}</option>`).join('');

  const datalist = document.getElementById('room-suggestions');
  if (datalist) datalist.innerHTML = rooms.map(r => `<option value="${r}">`).join('');
}

async function loadItems() {
  const params = new URLSearchParams();
  if (state.room) params.set('room', state.room);
  if (state.search) params.set('search', state.search);

  const res = await fetch(`/api/items?${params.toString()}`);
  state.items = await res.json();
  render();
}

// ---------------------------------------------------------------------
// RENDERIZAÇÃO
// ---------------------------------------------------------------------

function render() {
  container.className = `view-${state.view}`;
  container.innerHTML = '';

  if (state.items.length === 0) {
    container.innerHTML = '<p style="padding:24px;color:#888;">Nenhum item encontrado.</p>';
    return;
  }

  state.items.forEach(item => container.appendChild(renderItemCard(item)));
}

function renderItemCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card';

  const tags = (item.tags || '').split(',').filter(Boolean)
    .map(t => `<span class="tag">${t}</span>`).join('');

  const detailedExtra = state.view === 'detailed'
    ? `<div>Código: ${item.barcode}</div><div>Atualizado: ${new Date(item.updated_at).toLocaleString('pt-BR')}</div>`
    : '';

  card.innerHTML = `
    <div class="item-info">
      <strong>${item.description}</strong>
      <div style="font-size:13px;color:#666;">${item.model} — ${item.brand}</div>
      <div style="font-size:13px;color:#666;">Sala: ${item.room} · Qtd: <span class="qty-value">${item.quantity}</span></div>
      <div class="item-tags">${tags}</div>
      ${detailedExtra}
    </div>
    <div class="item-actions">
      <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
      <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
      <button class="btn" data-action="label" data-id="${item.id}">Etiqueta</button>
      <button class="btn" data-action="duplicate" data-id="${item.id}">Duplicar</button>
      <button class="btn" data-action="edit" data-id="${item.id}">Editar</button>
      <button class="btn" data-action="delete" data-id="${item.id}">Remover</button>
    </div>
  `;
  return card;
}

// ---------------------------------------------------------------------
// AÇÕES NOS CARDS (delegação de evento)
// ---------------------------------------------------------------------

container.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'inc' || action === 'dec') {
    const delta = action === 'inc' ? 1 : -1;
    const res = await fetch(`/api/items/${id}/adjust`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta }),
    });
    const updated = await res.json();
    const item = state.items.find(i => String(i.id) === id);
    if (item) item.quantity = updated.quantity;
    render();
  }

  if (action === 'delete') {
    if (!confirm('Remover este item do estoque?')) return;
    await fetch(`/api/items/${id}`, { method: 'DELETE' });
    loadItems();
  }

  if (action === 'edit') {
    const item = state.items.find(i => String(i.id) === id);
    openModal(item);
  }

  if (action === 'duplicate') {
    const item = state.items.find(i => String(i.id) === id);
    // abre o modal já preenchido com os dados do item de origem, mas SEM id —
    // ao salvar, cria um item novo. O usuário edita o que for diferente antes de salvar.
    openModal({ ...item, id: null });
  }

  if (action === 'label') {
    openLabelModal(id);
  }
});

// ---------------------------------------------------------------------
// FILTROS / BUSCA / VIEW
// ---------------------------------------------------------------------

let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.search = searchInput.value.trim();
    loadItems();
  }, 250); // debounce simples
});

roomFilter.addEventListener('change', () => {
  state.room = roomFilter.value;
  loadItems();
});

viewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    viewButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.view = btn.dataset.view;
    render();
  });
});

// ---------------------------------------------------------------------
// MODAL DE CADASTRO/EDIÇÃO
// ---------------------------------------------------------------------

const modal = document.getElementById('item-modal');
const form = document.getElementById('item-form');

function openModal(item = null) {
  const hasId = item && item.id;
  document.getElementById('modal-title').textContent = hasId ? 'Editar item' : 'Novo item';
  document.getElementById('item-id').value = hasId ? item.id : '';
  document.getElementById('field-description').value = item ? item.description : '';
  document.getElementById('field-model').value = item ? item.model : '';
  document.getElementById('field-brand').value = item ? item.brand : '';
  document.getElementById('field-quantity').value = item ? item.quantity : 0;
  document.getElementById('field-room').value = item ? item.room : 'sala1';
  modal.classList.remove('hidden');
}

document.getElementById('btn-open-add').addEventListener('click', () => openModal());
document.getElementById('btn-cancel').addEventListener('click', () => modal.classList.add('hidden'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('item-id').value;

  const payload = {
    description: document.getElementById('field-description').value.trim(),
    model: document.getElementById('field-model').value.trim(),
    brand: document.getElementById('field-brand').value.trim(),
    quantity: Number(document.getElementById('field-quantity').value) || 0,
    room: document.getElementById('field-room').value.trim() || 'sala1',
  };

  if (id) {
    await fetch(`/api/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  modal.classList.add('hidden');
  await loadRooms();
  await loadItems();
});

// ---------------------------------------------------------------------
// EXPORTAR / IMPORTAR CSV
// ---------------------------------------------------------------------

document.getElementById('btn-export').addEventListener('click', () => {
  window.location.href = '/api/items/export';
});

document.getElementById('csv-import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const res = await fetch('/api/items/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: text,
  });
  const result = await res.json();

  let msg = `Importação concluída: ${result.created} criados, ${result.updated} atualizados.`;
  if (result.errors && result.errors.length > 0) {
    msg += `\n\nAvisos:\n${result.errors.join('\n')}`;
  }
  alert(msg);

  e.target.value = ''; // permite importar o mesmo arquivo de novo se precisar
  await loadRooms();
  await loadItems();
});

// ---------------------------------------------------------------------
// INICIALIZAÇÃO
// ---------------------------------------------------------------------

loadRooms();
loadItems();
