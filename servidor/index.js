// Ponto de entrada: migra o banco, sobe o servidor e as rotinas (lembretes, e-mails, limpeza).
import { criarApp } from './app.js';
import { config } from './config.js';
import { fecharPool } from './db/index.js';
import { migrar } from './db/migrar.js';
import { semear } from './db/semear.js';
import { log } from './lib/log.js';
import { iniciarRotinas, pararRotinas } from './servicos/rotinas.js';

if (config.autoMigrar) {
  await migrar();
  await semear();
}

const servidor = criarApp().listen(config.porta, () => {
  log.info('servidor_no_ar', { porta: config.porta, url: config.appUrl, producao: config.producao });
});
iniciarRotinas();

let encerrando = false;
async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  log.info('encerrando', { sinal });
  pararRotinas();
  servidor.close(async () => {
    await fecharPool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
