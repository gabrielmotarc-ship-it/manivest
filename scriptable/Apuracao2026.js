// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: vote-yea;

/**
 * Apuração 2026 — widget de iPhone (Scriptable) com o resultado ao vivo das
 * Eleições 2026, lido direto dos arquivos públicos do TSE (a mesma fonte que
 * os infográficos de apuração da imprensa usam).
 *
 * Parâmetro do widget (segure o widget › Editar widget › Parameter), opcional:
 *   (vazio)            Presidente, Brasil, turno atual
 *   governador sp      Governador de SP
 *   senador rj         Senador do RJ
 *   presidente mg      Presidente, só os votos de MG
 *   presidente t1      força o 1º turno (t2 força o 2º)
 *   demo               dados fictícios, para testar o visual
 *
 * Tocar no widget abre a página de apuração ao vivo do O Globo.
 */

const CONFIG = {
  base: "https://resultados.tse.jus.br/oficial",
  ciclo: "ele2026",
  // Usados se o índice de eleições do TSE (ele-c.json) não responder.
  eleicoesPadrao: {
    federal: { 1: "6257", 2: "6258" },
    estadual: { 1: "6259", 2: "6260" },
  },
  linkGlobo:
    "https://infograficos.oglobo.globo.com/politica/eleicoes-2026/apuracao-resultado-ao-vivo-2026.html#/presidente?tipo=apuracao&turno=1",
  // O iOS decide quando recarregar o widget; isto é só o pedido mínimo.
  atualizarACadaMin: 1,
};

const CARGOS = {
  presidente: { codigo: 1, nome: "Presidente", pleito: "federal" },
  governador: { codigo: 3, nome: "Governador", pleito: "estadual" },
  senador: { codigo: 5, nome: "Senador", pleito: "estadual" },
};

const UFS = [
  "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa",
  "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to",
];

const CORES_PARTIDO = {
  PT: "#C8102E", PL: "#1F3C88", PSDB: "#1A75CF", MDB: "#2E8B57", PSD: "#E8A317",
  "UNIÃO": "#0E5AA7", UNIAO: "#0E5AA7", NOVO: "#F2711C", PSOL: "#8E1B7E",
  REPUBLICANOS: "#0072BC", PP: "#4169B1", PDT: "#D7263D", PSB: "#F4B400",
  PODE: "#2BB673", CIDADANIA: "#E4572E", SOLIDARIEDADE: "#F28C28", PCdoB: "#B5121B",
  REDE: "#00A19A", AVANTE: "#00AEEF", MISSÃO: "#5B2C83", DC: "#1B998B", PCO: "#7A0019",
  PSTU: "#9B111E", UP: "#A4161A", AGIR: "#3A86FF", PRTB: "#2D6A4F", MOBILIZA: "#6A994E",
};
const PALETA = ["#C8102E", "#1F3C88", "#E8A317", "#2E8B57", "#8E1B7E", "#00A19A", "#F2711C", "#5C6B73"];

// ---------------------------------------------------------------- utilidades

