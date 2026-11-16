import {CHAVES} from '../logica/guarda';
import {conferirRomaneio, pacotesDoRomaneio, type Conferencia} from '../logica/romaneio';
import {guarda, status} from '../loja';
import {linhasDaPlanilha} from '../servicos/arquivos';
import {meiosDosBairrosDoCenso} from '../servicos/ibge';
import {contar} from './base';

// O romaneio do galpão na hora de pegar a rota (dono, 16/11): o que parece fora de rota, para
// avisar os analistas antes de sair. Nada disto vai para a nuvem.
export async function conferirOArquivo(f: Blob): Promise<Conferencia> {
  contar('romaneio');
  const [linhas, meios] = await Promise.all([linhasDaPlanilha(f), meiosDosBairrosDoCenso()]);
  return conferirRomaneio(pacotesDoRomaneio(linhas), meios);
}

// A gaiola fica no celular de quem a digitou: no dia seguinte, a tela já abre nela.
export const gaiolaGuardada = (): string => guarda.ler<string>(CHAVES.gaiola, '') || '';
export const guardarGaiola = (g: string) => guarda.gravar(CHAVES.gaiola, g.trim().toUpperCase());

export async function copiarParaAnalistas(texto: string) {
  contar('romaneio-copiar');
  try {
    await navigator.clipboard.writeText(texto);
    status('Lista copiada. Cole no WhatsApp dos analistas.', 3000);
  } catch {
    status('Não consegui copiar.', 3000);
  }
}
