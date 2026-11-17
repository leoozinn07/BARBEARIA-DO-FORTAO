// Garante tabelas e carga inicial uma vez por processo (no servidor comum, antes de subir; na Vercel, no primeiro pedido).
import { config } from '../config.js';
import { migrar } from './migrar.js';
import { semear } from './semear.js';

let pronto = null;

export function prepararBanco() {
  if (!config.autoMigrar) return Promise.resolve();
  // Se falhar (banco fora do ar, senha errada), o próximo pedido tenta de novo
  pronto ||= (async () => { await migrar(); await semear(); })().catch((e) => { pronto = null; throw e; });
  return pronto;
}
