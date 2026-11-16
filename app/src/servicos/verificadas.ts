import {minhasPortas, type MarcaDoDia, type MinhaRota, type MinhasPortas, type PacoteDaRota} from '../logica/verificacao';
import {nuvem} from './nuvem';
import {falhou, paginado, pedacos} from './paginado';

// O mesmo período do "Portas verificadas por motorista" do Admin, para os números baterem.
export const DIAS_DAS_PORTAS = 14;

// As portas verificadas das rotas do próprio motorista (Luan, pelo dono, 15/11). O banco já deixa
// cada motorista ver só as próprias rotas, mas para quem administra ele abre todas: o filtro pela
// conta é o que faz a tela do dono mostrar só as rotas dele.
export async function minhasPortasVerificadas(agora = Date.now()): Promise<MinhasPortas> {
  const s = nuvem.cliente, eu = nuvem.sessao?.user.id;
  if (!s || !eu) throw new Error('entre na conta para ver as suas portas');
  // o mesmo corte do Admin (`listarRotasDoPeriodo`)
  const desde = new Date(agora - DIAS_DAS_PORTAS * 864e5).toISOString().slice(0, 10);
  const rotas = await paginado<MinhaRota>((de, ate) => s.from('rotas').select('id, dia, arquivo')
    .eq('motorista_id', eu).gte('dia', desde).order('dia', {ascending: false}).order('id').range(de, ate));
  const pacotes: (PacoteDaRota & {rota_id: string})[] = [];
  for (const parte of pedacos(rotas.map(r => r.id), 50)) {
    pacotes.push(...await paginado<PacoteDaRota & {rota_id: string}>((de, ate) => s.from('pacotes')
      .select('rota_id, chave_lugar, endereco, lat, lng, entregue_em').in('rota_id', parte).order('id').range(de, ate)));
  }
  const chaves = [...new Set(pacotes.filter(p => p.entregue_em).map(p => p.chave_lugar).filter((k): k is string => !!k))];
  const confirmadas = new Set<string>();
  // a `posicoes` recusa mais de 500 chaves de uma vez
  for (const parte of pedacos(chaves, 500)) {
    const {data, error} = await s.rpc('posicoes', {chaves: parte});
    falhou(error);
    for (const p of (data || []) as {chave_lugar: string; situacao: string}[]) if (p.situacao === 'confirmado') confirmadas.add(p.chave_lugar);
  }
  // `*`: o `pendente` e o `recusada` só existem depois da 022
  const [passagens, correcoes] = await Promise.all([
    paginado<MarcaDoDia & {dia: string}>((de, ate) => s.from('observacoes').select('*').eq('motorista_id', eu).gte('dia', desde).order('id').range(de, ate)),
    paginado<MarcaDoDia>((de, ate) => s.from('correcoes').select('*').eq('motorista_id', eu).gte('criado_em', `${desde}T03:00:00.000Z`).order('id').range(de, ate)),
  ]);
  return minhasPortas(rotas, pacotes, confirmadas, passagens, correcoes, agora);
}
