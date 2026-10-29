// "Por que alguns dos pinos que eles finalizam a rota toda não ficam verificados" (dono, 29/10).
// Para cada endereço entregue que a nuvem não dá como verificado, o motivo, pelo que o motorista
// deixou gravado naquele dia. A regra de verificar é a da `posicoes` (017 e 022): uma entrega no pino
// que ele seguia, ou duas marcas no mesmo lugar (correção e entrega, duas entregas, duas correções),
// ou a marcação de quem administra. Medido em 16 dias de rotas: Pedro e Luan fecham quase tudo; o
// que falta é a conferência do motorista novo, a entrega longe do pino e as do fim da rota, que
// ainda não subiram.
import {haversine, NO_PINO} from './geo';

export type Motivo = 'aprovar' | 'subindo' | 'longe' | 'so-correcao' | 'sem-marca' | 'nao-batem' | 'nao-conta' | 'separada' | 'recusada' | 'sem-chave';

export interface PacoteDaRota {
  chave_lugar: string | null;
  endereco: string;
  lat: number | null;
  lng: number | null;
  entregue_em: string | null;
}

// passagem (observacoes) ou correção do motorista da rota, no dia dela
export interface MarcaDoDia {
  chave_lugar: string;
  lat: number;
  lng: number;
  criado_em: string;
  pendente?: boolean;
  recusada?: boolean;
  no_pino?: boolean;
}

export interface SemVerificar {
  endereco: string;
  pacotes: number;
  motivo: Motivo;
  // a distância da entrega ao pino, quando foi longe dele
  metros?: number;
}

export interface PortasDaRota {
  entregues: number;
  verificados: number;
  semVerificar: SemVerificar[];
  porEntregar: number;
}

// a marca sobe 10 minutos depois da entrega (o prazo do Desfazer), e a fila anda de minuto em minuto
export const SUBINDO_MIN = 15;

// Na ordem em que aparecem: primeiro o que ele resolve agora, depois o que se resolve sozinho.
export const MOTIVOS: Record<Motivo, {titulo: string; porque: string}> = {
  'aprovar': {titulo: 'Esperando você aprovar', porque: 'O motorista está em conferência: o que ele marca só vale depois que você aprova, em "Em conferência", aqui no Admin.'},
  'subindo': {titulo: 'Entregues há pouco', porque: 'A marca da entrega sobe 10 minutos depois, o tempo do Desfazer. Confira de novo daqui a pouco.'},
  'longe': {titulo: 'Entregues longe do pino', porque: 'Tocou em "Entreguei" (sem o "aqui") a mais de 30 m do pino. Uma entrega longe do pino não diz quem está certo, o pino ou o GPS: a próxima entrega no mesmo lugar verifica. Com "Entreguei aqui", verifica na primeira.'},
  'so-correcao': {titulo: 'Só o pino arrumado, sem a marca da entrega', porque: 'O pino foi arrumado, mas a entrega não deixou a marca do lugar: o GPS estava impreciso na hora, ou o celular ainda não mandou (manda quando ele abrir o app).'},
  'sem-marca': {titulo: 'A entrega não deixou marca do lugar', porque: 'Sem GPS bom na hora, longe demais do pino, ou o celular ainda não mandou (manda quando ele abrir o app).'},
  'nao-batem': {titulo: 'Marcas em lugares diferentes', porque: 'As marcas do dia caem a mais de 30 m uma da outra, e a nuvem não decide qual vale.'},
  'nao-conta': {titulo: 'Marcas que a nuvem não conta', porque: 'As marcas do dia bastariam, mas a nuvem não conta as de motorista desativado.'},
  'separada': {titulo: 'Separadas pelo complemento', porque: 'A porta de cada complemento é guardada à parte da do número, e não entra nesta conta.'},
  'recusada': {titulo: 'Recusadas por você', porque: 'Você recusou a entrega no lugar, em "Em conferência".'},
  'sem-chave': {titulo: 'Endereço sem como guardar a porta', porque: 'Sem número da porta, ou sem CEP nem bairro: não há chave para guardar a porta.'},
};
const ORDEM = Object.keys(MOTIVOS) as Motivo[];

