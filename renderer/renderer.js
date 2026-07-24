const campoNome = document.getElementById("nome")
const campoToken = document.getElementById("token")
const campoHost = document.getElementById("host")
const campoPorta = document.getElementById("porta")
const campoImpressoraUsb = document.getElementById("impressoraUsb")
const botaoTipoRede = document.getElementById("tipoRede")
const botaoTipoUsb = document.getElementById("tipoUsb")
const secaoRede = document.getElementById("secaoRede")
const secaoUsb = document.getElementById("secaoUsb")
const botaoAtualizarImpressoras = document.getElementById("atualizarImpressoras")
const botaoSincronizar = document.getElementById("sincronizar")
const botaoSalvar = document.getElementById("salvar")
const botaoTestar = document.getElementById("testar")
const botaoDetectar = document.getElementById("detectar")
const resultadosDeteccao = document.getElementById("resultadosDeteccao")
const bolinha = document.getElementById("bolinha")
const statusTexto = document.getElementById("statusTexto")
const mensagem = document.getElementById("mensagem")

let tipoConexao = "rede"
// Endereço/telefone do estabelecimento não têm campo próprio na tela — vêm
// do painel web (Configurações → Perfil) e só ficam em cache aqui pra sair
// no cabeçalho da comanda impressa, atualizando sozinhos quando o token é
// colado/revalidado (mesmo gatilho que já detecta o nome do restaurante).
let enderecoRestauranteAtual = ""
let telefoneRestauranteAtual = ""

const corPorStatus = {
  ocioso: "#4caf7d",
  imprimindo: "#f0a93f",
  erro: "#e2555c",
  "sem-config": "#666",
}

const textoPorStatus = {
  ocioso: "Conectado — aguardando pedidos",
  imprimindo: "Imprimindo...",
  erro: "Erro",
  "sem-config": "Sem configuração",
}

function mostrarStatus(info) {
  const status = info?.status ?? "sem-config"
  bolinha.style.background = corPorStatus[status] ?? "#666"
  statusTexto.textContent = textoPorStatus[status] ?? status
  if (status === "erro" && info?.detalhe) {
    statusTexto.textContent += `: ${info.detalhe}`
  }
}

function mostrarMensagem(texto, tipo) {
  mensagem.textContent = texto
  mensagem.className = tipo ?? ""
  setTimeout(() => {
    mensagem.textContent = ""
    mensagem.className = ""
  }, 5000)
}

function selecionarTipoConexao(tipo) {
  tipoConexao = tipo
  botaoTipoRede.classList.toggle("ativo", tipo === "rede")
  botaoTipoUsb.classList.toggle("ativo", tipo === "usb")
  secaoRede.classList.toggle("visivel", tipo === "rede")
  secaoUsb.classList.toggle("visivel", tipo === "usb")
  if (tipo === "usb") carregarImpressorasWindows()
}

async function carregarImpressorasWindows() {
  const impressoraSelecionada = campoImpressoraUsb.value
  campoImpressoraUsb.innerHTML = "<option>Carregando...</option>"
  const nomes = await window.agenteNosso.listarImpressorasWindows()
  campoImpressoraUsb.innerHTML = ""
  if (nomes.length === 0) {
    campoImpressoraUsb.innerHTML = "<option value=''>Nenhuma impressora instalada encontrada</option>"
    return
  }
  for (const nome of nomes) {
    const opcao = document.createElement("option")
    opcao.value = nome
    opcao.textContent = nome
    campoImpressoraUsb.appendChild(opcao)
  }
  if (impressoraSelecionada) campoImpressoraUsb.value = impressoraSelecionada
}

function montarConfig() {
  return {
    nomeRestaurante: campoNome.value.trim(),
    enderecoRestaurante: enderecoRestauranteAtual,
    telefoneRestaurante: telefoneRestauranteAtual,
    token: campoToken.value.trim(),
    tipoConexao,
    impressoraHost: campoHost.value.trim() || "127.0.0.1",
    impressoraPorta: Number.parseInt(campoPorta.value, 10) || 9100,
    impressoraUsbNome: campoImpressoraUsb.value || "",
  }
}

async function atualizarDadosRestaurante(token, { avisar } = { avisar: true }) {
  if (!token) return
  const dados = await window.agenteNosso.buscarDadosRestaurante(token)
  if (dados) {
    campoNome.value = dados.nome
    enderecoRestauranteAtual = dados.endereco ?? ""
    telefoneRestauranteAtual = dados.telefone ?? ""
    if (avisar) mostrarMensagem(`Restaurante detectado: ${dados.nome}`, "ok")
  }
}

