import { contextBridge, ipcRenderer } from "electron"
import type { ConfigAgente } from "./config"

export interface StatusInfo {
  status: string
  detalhe?: string
}

contextBridge.exposeInMainWorld("agenteNosso", {
  lerConfig: (): Promise<ConfigAgente> => ipcRenderer.invoke("ler-config"),
  salvarConfig: (config: ConfigAgente): Promise<{ ok: boolean; avisoCompartilhamento?: string }> =>
    ipcRenderer.invoke("salvar-config", config),
  imprimirTeste: (config: ConfigAgente): Promise<{ ok: boolean; erro?: string }> =>
    ipcRenderer.invoke("imprimir-teste", config),
  statusAtual: (): Promise<StatusInfo> => ipcRenderer.invoke("status-atual"),
  detectarImpressoras: (): Promise<string[]> => ipcRenderer.invoke("detectar-impressoras"),
  listarImpressorasWindows: (): Promise<string[]> => ipcRenderer.invoke("listar-impressoras-windows"),
  buscarNomeRestaurante: (token: string): Promise<string | null> => ipcRenderer.invoke("buscar-nome-restaurante", token),
  aoAtualizarStatus: (callback: (info: StatusInfo) => void) => {
    ipcRenderer.on("status", (_evento, info: StatusInfo) => callback(info))
  },
})
