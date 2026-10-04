// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: vote-yea;

/**
 * Apuração 2026 — widget de iPhone (Scriptable) e painel ao vivo com o
 * resultado das Eleições 2026, lido direto dos arquivos públicos de resultado
 * do TSE (a mesma fonte que os infográficos de apuração da imprensa usam).
 *
 * Parâmetro do widget (segure o widget › Editar widget › Parameter), opcional:
 *   (vazio)            Presidente, Brasil, turno atual
 *   governador sp      Governador de SP
 *   senador rj         Senador do RJ
 *   presidente mg      Presidente, só os votos de MG
 *   presidente t1      força o 1º turno (t2 força o 2º)
 *   demo               dados fictícios, para testar o visual
 *
 * Tocar no widget abre o painel ao vivo, que se atualiza sozinho a cada 30 s.
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
  // O iOS decide quando recarregar o widget (cota de ~40–70 recargas por dia);
  // pedir menos que isso não faz o iOS atualizar mais vezes.
  atualizarACadaMin: 5,
  // Data do 2º turno: antes dela não vale a pena consultar os arquivos do 2º turno.
  segundoTurno: new Date("2026-10-25T00:00:00-03:00"),
  // Intervalo de atualização do painel ao vivo (app aberto).
  painelACadaSeg: 30,
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

/** Foto oficial do candidato. Presidente fica sempre sob a abrangência "br". */
function urlFoto(eleicao, abrangencia, sqcand) {
  return `${CONFIG.base}/${CONFIG.ciclo}/${eleicao}/fotos/${abrangencia}/${sqcand}.jpeg`;
}

function urlResultado(eleicao, abrangencia, cargo) {
  return `${CONFIG.base}/${CONFIG.ciclo}/${eleicao}/dados/${abrangencia}/` +
    `${abrangencia}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`;
}

// ------------------------------------------------------------ acesso ao TSE