async function carregar() {
  const config = await window.agenteNosso.lerConfig()
  campoNome.value = config.nomeRestaurante ?? ""
  enderecoRestauranteAtual = config.enderecoRestaurante ?? ""
  telefoneRestauranteAtual = config.telefoneRestaurante ?? ""
  campoToken.value = config.token ?? ""
  campoHost.value = config.impressoraHost ?? "127.0.0.1"
  campoPorta.value = String(config.impressoraPorta ?? 9100)
  selecionarTipoConexao(config.tipoConexao === "usb" ? "usb" : "rede")
  if (config.tipoConexao === "usb" && config.impressoraUsbNome) {
    await carregarImpressorasWindows()
    campoImpressoraUsb.value = config.impressoraUsbNome
  }

  const status = await window.agenteNosso.statusAtual()
  mostrarStatus(status)

  // Refaz a busca sozinho ao abrir o app, sem esperar o usuário clicar no
  // campo do token — instalações que já tinham token salvo de uma versão
  // anterior (antes de endereco/telefone existirem) nunca disparariam o
  // "blur" sozinhas depois de atualizar, e ficariam pra sempre sem esses
  // dados na comanda até alguém mexer manualmente no campo.
  if (config.token) {
    await atualizarDadosRestaurante(config.token, { avisar: false })
    await window.agenteNosso.salvarConfig(montarConfig())
  }
}

campoToken.addEventListener("blur", async () => {
  await atualizarDadosRestaurante(campoToken.value.trim())
})

// Botão manual — pra quando o dono edita nome/endereço/telefone no painel web
// depois de já ter configurado o agente (sem isso, só reabrindo o app ou
// mexendo no campo do token de novo é que traria o dado novo).
botaoSincronizar.addEventListener("click", async () => {
  const token = campoToken.value.trim()
  if (!token) {
    mostrarMensagem("Cole o token antes de sincronizar.", "erro")
    return
  }
  botaoSincronizar.disabled = true
  await atualizarDadosRestaurante(token)
  await window.agenteNosso.salvarConfig(montarConfig())
  botaoSincronizar.disabled = false
})

botaoTipoRede.addEventListener("click", () => selecionarTipoConexao("rede"))
botaoTipoUsb.addEventListener("click", () => selecionarTipoConexao("usb"))
botaoAtualizarImpressoras.addEventListener("click", carregarImpressorasWindows)

botaoSalvar.addEventListener("click", async () => {
  const resultado = await window.agenteNosso.salvarConfig(montarConfig())
  if (resultado.avisoCompartilhamento) {
    mostrarMensagem(`Salvo, mas não deu pra compartilhar a impressora automaticamente: ${resultado.avisoCompartilhamento}`, "erro")
  } else {
    mostrarMensagem("Configuração salva.", "ok")
  }
})

botaoTestar.addEventListener("click", async () => {
  botaoTestar.disabled = true
  const resultado = await window.agenteNosso.imprimirTeste(montarConfig())
  botaoTestar.disabled = false
  if (resultado.ok) {
    mostrarMensagem("Comanda de teste enviada.", "ok")
  } else {
    mostrarMensagem(`Falha: ${resultado.erro}`, "erro")
  }
})

botaoDetectar.addEventListener("click", async () => {
  botaoDetectar.disabled = true
  botaoDetectar.textContent = "Procurando na rede..."
  resultadosDeteccao.className = ""
  resultadosDeteccao.innerHTML = ""

  const encontradas = await window.agenteNosso.detectarImpressoras()

  botaoDetectar.disabled = false
  botaoDetectar.textContent = "Detectar impressora na rede"

  if (encontradas.length === 0) {
    resultadosDeteccao.innerHTML = "<p>Nenhuma impressora encontrada na rede. Confira se ela está ligada e conectada, ou digite o IP manualmente.</p>"
    resultadosDeteccao.className = "visivel"
    return
  }

  for (const ip of encontradas) {
    const item = document.createElement("button")
    item.type = "button"
    item.textContent = ip
    item.addEventListener("click", () => {
      campoHost.value = ip
      campoPorta.value = "9100"
      resultadosDeteccao.className = ""
      resultadosDeteccao.innerHTML = ""
    })
    resultadosDeteccao.appendChild(item)
  }
  resultadosDeteccao.className = "visivel"
})

window.agenteNosso.aoAtualizarStatus(mostrarStatus)
carregar()