// Os mesmos motivos, falando com o motorista: "Esses dois pinos não verificaram por quê?" (o Luan
// sempre pergunta ao dono, 29/10).
export const MOTIVOS_DO_MOTORISTA: Record<Motivo, {titulo: string; porque: string}> = {
  'aprovar': {titulo: 'Esperando o dono aprovar', porque: 'Você está em conferência: o que você marca vale para os outros depois que o dono aprova.'},
  'subindo': {titulo: 'Entregues há pouco', porque: 'A marca da entrega sobe 10 minutos depois, o tempo do Desfazer. Confira de novo daqui a pouco.'},
  'longe': {titulo: 'Entregues longe do pino', porque: 'Você tocou em "Entreguei" a mais de 30 m do pino. Uma entrega longe do pino não diz quem está certo, o pino ou o GPS: a próxima entrega no mesmo lugar verifica. Na porta, "Entreguei aqui" verifica na primeira.'},
  'so-correcao': {titulo: 'Só o pino arrumado, sem a marca da entrega', porque: 'O pino foi arrumado, mas a entrega não marcou o lugar: o GPS estava impreciso na hora, ou o celular ainda não mandou (veja se há algo "para enviar" no alto da tela).'},
  'sem-marca': {titulo: 'A entrega não marcou o lugar', porque: 'O GPS estava impreciso ou desligado na hora, ou o celular ainda não mandou (veja se há algo "para enviar" no alto da tela).'},
  'nao-batem': {titulo: 'Marcas em lugares diferentes', porque: 'O pino arrumado e a entrega ficaram a mais de 30 m um do outro, e a nuvem não decide qual vale.'},
  'nao-conta': {titulo: 'Marcas que a nuvem não conta', porque: 'As marcas bastariam, mas a nuvem não contou. Fale com o dono.'},
  'separada': {titulo: 'Separadas pelo complemento', porque: 'A porta de cada complemento é guardada à parte da do número.'},
  'recusada': {titulo: 'Recusadas pelo dono', porque: 'O dono recusou a marca desta entrega.'},
  'sem-chave': {titulo: 'Endereço sem como guardar a porta', porque: 'Sem número da porta, ou sem CEP nem bairro: não há como guardar a porta.'},
};

export function porQueNaoVerificou(pacotes: PacoteDaRota[], confirmadas: ReadonlySet<string>, passagens: MarcaDoDia[], correcoes: MarcaDoDia[], agora = Date.now()): PortasDaRota {
  const grupos = new Map<string, PacoteDaRota[]>();
  for (const p of pacotes) {
    const k = p.chave_lugar ?? 'texto:' + p.endereco.trim().toLowerCase();
    grupos.set(k, [...(grupos.get(k) || []), p]);
  }
  const saida: PortasDaRota = {entregues: 0, verificados: 0, semVerificar: [], porEntregar: 0};
  for (const ps of grupos.values()) {
    const feitos = ps.filter(p => p.entregue_em);
    if (!feitos.length) { saida.porEntregar++; continue; }
    saida.entregues++;
    const k = ps[0].chave_lugar;
    if (k && confirmadas.has(k)) { saida.verificados++; continue; }
    const item = (motivo: Motivo, metros?: number): SemVerificar => ({endereco: ps[0].endereco, pacotes: feitos.length, motivo, ...(metros != null ? {metros} : {})});
    if (!k) { saida.semVerificar.push(item('sem-chave')); continue; }
    // separada, a marca vai com o complemento na chave (`chaveDaParada`)
    const daChave = (m: MarcaDoDia) => m.chave_lugar === k || m.chave_lugar.startsWith(k + '|');
    const pas = passagens.filter(daChave), cor = correcoes.filter(daChave);
    const ultima = Math.max(...feitos.map(p => Date.parse(p.entregue_em!)));
    const todas = [...pas, ...cor];
    // O que a `posicoes` contaria com tudo aprovado: a entrega no pino, ou duas marcas a até 30 m.
    // "Esperando você aprovar" só quando aprovar verifica: o César de 29/10 tinha três entregas
    // pendentes a 86 m, 176 m e 1 km do pino, e o "Em conferência" (que só mostra o que muda a
    // porta) estava vazio.
    const verificaria = pas.some(m => m.no_pino) || todas.some((a, i) => todas.some((b, j) => j !== i && haversine(a, b) <= NO_PINO));
    if (todas.length && todas.every(m => m.chave_lugar !== k)) saida.semVerificar.push(item('separada'));
    else if (!pas.length && agora - ultima < SUBINDO_MIN * 60000) saida.semVerificar.push(item('subindo'));
    else if (!pas.length) saida.semVerificar.push(item(cor.length ? 'so-correcao' : 'sem-marca'));
    else if (verificaria && todas.some(m => m.pendente)) saida.semVerificar.push(item('aprovar'));
    else if (pas.some(m => m.recusada)) saida.semVerificar.push(item('recusada'));
    else if (verificaria) saida.semVerificar.push(item('nao-conta'));
    else if (!cor.length) {
      const pino = feitos.find(p => p.lat != null && p.lng != null);
      saida.semVerificar.push(item('longe', pino ? Math.round(haversine({lat: pino.lat!, lng: pino.lng!}, pas[pas.length - 1])) : undefined));
    } else saida.semVerificar.push(item('nao-batem'));
  }
  saida.semVerificar.sort((a, b) => ORDEM.indexOf(a.motivo) - ORDEM.indexOf(b.motivo));
  return saida;
}