const emWidget = config.runsInWidget || config.runsInAccessoryWidget;
const hora = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

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
  // O widget tem pouco tempo para rodar: se o TSE demorar, usa o último dado salvo.
  req.timeoutInterval = emWidget ? 8 : 15;
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
          sqcand: c.sqcand,
          foto: c.sqcand ? urlFoto(meta.eleicao, meta.abrangenciaFoto, c.sqcand) : null,
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
    // Sem turno fixo, tenta o 2º (a partir da data dele) e volta ao 1º enquanto o 2º não existir.
    const turnos = p.turno ? [p.turno] : Date.now() >= CONFIG.segundoTurno.getTime() ? [2, 1] : [1];
    for (const t of turnos) {
      if (!codigos[t]) continue;
      const bruto = await baixarJson(urlResultado(codigos[t], abr, p.cargo.codigo));
      if (!bruto) continue;
      const dados = normalizar(bruto, {
        ...meta, turno: t, eleicao: codigos[t],
        abrangenciaFoto: p.cargo.codigo === CARGOS.presidente.codigo ? "br" : abr,
      });
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

function hexDo(c, i) {
  return CORES_PARTIDO[c.partido] || CORES_PARTIDO[String(c.partido).toUpperCase()] || PALETA[i % PALETA.length];
}
const corDo = (c, i) => new Color(hexDo(c, i));

function barra(largura, altura, fracao, cor) {
  const ctx = new DrawContext();
  ctx.size = new Size(largura, altura);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const r = altura / 2;
  const fundo = new Path();
  fundo.addRoundedRect(new Rect(0, 0, largura, altura), r, r);
  ctx.addPath(fundo);
  ctx.setFillColor(C.trilho);
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

/** Círculo com as iniciais, usado enquanto a foto oficial não está disponível. */
function avatarIniciais(c, i) {
  const t = 120;
  const ctx = new DrawContext();
  ctx.size = new Size(t, t);
  ctx.opaque = false;
  ctx.setFillColor(corDo(c, i));
  ctx.fillEllipse(new Rect(0, 0, t, t));
  const iniciais = c.nome.split(" ").filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join("") || c.nome[0];
  ctx.setFont(Font.boldRoundedSystemFont(46));
  ctx.setTextColor(Color.white());
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect(iniciais.toUpperCase(), new Rect(0, 32, t, 60));
  return ctx.getImage();
}

/** Foto oficial do TSE, guardada no aparelho depois do primeiro download. */
async function fotoDo(c, i) {
  if (!c.sqcand || !c.foto) return avatarIniciais(c, i);
  const arq = fm.joinPath(pastaCache, `foto-${c.sqcand}.jpg`);
  try {
    if (fm.fileExists(arq)) return fm.readImage(arq);
    const req = new Request(c.foto);
    req.timeoutInterval = 10;
    req.headers = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15" };
    const img = await req.loadImage();
    if (req.response && req.response.statusCode === 200 && img) {
      fm.writeImage(arq, img);
      return img;
    }
  } catch (e) {}
  return avatarIniciais(c, i);
}

function texto(stack, conteudo, tamanho, opcoes = {}) {
  const t = stack.addText(conteudo);
  t.font = opcoes.numero ? Font.boldRoundedSystemFont(tamanho)
    : opcoes.negrito ? Font.boldSystemFont(tamanho) : Font.systemFont(tamanho);
  t.textColor = opcoes.cor || C.texto;
  t.lineLimit = 1;
  if (opcoes.encolher) t.minimumScaleFactor = opcoes.encolher;
  return t;
}

function imagem(stack, img, lado, borda) {
  const w = stack.addImage(img);
  w.imageSize = new Size(lado, lado);
  w.applyFillingContentMode();
  w.cornerRadius = lado / 2;
  if (borda) {
    w.borderColor = borda;
    w.borderWidth = 2;
  }
  return w;
}

function selo(c) {
  if (/eleit/i.test(c.situacao)) return "✓ eleito";
  if (/turno/i.test(c.situacao)) return "2º turno";
  return "";
}

function cabecalho(w, d, largura, compacto) {
  const linha = w.addStack();
  linha.centerAlignContent();
  texto(linha, compacto ? `🗳 ${d.cargo.toUpperCase()}` : `🗳 ${d.cargo.toUpperCase()} · ${d.turno}º TURNO`,
    compacto ? 10 : 11, { negrito: true, cor: C.destaque, encolher: 0.7 });
  if (!compacto && d.abrangencia !== "BR") texto(linha, ` · ${d.abrangencia}`, 11, { negrito: true, cor: C.destaque });
  linha.addSpacer();
  texto(linha, fmtPct(d.apurado, compacto ? 1 : 2), compacto ? 11 : 12, { numero: true });
  texto(linha, " apurado", compacto ? 9 : 10, { cor: C.suave });
  w.addSpacer(4);
  w.addImage(barra(largura, 4, d.apurado / 100, C.destaque)).imageSize = new Size(largura, 4);
}

function rodape(w, d, pequeno) {
  const linha = w.addStack();
  linha.centerAlignContent();
  if (d.aviso) texto(linha, d.aviso, 9, { cor: C.alerta, encolher: 0.7 });
  else if (d.atualizado) texto(linha, `TSE ${hora(new Date(d.atualizado))}`, 9, { cor: C.suave });
  else texto(linha, "Fonte: TSE", 9, { cor: C.suave });
  linha.addSpacer();
  // Hora em que o iOS rodou o widget pela última vez.
  texto(linha, `${pequeno ? "↻" : "widget ↻"} ${hora(new Date())}`, 9, { cor: C.suave });
}

/**
 * Uma linha de candidato: foto, nome, partido/votos com barra e o percentual em
 * destaque à direita.
 */
function linhaCandidato(w, c, i, foto, o) {
  const linha = w.addStack();
  linha.centerAlignContent();
  imagem(linha, foto, o.foto, corDo(c, i));
  linha.addSpacer(8);
  const col = linha.addStack();
  col.layoutVertically();
  const topo = col.addStack();
  topo.centerAlignContent();
  texto(topo, c.nome, o.nome, { negrito: true, encolher: 0.6 });
  const s = selo(c);
  if (s) {
    topo.addSpacer(4);
    texto(topo, s, 9, { negrito: true, cor: C.destaque });
  }
  col.addSpacer(1);
  texto(col, o.votos ? `${c.partido} · ${fmtInt(c.votos)} votos` : c.partido, 10, { cor: C.suave, encolher: 0.7 });
  col.addSpacer(3);
  col.addImage(barra(o.barra, 4, c.pct / 100, corDo(c, i))).imageSize = new Size(o.barra, 4);
  linha.addSpacer();
  texto(linha, fmtPct(c.pct), o.pct, { numero: true });
}

/** Widget pequeno: os dois primeiros, com foto e percentual grande. */
function linhaPequena(w, c, i, foto) {
  const linha = w.addStack();
  linha.centerAlignContent();
  imagem(linha, foto, 30, corDo(c, i));
  linha.addSpacer(7);
  const col = linha.addStack();
  col.layoutVertically();
  texto(col, c.nome, 11, { negrito: true, encolher: 0.6 });
  texto(col, fmtPct(c.pct), 19, { numero: true, cor: corDo(c, i) });
}

async function widgetTela(d, familia) {
  const w = new ListWidget();
  w.backgroundColor = C.fundo;
  w.url = urlPainel();
  const pequeno = familia === "small";
  const grande = familia === "large" || familia === "extraLarge";
  w.setPadding(pequeno ? 12 : 12, 14, pequeno ? 10 : 10, 14);
  const largura = pequeno ? 130 : familia === "extraLarge" ? 680 : 300;

  cabecalho(w, d, largura, pequeno);
  w.addSpacer(pequeno ? 8 : grande ? 12 : 8);

  const qtd = pequeno ? 2 : grande ? 5 : 3;
  const lista = d.candidatos.slice(0, qtd);
  const fotos = await Promise.all(lista.map((c, i) => fotoDo(c, i)));
  if (!lista.length) {
    w.addSpacer();
    texto(w, "Aguardando o TSE", 13, { negrito: true, cor: C.suave });
    texto(w, "Toque para abrir o painel ao vivo", 10, { cor: C.suave });
  }
  const o = grande
    ? { foto: 40, nome: 15, pct: 24, votos: true, barra: largura - 40 - 8 - 100 }
    : { foto: 28, nome: 13, pct: 19, votos: false, barra: largura - 28 - 8 - 82 };
  lista.forEach((c, i) => {
    if (pequeno) linhaPequena(w, c, i, fotos[i]);
    else linhaCandidato(w, c, i, fotos[i], o);
    if (i < lista.length - 1) w.addSpacer(pequeno ? 6 : grande ? 12 : 5);
  });

  if (grande && lista.length > 1) {
    w.addSpacer(12);
    const [a, b] = d.candidatos;
    const extra = w.addStack();
    texto(extra, `Diferença 1º–2º: ${fmtPct(a.pct - b.pct).replace("%", " p.p.")} · ${fmtInt(a.votos - b.votos)} votos`, 10, { cor: C.suave, encolher: 0.7 });
    w.addSpacer(3);
    const extra2 = w.addStack();
    texto(extra2, `Brancos ${fmtInt(d.brancos)} · Nulos ${fmtInt(d.nulos)} · Abstenção ${fmtPct(d.abstencao, 1)}`, 10,
      { cor: C.suave, encolher: 0.7 });
  }

  w.addSpacer();
  rodape(w, d, pequeno);
  return w;
}

/** Widgets da tela bloqueada. */
function widgetBloqueio(d, familia) {
  const w = new ListWidget();
  w.url = urlPainel();
  const [a, b] = d.candidatos;
  const curto = (c) => `${c.nome.split(" ")[0]} ${fmtPct(c.pct, 1)}`;

  if (familia === "accessoryInline") {
    texto(w, a ? `🗳 ${fmtPct(d.apurado, 0)} · ${curto(a)}${b ? " · " + curto(b) : ""}` : "🗳 Apuração 2026", 12);
  } else if (familia === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const s = w.addStack();
    s.layoutVertically();
    s.centerAlignContent();
    texto(s, fmtPct(d.apurado, 0), 13, { numero: true, encolher: 0.6 }).centerAlignText();
    texto(s, "apurado", 8, { encolher: 0.6 }).centerAlignText();
  } else {
    const topo = d.atualizado ? ` · TSE ${hora(new Date(d.atualizado))}` : "";
    texto(w, `🗳 ${fmtPct(d.apurado, 1)} apurado${topo}`, 11, { negrito: true, encolher: 0.7 });
    for (const c of d.candidatos.slice(0, 2)) {
      const l = w.addStack();
      texto(l, c.nome, 12, { encolher: 0.6 });
      l.addSpacer();
      texto(l, fmtPct(c.pct), 12, { numero: true });
    }
  }
  return w;
}

// ---------------------------------------------------------- painel ao vivo

/** Link que abre este script no modo painel, com o mesmo parâmetro do widget. */
function urlPainel() {
  const p = args.widgetParameter ? `?p=${encodeURIComponent(args.widgetParameter)}` : "";
  return `scriptable:///run/${encodeURIComponent(Script.name())}${p}`;
}

function paraPainel(d) {
  return {
    ...d,
    atualizado: d.atualizado ? new Date(d.atualizado).toISOString() : null,
    candidatos: d.candidatos.map((c, i) => ({ ...c, cor: hexDo(c, i), selo: selo(c) })),
  };
}

const PAGINA = String.raw`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{--bg:#F4F6F8;--card:#FFF;--tx:#14171A;--sv:#5F6B76;--tr:#E6E9EC;--ok:#0A7A3D;--al:#D97706}
@media (prefers-color-scheme:dark){:root{--bg:#0B0D10;--card:#16191E;--tx:#F2F4F5;--sv:#9AA5B1;--tr:#2A3036;--ok:#22C55E}.pct{filter:brightness(1.7) saturate(.9)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px -apple-system,system-ui,sans-serif;
padding:calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 24px)}
h1{font-size:13px;letter-spacing:.06em;color:var(--ok);margin:0 0 4px;display:flex;align-items:center;gap:8px}
.vivo{width:8px;height:8px;border-radius:50%;background:#E11D48;animation:p 1.6s infinite}@keyframes p{50%{opacity:.25}}
.apur{display:flex;align-items:baseline;gap:8px;margin:2px 0 6px}.apur b{font-size:34px;font-variant-numeric:tabular-nums}
.apur span{color:var(--sv);font-size:14px}
.trilho{height:8px;border-radius:4px;background:var(--tr);overflow:hidden}.trilho i{display:block;height:100%;border-radius:4px;transition:width .8s}
.meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 12px;color:var(--sv);font-size:12px;margin:8px 0 14px}
.aviso{background:var(--al);color:#fff;border-radius:10px;padding:8px 12px;font-size:13px;margin-bottom:12px}
.card{background:var(--card);border-radius:16px;padding:12px 14px;margin-bottom:10px;display:grid;
grid-template-columns:52px 1fr auto;gap:4px 12px;align-items:center}
.card.top{padding:16px 14px}.card.top .foto{width:64px;height:64px}.card.top{grid-template-columns:64px 1fr auto}
.foto{width:52px;height:52px;border-radius:50%;object-fit:cover;object-position:top;border:3px solid;grid-row:span 2;
background:var(--tr);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700}
.nome{font-weight:700;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;grid-column:2/4}
.selo{font-size:11px;color:var(--ok);font-weight:700;margin-left:6px}
.pct{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}
.card.top .pct{font-size:32px}
.sub{color:var(--sv);font-size:12px;display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.card .trilho{grid-column:1/4;height:6px;margin-top:6px}
.dif{text-align:center;color:var(--sv);font-size:13px;margin:4px 0 14px}
.tot{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.tot div{background:var(--card);border-radius:12px;padding:10px;text-align:center;font-size:11px;color:var(--sv)}
.tot b{display:block;color:var(--tx);font-size:15px;margin-top:2px;font-variant-numeric:tabular-nums}
.btns{display:flex;gap:8px}.btns a{flex:1;text-align:center;padding:12px;border-radius:12px;text-decoration:none;
font-weight:600;font-size:14px;background:var(--card);color:var(--tx)}.btns a.pri{background:var(--ok);color:#fff}
.fonte{color:var(--sv);font-size:11px;text-align:center;margin-top:14px}
</style></head><body>
<h1><span class="vivo"></span><span id="tit">APURAÇÃO AO VIVO</span></h1>
<div class="apur"><b id="ap">–</b><span>das urnas apuradas</span></div>
<div class="trilho"><i id="bar" style="width:0;background:var(--ok)"></i></div>
<div class="meta"><span id="sec"></span><span id="cont"></span></div>
<div id="av"></div><div id="lista"></div><div id="dif" class="dif"></div><div id="tot" class="tot"></div>
<div class="btns"><a class="pri" href="app://atualizar">Atualizar agora</a><a href="app://globo">Abrir no O Globo</a></div>
<div class="fonte">Dados oficiais: resultados.tse.jus.br · atualiza sozinho a cada <span id="int"></span>&nbsp;s</div>
<script>
var restante=0,intervalo=30;
function pct(n,c){return n.toLocaleString('pt-BR',{minimumFractionDigits:c==null?2:c,maximumFractionDigits:c==null?2:c})+'%'}
function num(n){return (n||0).toLocaleString('pt-BR')}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function iniciais(n){var p=n.split(' ').filter(function(x){return x.length>2});return ((p[0]||n)[0]+(p[1]?p[1][0]:'')).toUpperCase()}
function render(d,seg){
  intervalo=seg||intervalo;restante=intervalo;document.getElementById('int').textContent=intervalo;
  document.getElementById('tit').textContent=(d.cargo+(d.abrangencia!=='BR'?' · '+d.abrangencia:'')+' · '+d.turno+'º turno').toUpperCase();
  document.getElementById('ap').textContent=pct(d.apurado||0);
  document.getElementById('bar').style.width=(d.apurado||0)+'%';
  document.getElementById('sec').textContent=d.secoes&&d.secoes.total?num(d.secoes.apuradas)+' de '+num(d.secoes.total)+' seções':'';
  document.getElementById('av').innerHTML=d.aviso?'<div class="aviso">'+esc(d.aviso)+'</div>':'';
  var h='';
  d.candidatos.forEach(function(c,i){
    var foto=c.foto?'<img class="foto" style="border-color:'+c.cor+'" src="'+esc(c.foto)+'" onerror="this.outerHTML=\'<div class=&quot;foto&quot; style=&quot;border-color:'+c.cor+';background:'+c.cor+'&quot;>'+esc(iniciais(c.nome))+'</div>\'">'
      :'<div class="foto" style="border-color:'+c.cor+';background:'+c.cor+'">'+esc(iniciais(c.nome))+'</div>';
    h+='<div class="card'+(i<2?' top':'')+'">'+foto+'<div class="nome">'+(i+1)+'. '+esc(c.nome)+(c.selo?'<span class="selo">'+esc(c.selo)+'</span>':'')+'</div>'
      +'<div class="pct" style="color:'+(i<2?c.cor:'inherit')+'">'+pct(c.pct)+'</div>'
      +'<div class="sub"><span>'+esc(c.partido)+' · '+esc(c.numero)+'</span><span>'+num(c.votos)+' votos</span></div>'
      +'<div class="trilho"><i style="width:'+Math.min(100,c.pct)+'%;background:'+c.cor+'"></i></div></div>';
  });
  document.getElementById('lista').innerHTML=h||'<div class="card" style="display:block;color:var(--sv)">Aguardando os primeiros resultados do TSE…</div>';
  var a=d.candidatos[0],b=d.candidatos[1];
  document.getElementById('dif').textContent=a&&b?'Diferença entre 1º e 2º: '+pct(a.pct-b.pct).replace('%',' p.p.')+' · '+num(a.votos-b.votos)+' votos':'';
  document.getElementById('tot').innerHTML=d.candidatos.length?'<div>Brancos<b>'+num(d.brancos)+'</b></div><div>Nulos<b>'+num(d.nulos)+'</b></div><div>Abstenção<b>'+pct(d.abstencao||0,1)+'</b></div>':'';
  document.getElementById('cont').dataset.hora=d.atualizado?new Date(d.atualizado).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';
  tique();
}
function tique(){var e=document.getElementById('cont');e.textContent=(e.dataset.hora?'TSE '+e.dataset.hora+' · ':'')+'próxima em '+Math.max(0,restante)+'s'}
setInterval(function(){restante--;tique()},1000);
</script></body></html>`;

async function painelAoVivo(p) {
  const wv = new WebView();
  await wv.loadHTML(PAGINA);
  let ocupado = false;
  const atualizar = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const d = p.demo ? dadosDemo(p) : await carregarApuracao(p);
      await wv.evaluateJavaScript(`render(${JSON.stringify(paraPainel(d))}, ${CONFIG.painelACadaSeg})`);
    } catch (e) {
    } finally {
      ocupado = false;
    }
  };
  wv.shouldAllowRequest = (req) => {
    if (req.url === "app://atualizar") {
      atualizar();
      return false;
    }
    if (req.url === "app://globo") {
      Safari.open(CONFIG.linkGlobo);
      return false;
    }
    return true;
  };
  await atualizar();
  const timer = Timer.schedule(CONFIG.painelACadaSeg * 1000, true, atualizar);
  await wv.present(true);
  timer.invalidate();
}

// -------------------------------------------------------------------- main

const parametro = lerParametro(args.widgetParameter || (args.queryParameters || {}).p);
const familia = config.widgetFamily || "medium";

if (emWidget) {
  const dados = parametro.demo ? dadosDemo(parametro) : await carregarApuracao(parametro);
  const w = familia.startsWith("accessory") ? widgetBloqueio(dados, familia) : await widgetTela(dados, familia);
  w.refreshAfterDate = new Date(Date.now() + CONFIG.atualizarACadaMin * 60 * 1000);
  Script.setWidget(w);
} else {
  // No app (ou tocando no widget): painel ao vivo, que se atualiza sozinho.
  await painelAoVivo(parametro);
}
Script.complete();
