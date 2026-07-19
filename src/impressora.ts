import { Socket } from "net"

// Impressora térmica de rede fala o protocolo "raw/JetDirect" — só aceita
// os bytes ESC/POS direto na porta 9100, sem handshake nenhum. Mesma coisa
// que os simuladores de teste (virtual-thermal-printer etc.) esperam.
export function enviarParaImpressora(host: string, porta: number, dados: Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let finalizado = false

    const finalizarComErro = (erro: Error) => {
      if (finalizado) return
      finalizado = true
      socket.destroy()
      reject(erro)
    }

    socket.setTimeout(timeoutMs)
    socket.once("timeout", () => finalizarComErro(new Error("Tempo esgotado ao conectar na impressora")))
    socket.once("error", (erro) => finalizarComErro(erro))

    socket.connect(porta, host, () => {
      socket.write(dados, (erro) => {
        if (erro) {
          finalizarComErro(erro)
          return
        }
        socket.end()
      })
    })

    socket.once("close", () => {
      if (finalizado) return
      finalizado = true
      resolve()
    })
  })
}
