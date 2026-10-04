// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: download;

// Baixa (ou atualiza) o widget "Apuração 2026" direto do GitHub.
const URL_SCRIPT =
  "https://raw.githubusercontent.com/gabrielmotarc-ship-it/manivest/claude/eleicoes-2026-widget-6erzmz/scriptable/Apuracao2026.js";
const NOME = "Apuração 2026";

const codigo = await new Request(URL_SCRIPT).loadString();
if (!codigo.includes("Apuração 2026")) throw new Error("Download inválido — confira a conexão.");

const fm = (() => { try { return FileManager.iCloud(); } catch (e) { return FileManager.local(); } })();
fm.writeString(fm.joinPath(fm.documentsDirectory(), NOME + ".js"), codigo);

const a = new Alert();
a.title = "Pronto!";
a.message = `O script "${NOME}" foi instalado. Agora adicione um widget do Scriptable na tela inicial e escolha "${NOME}".`;
a.addAction("OK");
await a.present();
Script.complete();
