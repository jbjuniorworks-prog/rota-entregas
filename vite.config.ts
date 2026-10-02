import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Cada publicação tem um número, dentro do app e em versao.json ao lado dele: o app aberto há dias
// numa aba do Chrome pergunta qual é a publicada e sabe que ficou para trás (Luan, 02/10).
const VERSAO = {
  id: Date.now().toString(36),
  quando: new Date().toLocaleString('pt-BR', {timeZone: 'America/Maceio', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}),
};

export default defineConfig({
  root: 'app',
  base: './',
  define: {__VERSAO__: JSON.stringify(VERSAO)},
  plugins: [react(), {
    name: 'versao',
    generateBundle() { this.emitFile({type: 'asset', fileName: 'versao.json', source: JSON.stringify(VERSAO)}); },
  }],
  build: {outDir: '../dist', emptyOutDir: true},
  server: {host: '127.0.0.1', port: 5173},
  preview: {host: '127.0.0.1', port: 4173},
});
