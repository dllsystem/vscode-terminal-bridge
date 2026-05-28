import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';

const OUTPUT_CHANNEL_NAME = 'Terminal Image Paste';
const VIEW_ID = 'terminalImagePaste.bridge';
const READ_TIMEOUT_MS = 3000;

interface ExtensionConfig {
  saveDirectory: string;
  maxAgeHours: number;
  maxFileSizeMB: number;
}

interface WebviewImageResult {
  type: 'image-result';
  mime: string;
  dataUrl: string;
  requestId: string;
}

interface WebviewErrorResult {
  type: 'error';
  code: string;
  message: string;
  requestId: string;
}

interface WebviewEmptyResult {
  type: 'empty';
  requestId: string;
}

type WebviewResponse = WebviewImageResult | WebviewErrorResult | WebviewEmptyResult;

function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('terminalImagePaste');
  return {
    saveDirectory: cfg.get<string>('saveDirectory', '/tmp/clipboard'),
    maxAgeHours: cfg.get<number>('maxAgeHours', 24),
    maxFileSizeMB: cfg.get<number>('maxFileSizeMB', 10),
  };
}

function mimeToExt(mime: string): string {
  if (mime.includes('png')) {
    return 'png';
  }
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    return 'jpg';
  }
  if (mime.includes('webp')) {
    return 'webp';
  }
  if (mime.includes('gif')) {
    return 'gif';
  }
  return 'bin';
}

function generateFilename(mime: string): string {
  const ts = Date.now();
  const rand = randomBytes(3).toString('hex');
  return `img-${ts}-${rand}.${mimeToExt(mime)}`;
}

class UntitledDocumentError extends Error {
  constructor() {
    super('Salve o arquivo antes de gerar a referencia (arquivo untitled nao tem caminho no disco).');
    this.name = 'UntitledDocumentError';
  }
}

function extractSelectionRef(editor: vscode.TextEditor): string {
  const document = editor.document;
  if (document.isUntitled) {
    throw new UntitledDocumentError();
  }

  const filePath = document.uri.fsPath;
  const sel = editor.selection;

  const startLine = sel.start.line + 1;
  const startCol = sel.start.character + 1;
  const endLine = sel.end.line + 1;
  const endCol = sel.end.character + 1;

  if (sel.isEmpty) {
    return ` ${filePath}:${startLine} `;
  }

  if (sel.start.line === sel.end.line) {
    return ` ${filePath}:${startLine}:${startCol}-${endCol} `;
  }

  const endLineLength = document.lineAt(sel.end.line).text.length;
  const startsAtLineBegin = sel.start.character === 0;
  const endsAtLineBegin = sel.end.character === 0;
  const endsAtLineEnd = sel.end.character === endLineLength;

  if (startsAtLineBegin && (endsAtLineBegin || endsAtLineEnd)) {
    const realEndLine = endsAtLineBegin ? endLine - 1 : endLine;
    if (startLine === realEndLine) {
      return ` ${filePath}:${startLine} `;
    }
    return ` ${filePath}:${startLine}-${realEndLine} `;
  }

  return ` ${filePath}:${startLine}:${startCol}-${endLine}:${endCol} `;
}

async function sendSelectionRefToTerminal(output: vscode.OutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Abra um arquivo antes de usar este comando.');
    return;
  }

  let ref: string;
  try {
    ref = extractSelectionRef(editor);
  } catch (err) {
    vscode.window.showWarningMessage((err as Error).message);
    return;
  }

  const terminal = vscode.window.activeTerminal;
  if (!terminal) {
    vscode.window.showWarningMessage('Abra um terminal antes de enviar a referencia.');
    return;
  }

  await vscode.commands.executeCommand('workbench.action.terminal.focus');
  terminal.sendText(ref, false);
  output.appendLine(`[${new Date().toISOString()}] sendSelectionRef: ${ref.trim()}`);
}