const pad = (v, n) => String(v).padStart(n, "0");
const inteiro = (v) => parseInt(String(v ?? "").replace(/\D/g, ""), 10) || 0;
const decimal = (v) => {
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmtPct = (n, casas = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
const fmtInt = (n) => n.toLocaleString("pt-BR");
const titulo = (s) =>
  String(s ?? "").toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function lerParametro(texto) {
  const tokens = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[\s,;/]+/).filter(Boolean);
  const p = { cargo: CARGOS.presidente, uf: null, turno: null, demo: false };
  for (const t of tokens) {
    if (CARGOS[t]) p.cargo = CARGOS[t];
    else if (t === "gov") p.cargo = CARGOS.governador;
    else if (t === "sen") p.cargo = CARGOS.senador;
    else if (t === "pres") p.cargo = CARGOS.presidente;
    else if (UFS.includes(t)) p.uf = t;
    else if (/^(t|turno)?[12](t|turno)?$/.test(t)) p.turno = t.includes("2") ? 2 : 1;
    else if (t === "demo") p.demo = true;
  }
  // Governador e senador só existem por estado.
  if (p.cargo.codigo !== 1 && !p.uf) p.uf = "sp";
  if (p.cargo.codigo === CARGOS.senador.codigo) p.turno = 1;
  return p;
}

function urlResultado(eleicao, abrangencia, cargo) {
  return `${CONFIG.base}/${CONFIG.ciclo}/${eleicao}/dados/${abrangencia}/` +
    `${abrangencia}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`;
}

// ------------------------------------------------------------ acesso ao TSE

const fm = FileManager.local();
const pastaCache = fm.joinPath(fm.cacheDirectory(), "apuracao2026");
if (!fm.fileExists(pastaCache)) fm.createDirectory(pastaCache, true);

function lerCache(chave) {
  const arq = fm.joinPath(pastaCache, chave + ".json");
  try {
    return fm.fileExists(arq) ? JSON.parse(fm.readString(arq)) : null;
  } catch (e) {
    return null;
  }
}
function gravarCache(chave, valor) {
  try {
    fm.writeString(fm.joinPath(pastaCache, chave + ".json"), JSON.stringify(valor));
  } catch (e) {}
}

/** GET com User-Agent de navegador (o CDN do TSE recusa clientes sem ele). */
async function baixarJson(url) {
  const req = new Request(url);
  req.timeoutInterval = 15;
  req.headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    Accept: "application/json,text/plain,*/*",
  };
  const corpo = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status === 404 || status === 403) return null; // ainda não publicado
  if (status && (status < 200 || status >= 300)) throw new Error(`TSE respondeu ${status}`);
  return JSON.parse(corpo);
}

/** Códigos das eleições 2026 a partir do índice oficial; cai no padrão se falhar. */
async function descobrirEleicoes() {
  const cache = lerCache("eleicoes");
  if (cache && Date.now() - cache.em < 6 * 3600 * 1000) return cache.eleicoes;
  try {
    const indice = await baixarJson(`${CONFIG.base}/comum/config/ele-c.json`);
    for (const pleito of (indice && indice.pl) || []) {
      if (pleito.c !== CONFIG.ciclo) continue;
      const eleicoes = {};
      for (const e of pleito.e || []) {
        if (e.t !== "1") continue;
        const tipo = e.tp === "8" ? "federal" : e.tp === "1" ? "estadual" : null;
        if (tipo && !eleicoes[tipo]) eleicoes[tipo] = { 1: e.cd, 2: e.cdt2 || CONFIG.eleicoesPadrao[tipo][2] };
      }
      if (eleicoes.federal && eleicoes.estadual) {
        gravarCache("eleicoes", { em: Date.now(), eleicoes });
        return eleicoes;
      }
    }
  } catch (e) {}
  return CONFIG.eleicoesPadrao;
}

function normalizar(bruto, meta) {
  const cargo = (bruto.carg && bruto.carg[0]) || {};
  const candidatos = [];
  for (const agr of cargo.agr || []) {
    for (const par of agr.par || []) {
      for (const c of par.cand || []) {
        candidatos.push({
          numero: c.n,
          nome: titulo(c.nmu || c.nm),
          partido: par.sg || "",
          votos: inteiro(c.vap),
          pct: decimal(c.pvap),
          situacao: c.st || (c.e === "s" ? "Eleito" : ""),
        });
      }
    }
  }
  const validos = candidatos.reduce((t, c) => t + c.votos, 0);
  for (const c of candidatos) if (!c.pct && validos) c.pct = (c.votos / validos) * 100;
  candidatos.sort((a, b) => b.votos - a.votos || Number(a.numero) - Number(b.numero));

  const s = bruto.s || {};
  const v = bruto.v || {};
  const e = bruto.e || {};
  const secoesTot = inteiro(s.ts);
  const secoesApu = inteiro(s.st);
  const aptos = inteiro(e.est) || inteiro(e.te);
  return {
    ...meta,
    turno: Number(bruto.t) || meta.turno,
    atualizado: paraData(bruto.dg, bruto.hg),
    apurado: decimal(s.pst) || (secoesTot ? (secoesApu / secoesTot) * 100 : 0),
    secoes: { total: secoesTot, apuradas: secoesApu },
    brancos: inteiro(v.vb),
    nulos: inteiro(v.tvn) || inteiro(v.vn),
    abstencao: aptos ? (inteiro(e.a) / aptos) * 100 : 0,
    candidatos,
  };
}

