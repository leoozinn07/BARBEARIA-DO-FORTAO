// Entrada na Vercel: o mesmo app Express do servidor comum, sem listen() e sem relógio (veja vercel.json e servidor/servicos/rotinas.js).
import { criarApp } from '../servidor/app.js';

export default criarApp();