async function copySelectionRefToClipboard(output: vscode.OutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Abra um arquivo antes de usar este comando.');
    return;
  }

  let ref: string;
  try {
    ref = extractSelectionRef(editor);
  } catch (err) {
    vscode.window.showWarningMessage((err as Error).message);
    return;
  }

  await vscode.env.clipboard.writeText(ref);
  const trimmed = ref.trim();
  const shown = trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
  vscode.window.showInformationMessage(`Reference copied: ${shown}`);
  output.appendLine(`[${new Date().toISOString()}] copySelectionRef: ${trimmed}`);
}

class ClipboardBridge {
  private readonly output: vscode.OutputChannel;
  private readonly extensionUri: vscode.Uri;
  private activePanel: vscode.WebviewPanel | undefined;

  constructor(extensionUri: vscode.Uri, output: vscode.OutputChannel) {
    this.extensionUri = extensionUri;
    this.output = output;
  }

  public async readClipboardImage(): Promise<WebviewResponse> {
    if (this.activePanel) {
      this.activePanel.dispose();
      this.activePanel = undefined;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_ID,
      'Image Paste Bridge',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [this.extensionUri],
      }
    );
    this.activePanel = panel;

    const htmlUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.html');
    panel.webview.html = this.loadHtmlSync(htmlUri);

    const requestId = randomBytes(4).toString('hex');

    try {
      return await new Promise<WebviewResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          subscription.dispose();
          reject(new Error('Timeout aguardando resposta do webview.'));
        }, READ_TIMEOUT_MS);

        const subscription = panel.webview.onDidReceiveMessage((message: { type: string; [k: string]: unknown }) => {
          if (message.type === 'log') {
            this.log(`  webview: ${message.message}`);
            return;
          }
          if (message.requestId === requestId) {
            clearTimeout(timer);
            subscription.dispose();
            resolve(message as unknown as WebviewResponse);
          }
        });

        panel.webview.postMessage({ type: 'readClipboard', requestId });
      });
    } finally {
      panel.dispose();
      if (this.activePanel === panel) {
        this.activePanel = undefined;
      }
    }
  }

  private loadHtmlSync(uri: vscode.Uri): string {
    return require('fs').readFileSync(uri.fsPath, 'utf8');
  }

  private log(line: string): void {
    this.output.appendLine(`[${new Date().toISOString()}] ${line}`);
  }
}

class PasteOrchestrator {
  private readonly output: vscode.OutputChannel;
  private readonly bridge: ClipboardBridge;
  private busy = false;

  constructor(bridge: ClipboardBridge, output: vscode.OutputChannel) {
    this.bridge = bridge;
    this.output = output;
  }

