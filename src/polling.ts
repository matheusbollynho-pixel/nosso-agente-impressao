import { createClient } from "@supabase/supabase-js"
import { lerConfig, configCompleta, type ConfigAgente } from "./config"
import { montarComanda, type PedidoParaImprimir } from "./escpos"
import { enviarParaImpressora } from "./impressora"
import { enviarParaImpressoraUsb } from "./impressoraUsb"

// Mesma URL/chave pública (anon) já usada no app web do Nosso — não é
// segredo, é a mesma credencial que já vai embutida no bundle do site.
const SUPABASE_URL = "https://bkqbjnmejhziepwlbcny.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrcWJqbm1lamh6aWVwd2xiY255Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDk1NDAsImV4cCI6MjA5OTYyNTU0MH0.iDDWPkIP4eI6WQb6IQ6bvPb2zysaxfk2XxknVuq6TRc"

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type StatusAgente = "ocioso" | "imprimindo" | "erro" | "sem-config"

interface Callbacks {
  onStatus?: (status: StatusAgente, detalhe?: string) => void
}

const INTERVALO_MS = 5000

let rodando = false

export function iniciarPolling(callbacks: Callbacks = {}): void {
  if (rodando) return
  rodando = true
  loop(callbacks)
}

export function pararPolling(): void {
  rodando = false
}

async function loop(callbacks: Callbacks): Promise<void> {
  while (rodando) {
    await processarUmaRodada(callbacks)
    await esperar(INTERVALO_MS)
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

async function enviarComanda(config: ConfigAgente, comanda: Buffer): Promise<void> {
  if (config.tipoConexao === "usb") {
    await enviarParaImpressoraUsb(comanda)
    return
  }
  await enviarParaImpressora(config.impressoraHost, config.impressoraPorta, comanda)
}

async function processarUmaRodada(callbacks: Callbacks): Promise<void> {
  const config = lerConfig()
  if (!configCompleta(config)) {
    callbacks.onStatus?.("sem-config")
    return
  }

  const { data, error } = await supabase.rpc("pedidos_pendentes_impressao", { p_token: config.token })

  if (error) {
    callbacks.onStatus?.("erro", error.message)
    return
  }

  const pedidos = (data ?? []) as PedidoParaImprimir[]
  if (pedidos.length === 0) {
    callbacks.onStatus?.("ocioso")
    return
  }

  // Imprime um de cada vez, em ordem — se um falhar, para a rodada (não
  // pula pro próximo) pra não embaralhar a ordem de chegada na próxima
  // tentativa. Só marca como impresso DEPOIS que o envio pra impressora
  // terminou sem erro — se o agente cair no meio, o pedido continua
  // pendente e é reimpresso na próxima rodada, em vez de sumir.
  for (const pedido of pedidos) {
    try {
      callbacks.onStatus?.("imprimindo")
      const comanda = montarComanda(config.nomeRestaurante, pedido)
      await enviarComanda(config, comanda)

      const { error: erroMarcar } = await supabase.rpc("marcar_pedido_impresso", {
        p_pedido_id: pedido.pedido_id,
        p_token: config.token,
      })
      if (erroMarcar) {
        callbacks.onStatus?.("erro", `Impresso mas não confirmado: ${erroMarcar.message}`)
        return
      }
    } catch (erro) {
      callbacks.onStatus?.("erro", erro instanceof Error ? erro.message : "Falha ao imprimir")
      return
    }
  }

  callbacks.onStatus?.("ocioso")
}

const PEDIDO_TESTE: Omit<PedidoParaImprimir, "criado_em"> = {
  pedido_id: "00000000-0000-0000-0000-000000000000",
  cliente_nome: "Cliente Teste",
  cliente_telefone: "(75) 90000-0000",
  bairro_nome: "Centro",
  endereco: "Rua de Teste",
  numero: "123",
  referencia: "Perto da praça",
  tipo_entrega: "entrega",
  forma_pagamento: "pix",
  troco_para: null,
  valor_total: 25.9,
  mesa_nome: null,
  comanda_cliente: null,
  itens: [
    {
      nome: "X-Burger",
      quantidade: 2,
      observacao: "Sem cebola",
      opcionais: [{ grupoNome: "Adicionais", opcoes: [{ nome: "Bacon", preco: 5 }] }],
    },
    { nome: "Refrigerante Lata", quantidade: 1, observacao: null, opcionais: [] },
  ],
}

export async function imprimirTeste(config: ConfigAgente): Promise<void> {
  const comanda = montarComanda(
    config.nomeRestaurante || "Impressão de teste",
    { ...PEDIDO_TESTE, criado_em: new Date().toISOString() },
  )
  await enviarComanda(config, comanda)
}

// Busca o nome do restaurante direto do banco a partir do token — evita
// depender de digitação manual (e erro de digitação) a cada instalação
// nova, já que o token sozinho já identifica o restaurante.
export async function buscarNomeRestaurante(token: string): Promise<string | null> {
  if (!token) return null
  const { data, error } = await supabase.rpc("nome_restaurante_por_token", { p_token: token })
  if (error || !data) return null
  return data as string
}
