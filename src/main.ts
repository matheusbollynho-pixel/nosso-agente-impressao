import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, dialog } from "electron"
import { autoUpdater } from "electron-updater"
import { join } from "path"
import { appendFileSync } from "fs"
import { lerConfig, salvarConfig, configCompleta, type ConfigAgente } from "./config"
import { iniciarPolling, imprimirTeste, buscarDadosRestaurante, type StatusAgente } from "./polling"
import { detectarImpressorasNaRede } from "./deteccao"
import { listarImpressorasWindows, garantirCompartilhada } from "./impressoraUsb"

// Diagnóstico temporário do auto-update: checkForUpdatesAndNotify() só
// mostra algo pro usuário quando a atualização já foi baixada com sucesso —
// qualquer erro no meio do caminho (rede, feed, verificação) fica invisível
// sem isso. Grava num arquivo de log e também loga no console (visível se
// o .exe for aberto a partir de um terminal).
function logAtualizacao(mensagem: string): void {
  const linha = `[${new Date().toISOString()}] ${mensagem}`
  console.log(linha)
  try {
    appendFileSync(join(app.getPath("userData"), "update.log"), linha + "\n")
  } catch {
    // Se nem isso funcionar, não há mais nada a fazer aqui.
  }
}

// A cada quantas horas verifica se saiu versão nova — o agente fica
// residente na bandeja o dia inteiro sem reiniciar, então checar só na
// abertura não seria suficiente.
const INTERVALO_CHECAGEM_ATUALIZACAO_MS = 4 * 60 * 60 * 1000

let janela: BrowserWindow | null = null
let tray: Tray | null = null
let statusAtual: StatusAgente = "sem-config"
let detalheStatus = ""
let atualizacaoBaixada = false

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
    title: "Nosso — Agente de Impressão",
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
  const texto = `Nosso — ${rotuloStatus[statusAtual]}${detalheStatus ? `: ${detalheStatus}` : ""}`
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
        if (atualizacaoBaixada) {
          // app.exit() pula os eventos de quit que o electron-updater usa
          // pra instalar — aqui a janela é destruída na força (ignora o
          // preventDefault de "esconder ao fechar") pra não travar o
          // quitAndInstall, que precisa fechar o app de verdade.
          janela?.destroy()
          janela = null
          // Silencioso (sem tela de instalador) e força reabrir depois —
          // o dono do restaurante não deveria precisar clicar em nada pra
          // atualizar, só ver o app fechar e voltar sozinho.
          autoUpdater.quitAndInstall(true, true)
          return
        }
        app.exit(0)
      },
    },
  ])
  tray.setContextMenu(menu)
  tray.setToolTip("Nosso — Agente de Impressão")
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
  logAtualizacao(`App pronto. Versão atual: ${app.getVersion()}`)
  autoUpdater.checkForUpdatesAndNotify().catch((erro) => {
    logAtualizacao(`checkForUpdatesAndNotify rejeitou: ${erro instanceof Error ? erro.stack ?? erro.message : erro}`)
  })
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((erro) => {
      logAtualizacao(`checkForUpdatesAndNotify rejeitou: ${erro instanceof Error ? erro.stack ?? erro.message : erro}`)
    })
  }, INTERVALO_CHECAGEM_ATUALIZACAO_MS)
})

autoUpdater.on("checking-for-update", () => {
  logAtualizacao("Checando atualização...")
})

autoUpdater.on("update-available", (info) => {
  logAtualizacao(`Atualização disponível: v${info.version}`)
})

autoUpdater.on("update-not-available", (info) => {
  logAtualizacao(`Nenhuma atualização disponível (versão do feed: v${info.version})`)
})

autoUpdater.on("download-progress", (progresso) => {
  logAtualizacao(`Baixando atualização... ${Math.round(progresso.percent)}%`)
})

autoUpdater.on("update-downloaded", (info) => {
  atualizacaoBaixada = true
  logAtualizacao(`Atualização v${info.version} baixada, pronta pra instalar.`)
})

autoUpdater.on("error", (erro) => {
  logAtualizacao(`ERRO no auto-update: ${erro.stack ?? erro.message}`)
  dialog.showErrorBox("Nosso — erro ao verificar atualização", erro.message)
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

ipcMain.handle("buscar-dados-restaurante", async (_evento, token: string) => {
  return buscarDadosRestaurante(token)
})
