import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from "electron"
import { autoUpdater } from "electron-updater"
import { join } from "path"
import { lerConfig, salvarConfig, configCompleta, type ConfigAgente } from "./config"
import { iniciarPolling, imprimirTeste, buscarNomeRestaurante, type StatusAgente } from "./polling"
import { detectarImpressorasNaRede } from "./deteccao"
import { listarImpressorasWindows, garantirCompartilhada } from "./impressoraUsb"

// A cada quantas horas verifica se saiu versão nova — o agente fica
// residente na bandeja o dia inteiro sem reiniciar, então checar só na
// abertura não seria suficiente.
const INTERVALO_CHECAGEM_ATUALIZACAO_MS = 4 * 60 * 60 * 1000

let janela: BrowserWindow | null = null
let tray: Tray | null = null
let statusAtual: StatusAgente = "sem-config"
let detalheStatus = ""

const rotuloStatus: Record<StatusAgente, string> = {
  ocioso: "Conectado — aguardando pedidos",
  imprimindo: "Imprimindo...",
  erro: "Erro",
  "sem-config": "Sem configuração — clique em Configurações",
}

function caminhoIcone(): string {
  return join(__dirname, "..", "assets", "icon.ico")
}

function criarJanela(): void {
  if (janela) {
    janela.show()
    janela.focus()
    return
  }
  janela = new BrowserWindow({
    width: 420,
    height: 680,
    resizable: false,
    title: "Bora — Agente de Impressão",
    icon: caminhoIcone(),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  janela.setMenuBarVisibility(false)
  janela.loadFile(join(__dirname, "..", "renderer", "index.html"))
  janela.on("close", (evento) => {
    evento.preventDefault()
    janela?.hide()
  })
  janela.on("closed", () => {
    janela = null
  })
}

function atualizarTray(): void {
  if (!tray) return
  const texto = `Bora — ${rotuloStatus[statusAtual]}${detalheStatus ? `: ${detalheStatus}` : ""}`
  tray.setToolTip(texto)
}

function criarTray(): void {
  const icone = nativeImage.createFromPath(caminhoIcone())
  tray = new Tray(icone)
  const menu = Menu.buildFromTemplate([
    { label: "Configurações", click: () => criarJanela() },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        app.exit(0)
      },
    },
  ])
  tray.setContextMenu(menu)
  tray.setToolTip("Bora — Agente de Impressão")
  tray.on("click", () => criarJanela())
}

app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true })

  criarTray()

  const config = lerConfig()
  if (!configCompleta(config)) criarJanela()

  iniciarPolling({
    onStatus: (status, detalhe) => {
      statusAtual = status
      detalheStatus = detalhe ?? ""
      atualizarTray()
      janela?.webContents.send("status", { status, detalhe })
    },
  })

  // Checa atualização assim que abre, e de novo periodicamente — o
  // download acontece em segundo plano, a instalação só acontece quando o
  // usuário aceitar reiniciar (checkForUpdatesAndNotify já cuida do
  // diálogo nativo).
  autoUpdater.checkForUpdatesAndNotify()
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), INTERVALO_CHECAGEM_ATUALIZACAO_MS)
})

app.on("window-all-closed", () => {
  // Não sai — o agente continua rodando em segundo plano via a bandeja.
})

ipcMain.handle("ler-config", () => lerConfig())

ipcMain.handle("salvar-config", async (_evento, config: ConfigAgente) => {
  if (config.tipoConexao === "usb" && config.impressoraUsbNome) {
    const resultado = await garantirCompartilhada(config.impressoraUsbNome)
    if (!resultado.ok) {
      salvarConfig(config)
      return { ok: true, avisoCompartilhamento: resultado.erro }
    }
  }
  salvarConfig(config)
  return { ok: true }
})

ipcMain.handle("imprimir-teste", async (_evento, config: ConfigAgente) => {
  try {
    await imprimirTeste(config)
    return { ok: true }
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao imprimir" }
  }
})

ipcMain.handle("status-atual", () => ({ status: statusAtual, detalhe: detalheStatus }))

ipcMain.handle("detectar-impressoras", async () => {
  return detectarImpressorasNaRede()
})

ipcMain.handle("listar-impressoras-windows", async () => {
  return listarImpressorasWindows()
})

ipcMain.handle("buscar-nome-restaurante", async (_evento, token: string) => {
  return buscarNomeRestaurante(token)
})
