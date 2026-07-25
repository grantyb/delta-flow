import * as vscode from 'vscode';

/** The text filters exchanged with the webview form (status lives in the title bar). */
export interface FilterState {
  patterns: string;
  search: string;
}

export type FocusField = 'path' | 'search';

/**
 * A docked webview form that combines the path filter, change search, and status
 * checkboxes. It applies live: every edit posts the whole state back, which the
 * DiffView turns into a re-render.
 */
export class FilterPanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onApply: (state: FilterState) => void,
    private readonly getState: () => FilterState,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'apply') {
        this.onApply(message.state as FilterState);
      } else if (message?.type === 'ready') {
        this.seed(); // The form loaded and is listening — safe to send initial state.
      }
    });
    // Re-seed whenever the form (re)appears, so it mirrors the live filter.
    view.onDidChangeVisibility(() => this.seed());
  }

  /** Reveal the panel and move keyboard focus into one of its inputs. */
  focus(field: FocusField): void {
    this.view?.show?.(); // Expand/reveal and take focus, so the input can receive it.
    this.view?.webview.postMessage({ type: 'focus', field });
  }

  /** Push the current filter values into the form. */
  seed(): void {
    this.view?.webview.postMessage({ type: 'state', state: this.getState() });
  }

  private html(webview: vscode.Webview): string {
    const nonce = makeNonce();
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
    body { padding: 4px 10px 8px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    label { display: block; margin: 6px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .8; }
    .head { display: flex; align-items: baseline; justify-content: space-between; }
    .head label { margin: 6px 0 2px; }
    .linkbtn {
      background: none; border: none; padding: 0; cursor: pointer;
      font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
      color: var(--vscode-textLink-foreground);
    }
    .linkbtn:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
    .linkbtn:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    input[type=text] {
      width: 100%; box-sizing: border-box; padding: 3px 6px;
      color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; outline: none;
    }
    input[type=text]:focus { border-color: var(--vscode-focusBorder); }
    input[type=text]::placeholder { color: var(--vscode-input-placeholderForeground); }
  </style>
</head>
<body>
  <div class="head">
    <label for="path">Path filter</label>
    <button id="clear" class="linkbtn" type="button">Clear</button>
  </div>
  <input id="path" type="text" placeholder="*.ts, !**/target/**  ·  ! excludes" spellcheck="false">
  <label for="search">Search changes</label>
  <input id="search" type="text" placeholder="regex over changed lines" spellcheck="false">
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const path = document.getElementById('path');
    const search = document.getElementById('search');

    let timer;
    function debounced() { clearTimeout(timer); timer = setTimeout(apply, 250); }
    path.addEventListener('input', debounced);
    search.addEventListener('input', debounced);
    document.getElementById('clear').addEventListener('click', () => {
      path.value = ''; search.value = '';
      apply();
    });

    function apply() {
      clearTimeout(timer);
      vscode.postMessage({ type: 'apply', state: { patterns: path.value, search: search.value } });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        path.value = msg.state.patterns || '';
        search.value = msg.state.search || '';
      } else if (msg.type === 'focus') {
        const field = msg.field === 'search' ? search : path;
        field.focus();
        field.select();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
