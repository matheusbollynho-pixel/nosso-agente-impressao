// Monta o buffer ESC/POS da comanda. Gerado na mão (sem lib externa) pra não
// depender de binding nativo — texto puro + os poucos comandos necessários
// (inicializar, cortar papel). Largura fixa em 32 colunas (papel 58mm, o
// tipo mais comum em impressora térmica barata) — ajustar quando confirmar
// o modelo real. Acentos são removidos porque a codepage padrão da maioria
// das impressoras baratas não é UTF-8; sem confirmar o modelo, é mais
// seguro perder o acento do que arriscar caractere quebrado.

export interface ItemPedidoImpressao {
  nome: string
  quantidade: number
  observacao: string | null
  opcionais: { grupoNome: string; opcoes: { nome: string; preco: number }[] }[] | null
}

export interface PedidoParaImprimir {
  pedido_id: string
  cliente_nome: string | null
  cliente_telefone: string | null
  bairro_nome: string | null
  endereco: string | null
  numero: string | null
  referencia: string | null
  tipo_entrega: string
  forma_pagamento: string
  troco_para: number | null
  valor_total: number
  criado_em: string
  itens: ItemPedidoImpressao[]
  mesa_nome: string | null
  comanda_cliente: string | null
}

const LARGURA = 32
const ESC = 0x1b
const GS = 0x1d

const rotuloFormaPagamento: Record<string, string> = {
  pix: "Pix",
  cartao: "Cartao",
  dinheiro: "Dinheiro",
  maquininha: "Maquininha na entrega",
}

function removerAcentos(texto: string): string {
  const codigoInicio = 0x0300
  const codigoFim = 0x036f
  let resultado = ""
  for (const caractere of texto.normalize("NFD")) {
    const codigo = caractere.codePointAt(0) ?? 0
    if (codigo < codigoInicio || codigo > codigoFim) resultado += caractere
  }
  return resultado
}

function formatarPreco(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`
}

function centralizar(texto: string): string {
  const t = removerAcentos(texto).slice(0, LARGURA)
  const espacos = Math.max(0, Math.floor((LARGURA - t.length) / 2))
  return " ".repeat(espacos) + t
}

// `recuo` é aplicado depois da quebra (não embutido no texto de entrada) —
// se fosse embutido, o split(" ") usado pra quebrar palavra por palavra
// colapsaria os espaços extras e o recuo desapareceria.
function quebrarLinha(texto: string, recuo = 0, largura = LARGURA): string[] {
  const larguraUtil = largura - recuo
  const prefixo = " ".repeat(recuo)
  const palavras = removerAcentos(texto).split(" ")
  const linhas: string[] = []
  let atual = ""
  for (const palavra of palavras) {
    const tentativa = (atual + " " + palavra).trim()
    if (tentativa.length > larguraUtil) {
      if (atual) linhas.push(prefixo + atual)
      atual = palavra
    } else {
      atual = tentativa
    }
  }
  if (atual) linhas.push(prefixo + atual)
  return linhas.length > 0 ? linhas : [prefixo]
}

const SEPARADOR = "-".repeat(LARGURA)
const DUPLO = "=".repeat(LARGURA)

export function montarComanda(nomeRestaurante: string, pedido: PedidoParaImprimir): Buffer {
  const linhas: string[] = []

  linhas.push(centralizar(nomeRestaurante || "Nosso"))
  linhas.push(DUPLO)
  linhas.push(`Pedido #${pedido.pedido_id.slice(0, 8)}`)
  linhas.push(new Date(pedido.criado_em).toLocaleString("pt-BR"))
  linhas.push(SEPARADOR)

  if (pedido.tipo_entrega === "mesa") {
    linhas.push(centralizar(removerAcentos(pedido.mesa_nome ?? "Mesa")))
    linhas.push(removerAcentos(`Comanda: ${pedido.comanda_cliente ?? "-"}`))
  } else {
    linhas.push(removerAcentos(`Cliente: ${pedido.cliente_nome ?? "-"}`))
    if (pedido.cliente_telefone) linhas.push(removerAcentos(`Tel: ${pedido.cliente_telefone}`))

    if (pedido.tipo_entrega === "retirada") {
      linhas.push("RETIRADA NO LOCAL")
    } else {
      const endereco = [pedido.endereco, pedido.numero].filter(Boolean).join(", ")
      if (endereco) quebrarLinha(endereco).forEach((l) => linhas.push(l))
      if (pedido.bairro_nome) linhas.push(removerAcentos(pedido.bairro_nome))
      if (pedido.referencia) quebrarLinha(`Ref: ${pedido.referencia}`).forEach((l) => linhas.push(l))
    }
  }

  linhas.push(SEPARADOR)
  for (const item of pedido.itens) {
    quebrarLinha(`${item.quantidade}x ${item.nome}`).forEach((l) => linhas.push(l))
    for (const grupo of item.opcionais ?? []) {
      const nomesOpcoes = grupo.opcoes.map((o) => o.nome).join(", ")
      if (nomesOpcoes) quebrarLinha(`${grupo.grupoNome}: ${nomesOpcoes}`, 2).forEach((l) => linhas.push(l))
    }
    if (item.observacao) quebrarLinha(`Obs: ${item.observacao}`, 2).forEach((l) => linhas.push(l))
  }

  linhas.push(SEPARADOR)
  if (pedido.tipo_entrega !== "mesa") {
    linhas.push(removerAcentos(`Pagamento: ${rotuloFormaPagamento[pedido.forma_pagamento] ?? pedido.forma_pagamento}`))
    if (pedido.forma_pagamento === "dinheiro" && pedido.troco_para) {
      linhas.push(`Troco para: ${formatarPreco(pedido.troco_para)}`)
    }
  }
  linhas.push(DUPLO)
  linhas.push(`TOTAL: ${formatarPreco(pedido.valor_total)}`)
  linhas.push(DUPLO)
  linhas.push("")
  linhas.push("")

  const texto = linhas.join("\n") + "\n"

  return Buffer.concat([
    Buffer.from([ESC, 0x40]), // inicializa a impressora
    Buffer.from(texto, "ascii"),
    Buffer.from([GS, 0x56, 0x00]), // corte total do papel
  ])
}
