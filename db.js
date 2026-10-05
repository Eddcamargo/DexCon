// db.js
// Camada de banco de dados isolada. Nenhuma dependência do Express aqui —
// só SQLite + funções puras. Facilita debug: se algo quebrar no banco,
// o problema está neste arquivo, não no server.

const Database = require('better-sqlite3');
const path = require('path');

// Quando empacotado com pkg (virando .exe), __dirname aponta pra dentro do
// executável, que não é gravável. Nesse caso, salvamos o banco do lado de
// fora, na mesma pasta do .exe. Rodando normal com "node server.js", nada muda.
const dbDir = process.pkg ? path.dirname(process.execPath) : __dirname;
const db = new Database(path.join(dbDir, 'inventario.db'));
db.pragma('journal_mode = WAL'); // melhora concorrência com vários usuários lendo/escrevendo ao mesmo tempo

// ---------------------------------------------------------------------
// SCHEMA
// ---------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,  -- característica/descrição do item
    model TEXT NOT NULL,
    brand TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    room TEXT NOT NULL DEFAULT 'sala1',
    barcode TEXT UNIQUE,        -- valor único interno, embutido no QR
    tags TEXT,                  -- palavras-chave separadas por vírgula, geradas automaticamente
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
  CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
`);

// ---------------------------------------------------------------------
// TAGS DINÂMICAS
// Quebra model + brand em palavras normalizadas (sem acento, minúsculas,
// sem duplicatas) para permitir busca/filtro intuitivo no frontend.
// ---------------------------------------------------------------------
function normalizeWord(w) {
  return w
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '');
}

// Igual normalizeWord, mas preserva espaços entre palavras — usado na busca,
// que precisa comparar frases inteiras ("disjuntor bipolar 16a weg"), não
// só uma palavra isolada.
function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateTags(description, model, brand) {
  const words = `${description} ${model} ${brand}`.split(/\s+/).map(normalizeWord).filter(Boolean);
  return [...new Set(words)].join(',');
}

// ---------------------------------------------------------------------
// GERAÇÃO DE CÓDIGO DE BARRAS (valor, não a imagem — isso fica em routes/barcode.js)
// Formato: INV + id com zero-padding, ex: INV000123
// ---------------------------------------------------------------------
function makeBarcodeValue(id) {
  return `INV${String(id).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------

function addItem({ description, model, brand, quantity = 0, room = 'sala1' }) {
  const tags = generateTags(description, model, brand);
  const insert = db.prepare(`
    INSERT INTO items (description, model, brand, quantity, room, tags)
    VALUES (@description, @model, @brand, @quantity, @room, @tags)
  `);
  const info = insert.run({ description, model, brand, quantity, room, tags });
  const id = info.lastInsertRowid;

  // agora que temos o id, geramos e gravamos o código de barras
  const barcode = makeBarcodeValue(id);
  db.prepare(`UPDATE items SET barcode = ? WHERE id = ?`).run(barcode, id);

  return getItemById(id);
}

function updateItem(id, fields) {
  const current = getItemById(id);
  if (!current) return null;

  const description = fields.description ?? current.description;
  const model = fields.model ?? current.model;
  const brand = fields.brand ?? current.brand;
  const quantity = fields.quantity ?? current.quantity;
  const room = fields.room ?? current.room;
  const tags = generateTags(description, model, brand);

  db.prepare(`
    UPDATE items
    SET description = ?, model = ?, brand = ?, quantity = ?, room = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(description, model, brand, quantity, room, tags, id);

  return getItemById(id);
}

// Ajuste rápido de quantidade (usado no fluxo de scanner: +1 / -1 / valor customizado)
function adjustQuantity(id, delta) {
  const item = getItemById(id);
  if (!item) return null;
  const newQty = Math.max(0, item.quantity + delta);
  db.prepare(`UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newQty, id);
  return getItemById(id);
}

function removeItem(id) {
  return db.prepare(`DELETE FROM items WHERE id = ?`).run(id).changes > 0;
}

function getItemById(id) {
  return db.prepare(`SELECT * FROM items WHERE id = ?`).get(id) || null;
}

function getItemByBarcode(barcode) {
  return db.prepare(`SELECT * FROM items WHERE barcode = ?`).get(barcode) || null;
}

function getAllItems({ room, search } = {}) {
  let query = `SELECT * FROM items WHERE 1=1`;
  const params = [];

  if (room) {
    query += ` AND room = ?`;
    params.push(room);
  }

  query += ` ORDER BY updated_at DESC`;
  let items = db.prepare(query).all(...params);

  if (search) {
    // quebra a busca em palavras — cada uma precisa aparecer em algum lugar
    // (descrição, modelo, marca ou tags), na ordem que for, pra "disjuntor weg"
    // e "weg disjuntor" darem o mesmo resultado.
    const searchWords = normalizeText(search).split(' ').filter(Boolean);

    items = items.filter(item => {
      const haystack = normalizeText(`${item.description} ${item.model} ${item.brand} ${item.tags}`);
      return searchWords.every(word => haystack.includes(word));
    });
  }

  return items;
}

function getRooms() {
  return db.prepare(`SELECT DISTINCT room FROM items ORDER BY room`).all().map(r => r.room);
}

// Usado na importação de CSV: se vier um id que já existe, atualiza;
// caso contrário (sem id, ou id de outro banco que não existe aqui), cria um item novo.
// Isso é o que torna a importação "modular" entre bancos diferentes.
function upsertFromImport({ id, description, model, brand, quantity, room }) {
  if (id && getItemById(id)) {
    return updateItem(id, { description, model, brand, quantity, room });
  }
  return addItem({ description, model, brand, quantity, room });
}

module.exports = {
  addItem,
  updateItem,
  adjustQuantity,
  removeItem,
  getItemById,
  getItemByBarcode,
  getAllItems,
  getRooms,
  makeBarcodeValue,
  upsertFromImport,
};
