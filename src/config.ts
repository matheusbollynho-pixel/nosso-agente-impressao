import { app } from "electron"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

export type TipoConexaoImpressora = "rede" | "usb"

export interface ConfigAgente {
  token: string
  nomeRestaurante: string
  enderecoRestaurante: string
  telefoneRestaurante: string
  tipoConexao: TipoConexaoImpressora
  impressoraHost: string
  impressoraPorta: number
  impressoraUsbNome: string
}

const CONFIG_PADRAO: ConfigAgente = {
  token: "",
  nomeRestaurante: "",
  enderecoRestaurante: "",
  telefoneRestaurante: "",
  tipoConexao: "rede",
  impressoraHost: "127.0.0.1",
  impressoraPorta: 9100,
  impressoraUsbNome: "",
}

function caminhoConfig(): string {
  return join(app.getPath("userData"), "config.json")
}

export function lerConfig(): ConfigAgente {
  const caminho = caminhoConfig()
  if (!existsSync(caminho)) return { ...CONFIG_PADRAO }
  try {
    const dados = JSON.parse(readFileSync(caminho, "utf-8"))
    return { ...CONFIG_PADRAO, ...dados }
  } catch {
    return { ...CONFIG_PADRAO }
  }
}

export function salvarConfig(config: ConfigAgente): void {
  writeFileSync(caminhoConfig(), JSON.stringify(config, null, 2), "utf-8")
}

export function configCompleta(config: ConfigAgente): boolean {
  if (!config.token) return false
  if (config.tipoConexao === "usb") return Boolean(config.impressoraUsbNome)
  return Boolean(config.impressoraHost && config.impressoraPorta)
}
