import {acharNaParada, peneiraDaNuvem} from '../logica/busca';
import type {Parada} from '../logica/tipos';
import {nuvem} from './nuvem';

// As entregas dos dias anteriores, para o B.O. que chega depois do resetar (pedido de 02/10). O
// celular só guarda a rota de hoje; a nuvem guarda todo pacote de planilha, com o código, a hora
// em que foi marcado entregue e o ponto do GPS na porta. O banco já deixa cada motorista ver só
// as próprias rotas, e quem administra ver todas.

export interface EntregaAntiga {
  codigo: string | null;
  endereco: string;
  bairro: string | null;
  dia: string;
  entregueEm: string | null;
  motorista: string | null;
  // onde ele marcou a entrega (o GPS da porta), ou, sem isso, a posição que a planilha deu
  ponto: {lat: number; lng: number; daEntrega: boolean} | null;
}

// a peneira da nuvem é larga; destes, o celular escolhe com a regra de verdade
const PENEIRA = 200;
const MOSTRAR = 30;
const diaLocal = (t: string) => new Date(t).toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});

export async function buscarNosDiasAnteriores(busca: string, deHoje: Set<string>): Promise<EntregaAntiga[]> {
  const s = nuvem.cliente;
  const peneira = peneiraDaNuvem(busca);
  if (!s || !nuvem.sessao) throw new Error('entre na conta para procurar nos dias anteriores');
  if (!peneira) return [];
  const {data, error} = await s.from('pacotes')
    .select('spx_tn, endereco, bairro, cep, lat, lng, chave_lugar, entregue_em, criado_em, rotas!inner(dia, motorista_id, perfis(nome))')
    .or(peneira).order('criado_em', {ascending: false}).limit(PENEIRA);
  if (error) throw new Error(error.message);
  const achadas = ((data || []) as any[]).filter(p => {
    if (p.spx_tn && deHoje.has(p.spx_tn)) return false;
    const comoParada = {texto: p.endereco + (p.cep ? `, CEP ${p.cep}` : ''), bairro: p.bairro || '', pacotes: p.spx_tn ? [p.spx_tn] : [], ml: null, stop: null} as unknown as Parada;
    return acharNaParada(comoParada, busca) !== null;
  }).slice(0, MOSTRAR);
  // o GPS da entrega: a passagem do mesmo lugar, do mesmo motorista, no dia em que ele marcou
  const chaves = [...new Set(achadas.filter(p => p.chave_lugar && p.entregue_em).map(p => p.chave_lugar as string))];
  const portas = new Map<string, {lat: number; lng: number}>();
  if (chaves.length) {
    const {data: obs, error: e2} = await s.from('observacoes').select('chave_lugar, motorista_id, dia, lat, lng').in('chave_lugar', chaves);
    if (e2) throw new Error(e2.message);
    for (const o of (obs || []) as any[]) portas.set(`${o.chave_lugar}|${o.motorista_id}|${o.dia}`, {lat: o.lat, lng: o.lng});
  }
  return achadas.map(p => {
    const porta = p.entregue_em && p.chave_lugar ? portas.get(`${p.chave_lugar}|${p.rotas.motorista_id}|${diaLocal(p.entregue_em)}`) : undefined;
    return {
      codigo: p.spx_tn, endereco: p.endereco, bairro: p.bairro, dia: p.rotas.dia, entregueEm: p.entregue_em,
      motorista: p.rotas.perfis?.nome || null,
      ponto: porta ? {...porta, daEntrega: true} : p.lat != null ? {lat: p.lat, lng: p.lng, daEntrega: false} : null,
    };
  });
}