  public async smartPaste(): Promise<void> {
    if (this.busy) {
      this.log('Paste em andamento, ignorando este disparo.');
      return;
    }
    this.busy = true;
    try {
      const terminal = vscode.window.activeTerminal;
      if (!terminal) {
        this.log('Nenhum terminal ativo; abortando.');
        return;
      }

      const text = await vscode.env.clipboard.readText();
      if (text && text.length > 0) {
        this.log('Fast-path: clipboard tem texto. Enviando ao terminal.');
        terminal.sendText(text, false);
        return;
      }

      this.log('Slow-path: clipboard parece vazio em texto. Ativando bridge para ler imagem.');
      await this.imagePaste();
    } catch (err) {
      this.log(`Erro inesperado no smartPaste: ${(err as Error).message}`);
      vscode.window.showWarningMessage(`Falha ao processar paste: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  public async imagePaste(): Promise<void> {
    if (this.busy && !this.isCalledFromSmartPaste()) {
      this.log('Paste em andamento, ignorando este disparo.');
      return;
    }
    const wasOuterCall = !this.busy;
    if (wasOuterCall) {
      this.busy = true;
    }
    try {
      const terminal = vscode.window.activeTerminal;
      if (!terminal) {
        vscode.window.showWarningMessage('Abra um terminal antes de colar imagem.');
        return;
      }

      let response: WebviewResponse;
      try {
        response = await this.bridge.readClipboardImage();
      } catch (err) {
        this.log(`Erro lendo clipboard via bridge: ${(err as Error).message}`);
        vscode.window.showWarningMessage(`Falha ao ler imagem do clipboard: ${(err as Error).message}`);
        return;
      }

      if (response.type === 'error') {
        await this.handleWebviewError(response);
        return;
      }

      if (response.type === 'empty') {
        this.log('Webview reportou clipboard vazio.');
        vscode.window.showInformationMessage('Clipboard nao contem imagem.');
        return;
      }

      const filePath = await this.saveImageFromDataUrl(response);
      if (!filePath) {
        return;
      }

      await vscode.commands.executeCommand('workbench.action.terminal.focus');
      terminal.sendText(filePath, false);
      this.log(`Caminho enviado ao terminal: ${filePath}`);

      cleanupOldFiles(this.output).catch((err) =>
        this.log(`Cleanup oportunistico falhou: ${(err as Error).message}`)
      );
    } finally {
      if (wasOuterCall) {
        this.busy = false;
      }
    }
  }

  private isCalledFromSmartPaste(): boolean {
    return this.busy;
  }

  private async handleWebviewError(err: WebviewErrorResult): Promise<void> {
    this.log(`Webview error: ${err.code} - ${err.message}`);
    if (err.code === 'NotAllowedError') {
      const action = await vscode.window.showWarningMessage(
        'Sem permissao para ler o clipboard. Verifique nas configuracoes do Chrome (cadeado da URL > Permissoes > Clipboard) e tente novamente.',
        'Abrir documentacao'
      );
      if (action === 'Abrir documentacao') {
        vscode.env.openExternal(
          vscode.Uri.parse('https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API')
        );
      }
      return;
    }
    vscode.window.showWarningMessage(`Erro do webview: ${err.message}`);
  }

  private async saveImageFromDataUrl(img: WebviewImageResult): Promise<string | null> {
    const cfg = readConfig();
    const base64 = img.dataUrl.split(',')[1] ?? '';
    if (!base64) {
      this.log('dataUrl invalida; nada a salvar.');
      return null;
    }
    const buffer = Buffer.from(base64, 'base64');
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > cfg.maxFileSizeMB) {
      vscode.window.showWarningMessage(
        `Imagem muito grande (${sizeMB.toFixed(1)}MB > limite ${cfg.maxFileSizeMB}MB). Configuravel em settings.`
      );
      return null;
    }

    await fs.mkdir(cfg.saveDirectory, { recursive: true });
    const filename = generateFilename(img.mime);
    const filePath = path.join(cfg.saveDirectory, filename);
    await fs.writeFile(filePath, buffer);
    this.log(`Imagem salva: ${filePath} (${buffer.length} bytes, mime=${img.mime})`);
    return filePath;
  }

  private log(line: string): void {
    this.output.appendLine(`[${new Date().toISOString()}] ${line}`);
  }
}

async function cleanupOldFiles(output: vscode.OutputChannel): Promise<void> {
  const cfg = readConfig();
  let entries: string[];
  try {
    entries = await fs.readdir(cfg.saveDirectory);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
  const cutoff = Date.now() - cfg.maxAgeHours * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of entries) {
    if (!entry.startsWith('img-')) {
      continue;
    }
    const fullPath = path.join(cfg.saveDirectory, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile() && stat.mtimeMs < cutoff) {
        await fs.unlink(fullPath);
        removed += 1;
      }
    } catch {
      // ignora arquivos que sumiram entre readdir e stat
    }
  }
  if (removed > 0) {
    output.appendLine(`[${new Date().toISOString()}] cleanup: removidos ${removed} arquivos antigos de ${cfg.saveDirectory}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  output.appendLine(`[${new Date().toISOString()}] activate: Terminal Image Paste`);

  const bridge = new ClipboardBridge(context.extensionUri, output);
  const orchestrator = new PasteOrchestrator(bridge, output);

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalImagePaste.smartPaste', () => orchestrator.smartPaste())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalImagePaste.imagePaste', () => orchestrator.imagePaste())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalImagePaste.sendSelectionRefToTerminal', () =>
      sendSelectionRefToTerminal(output)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalImagePaste.copySelectionRefToClipboard', () =>
      copySelectionRefToClipboard(output)
    )
  );

  cleanupOldFiles(output).catch((err) =>
    output.appendLine(`[${new Date().toISOString()}] cleanup inicial falhou: ${(err as Error).message}`)
  );
}

export function deactivate(): void {}
