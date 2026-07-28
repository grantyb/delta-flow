import * as vscode from 'vscode';
import { DirectoryStatus } from './directoryCompare';
import { PullRequest, PullRequestListing } from './pullRequests';

type Side = 'left' | 'right';

/** The comparisons the welcome view can start, wired to the extension's commands. */
export interface WelcomeActions {
  isGitRepository(): Promise<boolean>;
  diffWorkingTree(): void;
  loadPullRequests(): Promise<PullRequestListing>;
  diffPullRequest(pullRequest: PullRequest): void;
  pickDirectory(current: string): Promise<string | undefined>;
  checkDirectory(input: string): Promise<DirectoryStatus>;
  completeDirectory(input: string): Promise<string | undefined>;
  compareDirectories(left: string, right: string): void;
}

/**
 * The sidebar shown when no comparison is open. It offers working-tree and
 * pull-request comparisons when the folder is Git managed (hiding them with a
 * note when it is not), plus a directory-to-directory comparison that always
 * applies. Pull requests load lazily the first time the view appears.
 */
export class WelcomePanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private pullRequests: PullRequest[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly actions: WelcomeActions,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message) => this.onMessage(message));
  }

  private onMessage(message: Message): void {
    switch (message?.type) {
      case 'ready': void this.initialize(); break;
      case 'reload': void this.refreshPullRequests(); break;
      case 'diffWorkingTree': this.actions.diffWorkingTree(); break;
      case 'diffPullRequest': this.openPullRequest(message.number); break;
      case 'validateDir': void this.validateDirectory(message.side!, message.value ?? ''); break;
      case 'completeDir': void this.completeDirectory(message.side!, message.value ?? ''); break;
      case 'pickDir': void this.pickDirectory(message.side!, message.value ?? ''); break;
      case 'compareDirectories': this.actions.compareDirectories(message.left ?? '', message.right ?? ''); break;
    }
  }

  /** Report whether Git features apply, then load pull requests if they do. */
  private async initialize(): Promise<void> {
    const gitManaged = await this.actions.isGitRepository();
    this.post({ type: 'environment', gitManaged });
    if (gitManaged) {
      await this.refreshPullRequests();
    }
  }

  private openPullRequest(number?: number): void {
    const pullRequest = this.pullRequests.find((candidate) => candidate.number === number);
    if (pullRequest) {
      this.actions.diffPullRequest(pullRequest);
    }
  }

  /** Load the open pull requests and hand the result to the form to render. */
  private async refreshPullRequests(): Promise<void> {
    this.post({ type: 'loading' });
    const listing = await this.actions.loadPullRequests();
    this.pullRequests = listing.status === 'ok' ? listing.pullRequests : [];
    this.post({ type: 'pullRequests', listing });
  }

  private async validateDirectory(side: Side, value: string): Promise<void> {
    const status = await this.actions.checkDirectory(value);
    this.post({ type: 'dirValidity', side, valid: status.ok, message: status.message });
  }

  private async completeDirectory(side: Side, value: string): Promise<void> {
    const completed = await this.actions.completeDirectory(value);
    if (completed !== undefined) {
      this.post({ type: 'dirCompletion', side, value: completed });
    }
  }

  private async pickDirectory(side: Side, current: string): Promise<void> {
    const picked = await this.actions.pickDirectory(current);
    if (picked) {
      this.post({ type: 'dirPicked', side, path: picked });
    }
  }

  private post(message: unknown): void {
    void this.view?.webview.postMessage(message);
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
    body { padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    .form.divided { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.25)); }
    .field { margin-bottom: 6px; }
    label { display: block; margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .8; }
    button.action {
      width: 100%; box-sizing: border-box; padding: 5px 10px; cursor: pointer;
      color: var(--vscode-button-foreground); background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px;
    }
    button.action:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    button.action:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    button.action:disabled { opacity: .5; cursor: default; }
    select {
      width: 100%; box-sizing: border-box; padding: 3px 6px; margin-bottom: 6px;
      color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 2px; outline: none;
    }
    select:focus { border-color: var(--vscode-focusBorder); }
    .status { margin-bottom: 6px; opacity: .8; }
    .notice { margin-bottom: 6px; opacity: .8; }
    .head { display: flex; align-items: baseline; justify-content: space-between; }
    .head label { margin-bottom: 4px; }
    .iconbtn {
      background: none; border: none; padding: 0 2px; cursor: pointer; line-height: 1; font-size: 14px;
      color: var(--vscode-icon-foreground, var(--vscode-foreground));
    }
    .iconbtn:hover:not(:disabled) { color: var(--vscode-textLink-activeForeground); }
    .iconbtn:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    .iconbtn:disabled { opacity: .5; cursor: default; }
    .dirrow { position: relative; display: flex; gap: 4px; margin-bottom: 6px; }
    .dirrow input {
      flex: 1; min-width: 0; box-sizing: border-box; padding: 3px 6px;
      color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; outline: none;
    }
    .dirrow input:focus { border-color: var(--vscode-focusBorder); }
    .dirrow input.invalid { border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground)); }
    .dirrow input::placeholder { color: var(--vscode-input-placeholderForeground); }
    .browse {
      flex: 0 0 auto; padding: 3px 8px; cursor: pointer;
      color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px;
    }
    .browse:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .browse:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
    .tip {
      position: absolute; top: 100%; left: 0; right: 0; margin-top: 2px; z-index: 5;
      padding: 4px 8px; border-radius: 2px; font-size: 12px;
      color: var(--vscode-inputValidation-errorForeground, var(--vscode-foreground));
      background: var(--vscode-inputValidation-errorBackground, var(--vscode-editorWidget-background));
      border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <section id="wtForm" class="form git hidden">
    <label>Working tree</label>
    <button id="workingTree" class="action" type="button">Diff Working Tree</button>
  </section>
  <section id="prForm" class="form git hidden">
    <div class="head">
      <label for="pr">Pull request</label>
      <button id="reload" class="iconbtn" type="button" title="Refresh" aria-label="Refresh">↻</button>
    </div>
    <div id="prStatus" class="status">Loading pull requests…</div>
    <select id="pr" class="hidden"></select>
    <button id="diffPr" class="action hidden" type="button" disabled>Diff Pull Request</button>
  </section>
  <div id="gitUnavailable" class="notice hidden">
    The current directory is not Git managed. Git features are unavailable.
  </div>
  <section id="cmpForm" class="form">
    <label>Compare directories</label>
    <div class="dirrow field">
      <input id="leftDir" type="text" placeholder="First directory — Tab to complete" spellcheck="false">
      <button class="browse" type="button" data-side="left" title="Choose directory…">Browse…</button>
      <div id="leftTip" class="tip hidden"></div>
    </div>
    <div class="dirrow field">
      <input id="rightDir" type="text" placeholder="Second directory — Tab to complete" spellcheck="false">
      <button class="browse" type="button" data-side="right" title="Choose directory…">Browse…</button>
      <div id="rightTip" class="tip hidden"></div>
    </div>
    <button id="compareBtn" class="action" type="button" disabled>Compare Directories</button>
  </section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const select = document.getElementById('pr');
    const diffPr = document.getElementById('diffPr');
    const status = document.getElementById('prStatus');
    const reload = document.getElementById('reload');
    const inputs = { left: document.getElementById('leftDir'), right: document.getElementById('rightDir') };
    const tips = { left: document.getElementById('leftTip'), right: document.getElementById('rightTip') };
    const compareBtn = document.getElementById('compareBtn');
    const valid = { left: false, right: false };

    document.getElementById('workingTree').addEventListener('click', () =>
      vscode.postMessage({ type: 'diffWorkingTree' }));
    reload.addEventListener('click', () => vscode.postMessage({ type: 'reload' }));
    select.addEventListener('change', () => { diffPr.disabled = !select.value; });
    diffPr.addEventListener('click', () => {
      if (select.value) {
        vscode.postMessage({ type: 'diffPullRequest', number: Number(select.value) });
      }
    });

    for (const side of ['left', 'right']) {
      let timer;
      inputs[side].addEventListener('input', () => {
        setValidity(side, false, undefined);
        clearTimeout(timer);
        timer = setTimeout(() => vscode.postMessage({ type: 'validateDir', side, value: inputs[side].value }), 200);
      });
      inputs[side].addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          vscode.postMessage({ type: 'completeDir', side, value: inputs[side].value });
        }
      });
    }
    for (const btn of document.querySelectorAll('.browse')) {
      btn.addEventListener('click', () =>
        vscode.postMessage({ type: 'pickDir', side: btn.dataset.side, value: inputs[btn.dataset.side].value }));
    }
    compareBtn.addEventListener('click', () => {
      if (valid.left && valid.right) {
        vscode.postMessage({ type: 'compareDirectories', left: inputs.left.value, right: inputs.right.value });
      }
    });

    function setValidity(side, isValid, message) {
      valid[side] = isValid;
      const nonEmpty = inputs[side].value.trim() !== '';
      inputs[side].classList.toggle('invalid', nonEmpty && !isValid);
      tips[side].textContent = message || '';
      show(tips[side], Boolean(message));
      compareBtn.disabled = !(valid.left && valid.right);
    }

    function applyValue(side, value) {
      inputs[side].value = value;
      inputs[side].setSelectionRange(value.length, value.length);
      vscode.postMessage({ type: 'validateDir', side, value });
    }

    function show(el, visible) { el.classList.toggle('hidden', !visible); }

    function applyDividers() {
      let seenVisible = false;
      for (const form of document.querySelectorAll('.form')) {
        const visible = !form.classList.contains('hidden');
        form.classList.toggle('divided', visible && seenVisible);
        seenVisible = seenVisible || visible;
      }
    }

    function showLoading() {
      status.textContent = 'Loading pull requests…';
      reload.disabled = true;
      show(status, true); show(select, false); show(diffPr, false);
    }

    function showMessage(text) {
      status.textContent = text;
      reload.disabled = false;
      show(status, true); show(select, false); show(diffPr, false);
    }

    function showPullRequests(listing) {
      select.innerHTML = '';
      const placeholder = new Option('Select a pull request…', '');
      placeholder.disabled = true; placeholder.selected = true;
      select.add(placeholder);
      for (const pr of listing.pullRequests) {
        const draft = pr.isDraft ? ' (draft)' : '';
        select.add(new Option('#' + pr.number + ' ' + pr.title + draft, String(pr.number)));
      }
      diffPr.disabled = true;
      reload.disabled = false;
      show(status, false); show(select, true); show(diffPr, true);
    }

    function renderPullRequests(listing) {
      switch (listing.status) {
        case 'ok': showPullRequests(listing); break;
        case 'empty': showMessage(listing.repository + ' has no open pull requests.'); break;
        case 'no-repo': showMessage('Open a folder that is a Git repository to compare pull requests.'); break;
        case 'no-cli': showMessage('GitHub CLI (gh) not found. Install it and run "gh auth login" to compare pull requests.'); break;
        default: showMessage('Could not load pull requests: ' + listing.message);
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'environment':
          for (const el of document.querySelectorAll('.git')) { show(el, msg.gitManaged); }
          show(document.getElementById('gitUnavailable'), !msg.gitManaged);
          applyDividers();
          break;
        case 'loading': showLoading(); break;
        case 'pullRequests': renderPullRequests(msg.listing); break;
        case 'dirValidity': setValidity(msg.side, msg.valid, msg.message); break;
        case 'dirCompletion': applyValue(msg.side, msg.value); break;
        case 'dirPicked': applyValue(msg.side, msg.path); break;
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

interface Message {
  type?: string;
  number?: number;
  side?: Side;
  value?: string;
  left?: string;
  right?: string;
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
