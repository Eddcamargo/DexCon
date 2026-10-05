// server.js
// Ponto de entrada: só Express, rotas e o listen. Toda lógica de dados
// está em db.js, toda lógica de negócio nas rotas em /routes.

const express = require('express');
const path = require('path');
const os = require('os');

const inventoryRoutes = require('./routes/inventory');
const barcodeRoutes = require('./routes/barcode');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/items', inventoryRoutes);
app.use('/api/barcode', barcodeRoutes);

// Qualquer rota /api/* que não bateu em nada acima -> 404 em JSON, não HTML
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratador de erro central: qualquer exceção não tratada em uma rota cai aqui.
// Sem isso, o Express devolve uma página HTML de erro, e o frontend quebra
// tentando fazer JSON.parse() nela.
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

// Função para capturar o IP local da máquina na rede
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const nomeDaInterface in interfaces) {
    for (const detalhes of interfaces[nomeDaInterface]) {
      // Verifica se é IPv4 e não é um endereço interno (como 127.0.0.1)
      const isIPv4 = detalhes.family === 'IPv4' || detalhes.family === 4;
      if (isIPv4 && detalhes.internal === false) {
        return detalhes.address;
      }
    }
  }
  return 'localhost'; // Fallback caso não encontre nenhum IP de rede
}

// Inicialização do Servidor Express vinculando a interface '0.0.0.0' (Acesso externo liberado)
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`============================================================`);
  console.log(` SERVIDOR OPERACIONAL ATIVO COM SUCESSO!`);
  console.log(` Acesso na Máquina Local:  http://localhost:${PORT}`);
  console.log(` Acesso de Outros Dispositivos: http://${localIP}:${PORT}`);
  console.log(`============================================================`);
});
