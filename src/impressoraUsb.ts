// Impressora USB não tem IP — não dá pra falar TCP:9100 com ela. O caminho
// no Windows é: instalar como impressora normal (driver "Generic / Text
// Only" funciona pra ESC/POS, já que ele manda os bytes crus sem
// reformatar), compartilhar (mesmo que só pra ela mesma, "localhost") e
// mandar os bytes crus via "copy /b" pro caminho de rede \\localhost\nome —
// mandar direto pelo nome de exibição da impressora (sem compartilhar) não
// funciona no Windows moderno, testado e confirmado.

import { exec } from "child_process"
import { promisify } from "util"
import { writeFile, unlink } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"

const execAsync = promisify(exec)

const NOME_COMPARTILHAMENTO = "BoraAgenteImpressao"

export async function listarImpressorasWindows(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
    )
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  } catch {
    return []
  }
}

// Garante que a impressora escolhida está compartilhada sob um nome fixo
// (BoraAgenteImpressao), pra não depender do nome de exibição (que pode ter
// espaço/acento e complicar o caminho de rede). Chamado uma vez ao salvar a
// configuração, não a cada impressão.
export async function garantirCompartilhada(nomeImpressora: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const comando =
      `powershell -NoProfile -Command "Set-Printer -Name '${nomeImpressora.replace(/'/g, "''")}' ` +
      `-Shared $true -ShareName '${NOME_COMPARTILHAMENTO}'"`
    await execAsync(comando)
    return { ok: true }
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao compartilhar a impressora" }
  }
}

export async function enviarParaImpressoraUsb(dados: Buffer): Promise<void> {
  const arquivoTemp = join(tmpdir(), `bora-comanda-${randomUUID()}.prn`)
  await writeFile(arquivoTemp, dados)
  try {
    const caminhoRede = `\\\\localhost\\${NOME_COMPARTILHAMENTO}`
    const { stdout, stderr } = await execAsync(`cmd /c copy /b "${arquivoTemp}" "${caminhoRede}"`)
    if (stderr && !stdout.includes("copiado")) {
      throw new Error(stderr.trim() || "Falha ao enviar pra impressora")
    }
  } finally {
    await unlink(arquivoTemp).catch(() => {})
  }
}