/** O TSE informa data e hora de Brasília (UTC-3). */
function paraData(dg, hg) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dg || "");
  if (!m || !/^\d{2}:\d{2}:\d{2}$/.test(hg || "")) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${hg}-03:00`);
}

async function carregarApuracao(p) {
  const abr = p.uf || "br";
  const chave = `${p.cargo.codigo}-${abr}-${p.turno || "auto"}`;
  const meta = { cargo: p.cargo.nome, abrangencia: abr.toUpperCase(), turno: p.turno || 1 };
  try {
    const eleicoes = await descobrirEleicoes();
    const codigos = eleicoes[p.cargo.pleito];
    // Sem turno fixo, tenta o 2º e volta ao 1º enquanto o 2º não existir.
    const turnos = p.turno ? [p.turno] : [2, 1];
    for (const t of turnos) {
      if (!codigos[t]) continue;
      const bruto = await baixarJson(urlResultado(codigos[t], abr, p.cargo.codigo));
      if (!bruto) continue;
      const dados = normalizar(bruto, { ...meta, turno: t });
      gravarCache(chave, dados);
      return dados;
    }
    const cache = lerCache(chave);
    if (cache) return { ...cache, atualizado: cache.atualizado && new Date(cache.atualizado), aviso: "Sem dados novos" };
    return { ...meta, aviso: "Apuração ainda não começou", candidatos: [], apurado: 0 };
  } catch (err) {
    const cache = lerCache(chave);
    if (cache) return { ...cache, atualizado: cache.atualizado && new Date(cache.atualizado), aviso: "Offline · último dado salvo" };
    return { ...meta, aviso: "Sem conexão com o TSE", candidatos: [], apurado: 0 };
  }
}

function dadosDemo(p) {
  const base = [
    ["Candidato A", "PT", 4123456], ["Candidato B", "PL", 3876543], ["Candidato C", "NOVO", 812345],
    ["Candidato D", "PSD", 654321], ["Candidato E", "PSOL", 210987], ["Candidato F", "PDT", 98765],
  ];
  const total = base.reduce((t, c) => t + c[2], 0);
  return {
    cargo: p.cargo.nome, abrangencia: (p.uf || "br").toUpperCase(), turno: 1,
    atualizado: new Date(), apurado: 63.47, secoes: { total: 472075, apuradas: 299625 },
    brancos: 123456, nulos: 234567, abstencao: 19.8, aviso: "Dados de demonstração",
    candidatos: base.map(([nome, partido, votos], i) => ({
      numero: String(10 + i), nome, partido, votos, pct: (votos / total) * 100, situacao: "",
    })),
  };
}

// ------------------------------------------------------------------ visual

const C = {
  fundo: Color.dynamic(new Color("#FFFFFF"), new Color("#111418")),
  texto: Color.dynamic(new Color("#14171A"), new Color("#F2F4F5")),
  suave: Color.dynamic(new Color("#5F6B76"), new Color("#9AA5B1")),
  trilho: Color.dynamic(new Color("#E6E9EC"), new Color("#2A3036")),
  destaque: new Color("#0A7A3D"),
  alerta: new Color("#D97706"),
};

function corDo(c, i) {
  return new Color(CORES_PARTIDO[c.partido] || CORES_PARTIDO[c.partido.toUpperCase()] || PALETA[i % PALETA.length]);
}

function barra(largura, altura, fracao, cor, trilho) {
  const ctx = new DrawContext();
  ctx.size = new Size(largura, altura);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const r = altura / 2;
  const fundo = new Path();
  fundo.addRoundedRect(new Rect(0, 0, largura, altura), r, r);
  ctx.addPath(fundo);
  ctx.setFillColor(trilho || C.trilho);
  ctx.fillPath();
  const w = Math.max(0, Math.min(1, fracao)) * largura;
  if (w > 0) {
    const frente = new Path();
    frente.addRoundedRect(new Rect(0, 0, Math.max(w, altura), altura), r, r);
    ctx.addPath(frente);
    ctx.setFillColor(cor);
    ctx.fillPath();
  }
  return ctx.getImage();
}

function texto(stack, conteudo, tamanho, opcoes = {}) {
  const t = stack.addText(conteudo);
  t.font = opcoes.negrito ? Font.boldSystemFont(tamanho)
    : opcoes.mono ? Font.semiboldMonospacedSystemFont(tamanho) : Font.systemFont(tamanho);
  t.textColor = opcoes.cor || C.texto;
  t.lineLimit = 1;
  if (opcoes.encolher) t.minimumScaleFactor = opcoes.encolher;
  return t;
}

function cabecalho(w, d, compacto) {
  const linha = w.addStack();
  linha.centerAlignContent();
  texto(linha, compacto ? d.cargo.toUpperCase() : `${d.cargo.toUpperCase()} · ${d.abrangencia}`, compacto ? 11 : 12,
    { negrito: true, cor: C.destaque, encolher: 0.7 });
  linha.addSpacer();
  texto(linha, `${d.turno}º turno`, compacto ? 10 : 11, { cor: C.suave });
}

function progresso(w, d, largura, compacto) {
  const linha = w.addStack();
  linha.centerAlignContent();
  texto(linha, fmtPct(d.apurado), compacto ? 18 : 20, { negrito: true });
  linha.addSpacer(4);
  texto(linha, "das urnas apuradas", compacto ? 10 : 11, { cor: C.suave, encolher: 0.7 });
  w.addSpacer(3);
  w.addImage(barra(largura, 5, d.apurado / 100, C.destaque)).imageSize = new Size(largura, 5);
}

function linhaCandidato(w, c, i, largura, compacto) {
  const linha = w.addStack();
  linha.centerAlignContent();
  texto(linha, c.nome, compacto ? 12 : 13, { negrito: i === 0, encolher: 0.6 });
  if (!compacto && c.partido) {
    linha.addSpacer(4);
    texto(linha, c.partido, 10, { cor: C.suave });
  }
  if (c.situacao && /eleit|turno/i.test(c.situacao)) {
    linha.addSpacer(4);
    texto(linha, /eleit/i.test(c.situacao) ? "✓" : "2º", 11, { negrito: true, cor: C.destaque });
  }
  linha.addSpacer();
  texto(linha, fmtPct(c.pct), compacto ? 12 : 13, { mono: true });
  w.addSpacer(2);
  w.addImage(barra(largura, compacto ? 4 : 5, c.pct / 100, corDo(c, i))).imageSize =
    new Size(largura, compacto ? 4 : 5);
}

function rodape(w, d, compacto) {
  const linha = w.addStack();
  linha.centerAlignContent();
  if (d.aviso) {
    texto(linha, d.aviso, 9, { cor: C.alerta, encolher: 0.7 });
  } else if (!compacto && d.secoes && d.secoes.total) {
    texto(linha, `${fmtInt(d.secoes.apuradas)} de ${fmtInt(d.secoes.total)} seções · TSE`, 9, { cor: C.suave, encolher: 0.7 });
  } else {
    texto(linha, "TSE", 9, { cor: C.suave });
  }
  linha.addSpacer();
  if (d.atualizado) {
    const h = linha.addDate(d.atualizado);
    h.applyTimeStyle();
    h.font = Font.systemFont(9);
    h.textColor = C.suave;
  }
}

function widgetTela(d, familia) {
  const w = new ListWidget();
  w.backgroundColor = C.fundo;
  w.url = CONFIG.linkGlobo;
  const compacto = familia === "small";
  const grande = familia === "large" || familia === "extraLarge";
  w.setPadding(compacto ? 12 : 14, 14, compacto ? 10 : 12, 14);
  const largura = compacto ? 130 : familia === "extraLarge" ? 680 : 300;

  cabecalho(w, d, compacto);
  w.addSpacer(compacto ? 4 : 6);
  progresso(w, d, largura, compacto);
  w.addSpacer(compacto ? 6 : 8);

  const qtd = compacto ? 2 : grande ? 7 : 3;
  const lista = d.candidatos.slice(0, qtd);
  if (!lista.length) {
    w.addSpacer();
    texto(w, "Toque para abrir a apuração", 12, { cor: C.suave });
  }
  lista.forEach((c, i) => {
    linhaCandidato(w, c, i, largura, compacto);
    if (i < lista.length - 1) w.addSpacer(compacto ? 4 : grande ? 7 : 5);
  });

  if (grande && lista.length) {
    w.addSpacer(10);
    const extra = w.addStack();
    texto(extra, `Brancos ${fmtInt(d.brancos)}`, 10, { cor: C.suave });
    extra.addSpacer();
    texto(extra, `Nulos ${fmtInt(d.nulos)}`, 10, { cor: C.suave });
    extra.addSpacer();
    texto(extra, `Abstenção ${fmtPct(d.abstencao, 1)}`, 10, { cor: C.suave });
  }

  w.addSpacer();
  rodape(w, d, compacto);
  return w;
}

/** Widgets da tela bloqueada. */
function widgetBloqueio(d, familia) {
  const w = new ListWidget();
  w.url = CONFIG.linkGlobo;
  const [a, b] = d.candidatos;
  const curto = (c) => `${c.nome.split(" ")[0]} ${fmtPct(c.pct, 1)}`;

  if (familia === "accessoryInline") {
    texto(w, a ? `🗳 ${fmtPct(d.apurado, 0)} · ${curto(a)}${b ? " · " + curto(b) : ""}` : "🗳 Apuração 2026", 12);
  } else if (familia === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const s = w.addStack();
    s.layoutVertically();
    s.centerAlignContent();
    texto(s, fmtPct(d.apurado, 0), 13, { negrito: true, encolher: 0.6 }).centerAlignText();
    texto(s, "apurado", 8, { encolher: 0.6 }).centerAlignText();
  } else {
    texto(w, `${d.cargo} · ${fmtPct(d.apurado, 1)} apurado`, 11, { negrito: true, encolher: 0.7 });
    for (const c of d.candidatos.slice(0, 2)) {
      const l = w.addStack();
      texto(l, c.nome, 12, { encolher: 0.6 });
      l.addSpacer();
      texto(l, fmtPct(c.pct), 12, { mono: true });
    }
  }
  return w;
}

async function mostrarTabela(d) {
  const tabela = new UITable();
  tabela.showSeparators = true;
  const topo = new UITableRow();
  topo.isHeader = true;
  topo.height = 60;
  topo.addText(`${d.cargo} · ${d.abrangencia} · ${d.turno}º turno`,
    `${fmtPct(d.apurado)} das urnas apuradas${d.aviso ? " · " + d.aviso : ""}`);
  tabela.addRow(topo);
  d.candidatos.forEach((c, i) => {
    const r = new UITableRow();
    r.height = 52;
    const nome = r.addText(`${i + 1}. ${c.nome}`, `${c.partido} · ${c.numero}${c.situacao ? " · " + c.situacao : ""}`);
    nome.widthWeight = 70;
    const pct = r.addText(fmtPct(c.pct), `${fmtInt(c.votos)} votos`);
    pct.rightAligned();
    pct.widthWeight = 30;
    tabela.addRow(r);
  });
  const abrir = new UITableRow();
  abrir.height = 50;
  abrir.addButton("Abrir apuração do O Globo").onTap = () => Safari.open(CONFIG.linkGlobo);
  abrir.dismissOnSelect = false;
  tabela.addRow(abrir);
  await tabela.present();
}

// -------------------------------------------------------------------- main

const parametro = lerParametro(args.widgetParameter || (config.runsInWidget ? "" : args.queryParameters.p));
const dados = parametro.demo ? dadosDemo(parametro) : await carregarApuracao(parametro);
const familia = config.widgetFamily || "medium";

if (config.runsInWidget || config.runsInAccessoryWidget) {
  const w = familia.startsWith("accessory") ? widgetBloqueio(dados, familia) : widgetTela(dados, familia);
  w.refreshAfterDate = new Date(Date.now() + CONFIG.atualizarACadaMin * 60 * 1000);
  Script.setWidget(w);
} else {
  // Rodando no app: mostra o widget médio e, depois, a lista completa.
  await widgetTela(dados, "medium").presentMedium();
  await mostrarTabela(dados);
}
Script.complete();
