import { Socket } from "net"
import { networkInterfaces } from "os"

// Detecção sob demanda (botão), não automática em segundo plano — varrer a
// rede sozinho no início pode confundir se pegar o aparelho errado ou achar
// mais de um. Melhor o dono clicar e escolher.

const PORTA_ESCPOS = 9100
const TIMEOUT_MS = 400

function obterSubnetLocal(): string | null {
  const interfaces = networkInterfaces()
  for (const nome of Object.keys(interfaces)) {
    for (const info of interfaces[nome] ?? []) {
      if (info.family === "IPv4" && !info.internal) {
        const partes = info.address.split(".")
        return `${partes[0]}.${partes[1]}.${partes[2]}`
      }
    }
  }
  return null
}

function testarPorta(ip: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let resolvido = false
    const finalizar = (resultado: boolean) => {
      if (resolvido) return
      resolvido = true
      socket.destroy()
      resolve(resultado)
    }
    socket.setTimeout(TIMEOUT_MS)
    socket.once("connect", () => finalizar(true))
    socket.once("timeout", () => finalizar(false))
    socket.once("error", () => finalizar(false))
    socket.connect(PORTA_ESCPOS, ip)
  })
}

export async function detectarImpressorasNaRede(): Promise<string[]> {
  const subnet = obterSubnetLocal()
  if (!subnet) return []

  const testes = Array.from({ length: 254 }, (_, i) => {
    const ip = `${subnet}.${i + 1}`
    return testarPorta(ip).then((aberto) => (aberto ? ip : null))
  })

  const resultados = await Promise.all(testes)
  return resultados.filter((ip): ip is string => ip !== null)
}
