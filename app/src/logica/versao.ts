// O que fazer quando a versão publicada não é a que está rodando. A aba do Chrome fica aberta por
// dias sem recarregar: o Luan leu a planilha de 02/10 com a versão de antes da véspera.
// - recarregar: nenhuma entrega pendente (começo do dia, rota terminada) e ele parado. Parado é o
//   app acabando de abrir, ou voltando depois de muito tempo fora. Quem saiu há um minuto pode
//   estar voltando do seletor de arquivos com a planilha na mão, e recarregar perderia a escolha;
// - avisar: tem rota andando, ou ele está no meio de alguma coisa. Recarregar não perde a rota
//   (ela está guardada no aparelho), mas a hora é ele quem escolhe.
// Cada versão só é recarregada sozinha uma vez por sessão: logo depois de publicar, o servidor
// ainda pode devolver a página antiga por até 10 minutos, e recarregar de novo viraria laço.
export type Decisao = 'nada' | 'recarregar' | 'avisar';

export function oQueFazerComAVersao(rodando: string, publicada: string | null | undefined, pendentes: number,
  jaTentada: string | null, parado: boolean): Decisao {
  if (!publicada || publicada === rodando) return 'nada';
  return parado && pendentes === 0 && jaTentada !== publicada ? 'recarregar' : 'avisar';
}
