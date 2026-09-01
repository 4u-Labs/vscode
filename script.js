// =====================================================
// VS Code Pro 2026 — Monaco Editor Web IDE Engine
// =====================================================

const state = {
    editor: null,
    files: new Map(), // path -> { name, path, content, model, isDirty, handle }
    activeFilePath: null,
    openTabs: [],
    activePanel: 'explorer',
    activeBottomTab: 'terminal',
    isLivePreviewOpen: false,
    previewDevice: 'desktop',
    currentTheme: 'vs-dark',
    commandHistory: [],
    historyIndex: -1,
    settings: {
        fontSize: 14,
        tabSize: 2,
        wordWrap: 'on',
        minimap: true,
        autoSave: false,
        formatOnSave: true
    },
    directoryHandle: null,
    searchOptions: {
        case: false,
        word: false,
        regex: false
    }
};

// Monaco AMD Loader Configuration
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

document.addEventListener('DOMContentLoaded', () => {
    initMonaco();
    initUIEvents();
    initSettingsPanel();
    initThemePicker();
    initTerminalREPL();
});

// ==================== Monaco Editor Initialization ====================
function initMonaco() {
    require(['vs/editor/editor.main'], function () {
        // Register custom VS Code themes
        registerCustomMonacoThemes();

        const container = document.getElementById('monacoEditorHost');
        if (!container) return;

        state.editor = monaco.editor.create(container, {
            value: '',
            language: 'html',
            theme: state.currentTheme,
            fontSize: state.settings.fontSize,
            tabSize: state.settings.tabSize,
            wordWrap: state.settings.wordWrap,
            minimap: { enabled: state.settings.minimap },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
            formatOnPaste: true,
            formatOnType: true,
            padding: { top: 12, bottom: 12 },
            fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
            fontLigatures: true,
            renderWhitespace: 'selection'
        });

        // Editor events
        state.editor.onDidChangeModelContent(() => {
            if (state.activeFilePath) {
                const file = state.files.get(state.activeFilePath);
                if (file) {
                    file.content = state.editor.getValue();
                    file.isDirty = true;
                    updateTabsBar();
                    updateFileTreeUI();
                    updateGitModifiedList();
                    if (state.isLivePreviewOpen) {
                        debounceLivePreview();
                    }
                }
            }
        });

        state.editor.onDidChangeCursorPosition((e) => {
            const statusLineCol = document.getElementById('statusLineCol');
            if (statusLineCol) {
                statusLineCol.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
            }
        });

        // Keybindings in Monaco
        state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveActiveFile();
        });

        state.editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
            editorFormatDocument();
        });

        state.editor.addCommand(monaco.KeyCode.F5, () => {
            runActiveCode();
        });

        state.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyL, () => {
            toggleLivePreview();
        });

        // Load Default Sample Project
        loadSampleProject('web');
    });
}

function registerCustomMonacoThemes() {
    // Dracula Theme
    monaco.editor.defineTheme('dracula', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
            { token: 'string', foreground: 'f1fa8c' },
            { token: 'keyword', foreground: 'ff79c6', fontStyle: 'bold' },
            { token: 'number', foreground: 'bd93f9' },
            { token: 'type', foreground: '8be9fd' },
            { token: 'function', foreground: '50fa7b' }
        ],
        colors: {
            'editor.background': '#282a36',
            'editor.foreground': '#f8f8f2',
            'editor.lineHighlightBackground': '#44475a44',
            'editorCursor.foreground': '#aeafad',
            'editorWhitespace.foreground': '#44475a',
            'editorIndentGuide.background': '#44475a'
        }
    });

    // Monokai Theme
    monaco.editor.defineTheme('monokai', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '75715e' },
            { token: 'string', foreground: 'e6db74' },
            { token: 'keyword', foreground: 'f92672', fontStyle: 'bold' },
            { token: 'number', foreground: 'ae81ff' },
            { token: 'function', foreground: 'a6e22e' }
        ],
        colors: {
            'editor.background': '#272822',
            'editor.foreground': '#f8f8f2',
            'editor.lineHighlightBackground': '#3e3d32',
            'editorCursor.foreground': '#f8f8f0'
        }
    });

    // One Dark Pro Theme
    monaco.editor.defineTheme('one-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
            { token: 'string', foreground: '98c379' },
            { token: 'keyword', foreground: 'c678dd' },
            { token: 'number', foreground: 'd19a66' },
            { token: 'function', foreground: '61afef' }
        ],
        colors: {
            'editor.background': '#21252b',
            'editor.foreground': '#abb2bf',
            'editor.lineHighlightBackground': '#2c313a'
        }
    });

    // Cyberpunk Neon
    monaco.editor.defineTheme('cyberpunk', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '00e5ff', fontStyle: 'italic' },
            { token: 'string', foreground: '00ff9f' },
            { token: 'keyword', foreground: 'ff007f', fontStyle: 'bold' },
            { token: 'number', foreground: 'ffe600' },
            { token: 'function', foreground: '7b2cbf' }
        ],
        colors: {
            'editor.background': '#0d0d1a',
            'editor.foreground': '#f0f6fc',
            'editor.lineHighlightBackground': '#1b1b3a'
        }
    });
}

// ==================== Sample Demo Project ====================
function loadSampleProject(type = 'web') {
    state.files.clear();
    state.openTabs = [];

    const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Minha Aplicação 4U</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="card-hero">
        <div class="badge">🚀 VS Code Pro 2026</div>
        <h1>Construa seu futuro com IA & Código</h1>
        <p>Editor de código completo com Monaco Engine oficial da Microsoft, IntelliSense e Live Server integrado.</p>
        
        <div class="interactive-box">
            <button id="btnCounter" class="btn-primary">Cliques: <span id="countVal">0</span></button>
            <button id="btnColor" class="btn-secondary">Mudar Fundo</button>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>`;

    const styleCss = `/* Design System da Aplicação */
body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at top, #1e1b4b 0%, #0f172a 100%);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    color: #fff;
}

.card-hero {
    background: rgba(30, 41, 59, 0.7);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 24px;
    padding: 40px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
}

.badge {
    display: inline-block;
    background: linear-gradient(135deg, #6366f1, #a855f7);
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    margin-bottom: 16px;
}

h1 {
    font-size: 1.8rem;
    margin-bottom: 12px;
    background: linear-gradient(135deg, #fff, #c084fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

p {
    color: #94a3b8;
    font-size: 0.95rem;
    line-height: 1.6;
    margin-bottom: 24px;
}

.interactive-box {
    display: flex;
    justify-content: center;
    gap: 12px;
}

button {
    padding: 10px 20px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
}

.btn-primary {
    background: linear-gradient(135deg, #6366f1, #a855f7);
    color: #fff;
    box-shadow: 0 4px 20px rgba(168, 85, 247, 0.4);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(168, 85, 247, 0.6);
}

.btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
}`;

    const appJs = `// Lógica da Aplicação Interativa
console.log("🚀 VS Code Pro inicializado com sucesso!");

let count = 0;
const btnCounter = document.getElementById('btnCounter');
const countVal = document.getElementById('countVal');
const btnColor = document.getElementById('btnColor');

if (btnCounter && countVal) {
    btnCounter.addEventListener('click', () => {
        count++;
        countVal.textContent = count;
        console.log(\`Contador atualizado para: \${count}\`);
    });
}

if (btnColor) {
    btnColor.addEventListener('click', () => {
        const colors = [
            'radial-gradient(circle at top, #1e1b4b 0%, #0f172a 100%)',
            'radial-gradient(circle at top, #064e3b 0%, #022c22 100%)',
            'radial-gradient(circle at top, #4c0519 0%, #1e1b4b 100%)',
            'radial-gradient(circle at top, #0f172a 0%, #020617 100%)'
        ];
        const nextColor = colors[Math.floor(Math.random() * colors.length)];
        document.body.style.background = nextColor;
        console.log("Cor de fundo alterada!");
    });
}`;

    const readmeMd = `# VS Code Pro 2026

Bem-vindo ao **VS Code Pro Web IDE**, seu ambiente de codificação na nuvem.

### ✨ Principais Recursos:
- **Monaco Editor Oficial (Microsoft)**: IntelliSense, auto-complete, multi-cursor, minimapa e formatação.
- **▶ Live Preview**: Split View com hot-reload automático.
- **📂 File System API**: Abra e salve pastas diretamente do seu PC com \`Ctrl+S\`.
- **💻 Terminal JS REPL**: Execute e depure comandos diretamente no console.
- **🎨 6+ Temas Oficiais**: VS Dark, Dracula, Monokai, One Dark Pro, Cyberpunk.
`;

    addVirtualFile('index.html', indexHtml);
    addVirtualFile('style.css', styleCss);
    addVirtualFile('app.js', appJs);
    addVirtualFile('README.md', readmeMd);

    updateFileTreeUI();
    openFileInEditor('index.html');
}

function addVirtualFile(path, content) {
    const ext = path.split('.').pop().toLowerCase();
    let lang = 'plaintext';
    if (ext === 'html') lang = 'html';
    else if (ext === 'css') lang = 'css';
    else if (ext === 'js') lang = 'javascript';
    else if (ext === 'json') lang = 'json';
    else if (ext === 'md') lang = 'markdown';
    else if (ext === 'php') lang = 'php';
    else if (ext === 'py') lang = 'python';

    const model = monaco.editor.createModel(content, lang, monaco.Uri.file(path));
    state.files.set(path, {
        name: path.split('/').pop(),
        path: path,
        content: content,
        model: model,
        isDirty: false,
        handle: null
    });
}

// ==================== File Operations & Explorer ====================
function openFileInEditor(path) {
    const file = state.files.get(path);
    if (!file) return;

    state.activeFilePath = path;
    if (!state.openTabs.includes(path)) {
        state.openTabs.push(path);
    }

    if (state.editor) {
        state.editor.setModel(file.model);
    }

    // Hide welcome overlay
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) overlay.style.display = 'none';

    // Update Status Bar & Breadcrumbs
    updateStatusBarLanguage(file.model.getLanguageId());
    updateBreadcrumbs(path);
    updateTabsBar();
    updateFileTreeUI();

    if (state.isLivePreviewOpen) {
        debounceLivePreview();
    }
}

function closeTab(path, event) {
    if (event) event.stopPropagation();
    const idx = state.openTabs.indexOf(path);
    if (idx > -1) {
        state.openTabs.splice(idx, 1);
        if (state.activeFilePath === path) {
            if (state.openTabs.length > 0) {
                openFileInEditor(state.openTabs[Math.max(0, idx - 1)]);
            } else {
                state.activeFilePath = null;
                const overlay = document.getElementById('welcomeOverlay');
                if (overlay) overlay.style.display = 'flex';
                updateBreadcrumbs('');
            }
        }
        updateTabsBar();
    }
}

function closeActiveTab() {
    if (state.activeFilePath) {
        closeTab(state.activeFilePath);
    }
}

function closeAllTabs() {
    state.openTabs = [];
    state.activeFilePath = null;
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) overlay.style.display = 'flex';
    updateBreadcrumbs('');
    updateTabsBar();
}

function createNewUntitled() {
    let num = 1;
    while (state.files.has(`untitled-${num}.js`)) num++;
    const path = `untitled-${num}.js`;
    addVirtualFile(path, '// Novo arquivo\n');
    openFileInEditor(path);
    updateFileTreeUI();
}

function createNewFilePrompt() {
    const name = prompt('Digite o nome do novo arquivo (ex: script.js, index.php, style.css):', 'novo_arquivo.js');
    if (name && name.trim()) {
        const clean = name.trim();
        if (state.files.has(clean)) {
            alert('Arquivo com este nome já existe.');
            return;
        }
        addVirtualFile(clean, '');
        openFileInEditor(clean);
        updateFileTreeUI();
    }
}

function createNewFolderPrompt() {
    const name = prompt('Digite o nome da pasta:', 'components');
    if (name && name.trim()) {
        const clean = name.trim();
        addVirtualFile(`${clean}/index.js`, '// Arquivo do módulo\n');
        openFileInEditor(`${clean}/index.js`);
        updateFileTreeUI();
    }
}

function deleteFile(path) {
    if (confirm(`Deseja realmente excluir "${path}"?`)) {
        closeTab(path);
        state.files.delete(path);
        updateFileTreeUI();
    }
}

async function saveActiveFile() {
    if (!state.activeFilePath) return;
    const file = state.files.get(state.activeFilePath);
    if (!file) return;

    if (state.settings.formatOnSave) {
        editorFormatDocument();
    }

    file.content = state.editor.getValue();
    file.isDirty = false;

    // If connected via File System Access API
    if (file.handle && file.handle.createWritable) {
        try {
            const writable = await file.handle.createWritable();
            await writable.write(file.content);
            await writable.close();
            logTerminal(`💾 Arquivo "${file.name}" salvo diretamente no disco!`, 'res');
        } catch (err) {
            console.error(err);
            logTerminal(`Erro ao salvar no disco: ${err.message}`, 'err');
        }
    } else {
        logTerminal(`💾 Arquivo "${file.name}" salvo!`, 'res');
    }

    updateTabsBar();
    updateFileTreeUI();
    updateGitModifiedList();
    if (state.isLivePreviewOpen) debounceLivePreview();
}

function saveFileAs() {
    if (!state.activeFilePath) return;
    const file = state.files.get(state.activeFilePath);
    if (!file) return;

    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    logTerminal(`📥 Download do arquivo "${file.name}" iniciado.`, 'res');
}

// ==================== Native File System Access API ====================
async function openFolderPicker() {
    if (!window.showDirectoryPicker) {
        alert('Seu navegador não suporta o File System Access API nativo. Use o Google Chrome, Edge ou Opera para acessar pastas do computador.');
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker();
        state.directoryHandle = dirHandle;
        state.files.clear();
        state.openTabs = [];

        document.getElementById('folderTitleHeader').textContent = dirHandle.name.toUpperCase();
        document.getElementById('workspaceName').textContent = dirHandle.name.toUpperCase();

        await readDirectoryRecursive(dirHandle, '');
        updateFileTreeUI();

        // Open first file found
        const first = state.files.keys().next().value;
        if (first) {
            openFileInEditor(first);
        }
        logTerminal(`📂 Pasta "${dirHandle.name}" carregada com sucesso!`, 'res');
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error(err);
            alert('Erro ao abrir pasta: ' + err.message);
        }
    }
}

async function readDirectoryRecursive(dirHandle, pathPrefix) {
    for await (const entry of dirHandle.values()) {
        const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            const text = await file.text();
            
            const ext = entry.name.split('.').pop().toLowerCase();
            let lang = 'plaintext';
            if (ext === 'html' || ext === 'htm') lang = 'html';
            else if (ext === 'css') lang = 'css';
            else if (ext === 'js' || ext === 'mjs') lang = 'javascript';
            else if (ext === 'ts') lang = 'typescript';
            else if (ext === 'json') lang = 'json';
            else if (ext === 'md') lang = 'markdown';
            else if (ext === 'php') lang = 'php';
            else if (ext === 'py') lang = 'python';
            else if (ext === 'sql') lang = 'sql';

            const model = monaco.editor.createModel(text, lang, monaco.Uri.file(fullPath));
            state.files.set(fullPath, {
                name: entry.name,
                path: fullPath,
                content: text,
                model: model,
                isDirty: false,
                handle: entry
            });
        } else if (entry.kind === 'directory' && !['node_modules', '.git', 'dist'].includes(entry.name)) {
            await readDirectoryRecursive(entry, fullPath);
        }
    }
}

async function openFilePicker() {
    if (window.showOpenFilePicker) {
        try {
            const [fileHandle] = await window.showOpenFilePicker();
            const file = await fileHandle.getFile();
            const text = await file.text();
            addVirtualFile(file.name, text);
            state.files.get(file.name).handle = fileHandle;
            openFileInEditor(file.name);
            updateFileTreeUI();
        } catch { }
    } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const text = await file.text();
                addVirtualFile(file.name, text);
                openFileInEditor(file.name);
                updateFileTreeUI();
            }
        };
        input.click();
    }
}

async function exportProjectZip() {
    try {
        const zip = new JSZip();
        state.files.forEach((file, path) => {
            zip.file(path, file.content);
        });

        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'meu_projeto_vscode.zip';
        a.click();
        logTerminal('📦 Projeto compactado e baixado como .ZIP!', 'res');
    } catch (err) {
        alert('Erro ao exportar ZIP: ' + err.message);
    }
}

// ==================== UI Renderers ====================
function updateTabsBar() {
    const container = document.getElementById('editorTabsList');
    if (!container) return;
    container.innerHTML = '';

    state.openTabs.forEach(path => {
        const file = state.files.get(path);
        if (!file) return;

        const tab = document.createElement('div');
        tab.className = `tab-item ${state.activeFilePath === path ? 'active' : ''} ${file.isDirty ? 'dirty' : ''}`;
        
        const iconInfo = getFileIconInfo(file.name);
        tab.innerHTML = `
            <i class="${iconInfo.icon}" style="color:${iconInfo.color}; font-size:12px;"></i>
            <span>${file.name}</span>
            <div class="tab-close" onclick="closeTab('${path}', event)"></div>
        `;
        tab.onclick = () => openFileInEditor(path);
        container.appendChild(tab);
    });
}

function updateFileTreeUI() {
    const container = document.getElementById('fileTreeContainer');
    if (!container) return;
    container.innerHTML = '';

    const paths = Array.from(state.files.keys()).sort();
    paths.forEach(path => {
        const file = state.files.get(path);
        const iconInfo = getFileIconInfo(file.name);

        const node = document.createElement('div');
        node.className = `tree-node ${state.activeFilePath === path ? 'active' : ''} ${file.isDirty ? 'dirty' : ''}`;
        node.innerHTML = `
            <i class="${iconInfo.icon} node-icon" style="color:${iconInfo.color};"></i>
            <span class="node-label">${file.name}</span>
        `;
        node.onclick = () => openFileInEditor(path);
        node.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm(`Deseja excluir "${file.name}"?`)) deleteFile(path);
        };
        container.appendChild(node);
    });
}

function updateGitModifiedList() {
    const list = document.getElementById('gitModifiedList');
    if (!list) return;
    list.innerHTML = '';

    const modified = Array.from(state.files.values()).filter(f => f.isDirty);
    if (modified.length === 0) {
        list.innerHTML = '<div class="empty-hint">Nenhum arquivo modificado.</div>';
        return;
    }

    modified.forEach(f => {
        const row = document.createElement('div');
        row.className = 'tree-node dirty';
        row.innerHTML = `<i class="fa-regular fa-file"></i> <span class="node-label">${f.name}</span> <span style="margin-left:auto; color:#f59e0b; font-size:10px; font-weight:700;">M</span>`;
        row.onclick = () => openFileInEditor(f.path);
        list.appendChild(row);
    });
}

function updateBreadcrumbs(path) {
    const el = document.getElementById('breadcrumbPath');
    if (el) {
        el.textContent = path ? `workspace > ${path.replace(/\//g, ' > ')}` : 'workspace';
    }
}

function updateStatusBarLanguage(langId) {
    const el = document.getElementById('statusLangMode');
    if (el) {
        el.querySelector('span').textContent = (langId || 'plaintext').toUpperCase();
    }
}

function getFileIconInfo(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'html': case 'htm': return { icon: 'fa-brands fa-html5', color: '#e44d26' };
        case 'css': return { icon: 'fa-brands fa-css3-alt', color: '#264de4' };
        case 'js': case 'mjs': return { icon: 'fa-brands fa-js', color: '#f7df1e' };
        case 'ts': return { icon: 'fa-solid fa-code', color: '#3178c6' };
        case 'json': return { icon: 'fa-solid fa-brackets-curly', color: '#cbcb41' };
        case 'php': return { icon: 'fa-brands fa-php', color: '#777bb4' };
        case 'py': return { icon: 'fa-brands fa-python', color: '#3776ab' };
        case 'md': return { icon: 'fa-brands fa-markdown', color: '#38bdf8' };
        case 'sql': return { icon: 'fa-solid fa-database', color: '#e38c00' };
        case 'png': case 'jpg': case 'jpeg': case 'svg': return { icon: 'fa-regular fa-image', color: '#22c55e' };
        default: return { icon: 'fa-regular fa-file-lines', color: '#94a3b8' };
    }
}

// ==================== Live Preview Engine ====================
let livePreviewTimer = null;
function debounceLivePreview() {
    clearTimeout(livePreviewTimer);
    livePreviewTimer = setTimeout(() => {
        refreshLivePreview();
    }, 400);
}

function toggleLivePreview() {
    state.isLivePreviewOpen = !state.isLivePreviewOpen;
    const panel = document.getElementById('livePreviewPanel');
    const resizer = document.getElementById('splitResizer');

    if (panel) panel.style.display = state.isLivePreviewOpen ? 'flex' : 'none';
    if (resizer) resizer.style.display = state.isLivePreviewOpen ? 'block' : 'none';

    if (state.isLivePreviewOpen) {
        refreshLivePreview();
    }
}

function refreshLivePreview() {
    const iframe = document.getElementById('livePreviewIframe');
    if (!iframe) return;

    const htmlFile = state.files.get('index.html') || state.files.get(state.activeFilePath);
    let htmlContent = htmlFile ? htmlFile.content : '<h1>Nenhum arquivo HTML encontrado</h1>';

    // Inline linked CSS
    state.files.forEach((file, path) => {
        if (path.endsWith('.css')) {
            const fileName = path.split('/').pop();
            const tag = new RegExp(`<link[^>]*href=["'](?:\\.\\/)?${fileName}["'][^>]*>`, 'gi');
            htmlContent = htmlContent.replace(tag, `<style>\n${file.content}\n</style>`);
        }
    });

    // Inline linked JS
    state.files.forEach((file, path) => {
        if (path.endsWith('.js')) {
            const fileName = path.split('/').pop();
            const tag = new RegExp(`<script[^>]*src=["'](?:\\.\\/)?${fileName}["'][^>]*>\\s*<\\/script>`, 'gi');
            htmlContent = htmlContent.replace(tag, `<script>\n${file.content}\n<\/script>`);
        }
    });

    // Inject Console Interceptor to pipe logs to VS Code Output
    const consoleInterceptor = `
    <script>
    (function() {
        const origLog = console.log;
        const origErr = console.error;
        console.log = function(...args) {
            origLog.apply(console, args);
            window.parent.postMessage({ type: 'VSCODE_CONSOLE_LOG', level: 'log', args: args }, '*');
        };
        console.error = function(...args) {
            origErr.apply(console, args);
            window.parent.postMessage({ type: 'VSCODE_CONSOLE_LOG', level: 'err', args: args }, '*');
        };
    })();
    <\/script>
    `;

    htmlContent = consoleInterceptor + htmlContent;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    iframe.src = URL.createObjectURL(blob);
}

function setPreviewDevice(device) {
    state.previewDevice = device;
    const iframe = document.getElementById('livePreviewIframe');
    const btns = document.querySelectorAll('.btn-device');
    btns.forEach(b => b.classList.remove('active'));

    if (device === 'desktop') {
        if (iframe) iframe.style.width = '100%';
        btns[0]?.classList.add('active');
    } else if (device === 'tablet') {
        if (iframe) iframe.style.width = '768px';
        btns[1]?.classList.add('active');
    } else if (device === 'mobile') {
        if (iframe) iframe.style.width = '375px';
        btns[2]?.classList.add('active');
    }
}

function openPreviewInNewTab() {
    const iframe = document.getElementById('livePreviewIframe');
    if (iframe && iframe.src) {
        window.open(iframe.src, '_blank');
    }
}

// Receive console messages from iframe preview
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'VSCODE_CONSOLE_LOG') {
        const msg = e.data.args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
        logTerminal(`[Live Preview] ${msg}`, e.data.level === 'err' ? 'err' : 'res');
    }
});

// ==================== Interactive Terminal & JS REPL ====================
function initTerminalREPL() {
    const input = document.getElementById('terminalCommandLine');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            if (cmd) {
                state.commandHistory.push(cmd);
                state.historyIndex = state.commandHistory.length;
                input.value = '';
                executeTerminalCommand(cmd);
            }
        } else if (e.key === 'ArrowUp') {
            if (state.historyIndex > 0) {
                state.historyIndex--;
                input.value = state.commandHistory[state.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            if (state.historyIndex < state.commandHistory.length - 1) {
                state.historyIndex++;
                input.value = state.commandHistory[state.historyIndex];
            } else {
                state.historyIndex = state.commandHistory.length;
                input.value = '';
            }
        }
    });
}

function executeTerminalCommand(cmd) {
    logTerminal(`> ${cmd}`, 'cmd');
    const lower = cmd.toLowerCase().trim();

    if (lower === 'help') {
        logTerminal(`Comandos disponíveis:
  help               - Exibe esta lista de ajuda
  clear              - Limpa a tela do terminal
  ls                 - Lista os arquivos do projeto
  cat <arquivo>      - Exibe o conteúdo de um arquivo
  run / node <arq>   - Executa o código JS do arquivo
  theme <tema>       - Altera o tema (vs-dark, dracula, monokai, one-dark, cyberpunk)
  export             - Baixa o projeto completo em .ZIP
  date               - Mostra data e hora atual
  <código JS>        - Executa qualquer expressão JavaScript (ex: 2 + 2)`, 'res');
        return;
    }

    if (lower === 'clear') {
        clearTerminalOutput();
        return;
    }

    if (lower === 'ls') {
        const list = Array.from(state.files.keys()).join('    ');
        logTerminal(list || 'Nenhum arquivo.', 'res');
        return;
    }

    if (lower.startsWith('cat ')) {
        const file = cmd.substring(4).trim();
        const f = state.files.get(file);
        if (f) logTerminal(f.content, 'res');
        else logTerminal(`Arquivo "${file}" não encontrado.`, 'err');
        return;
    }

    if (lower === 'run' || lower.startsWith('node ')) {
        runActiveCode();
        return;
    }

    if (lower.startsWith('theme ')) {
        const theme = cmd.substring(6).trim();
        setMonacoTheme(theme);
        logTerminal(`Tema alterado para: ${theme}`, 'res');
        return;
    }

    if (lower === 'export') {
        exportProjectZip();
        return;
    }

    if (lower === 'date') {
        logTerminal(new Date().toString(), 'res');
        return;
    }

    // Default: Evaluate JS expression in sandbox
    try {
        const result = eval(cmd);
        logTerminal(result !== undefined ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : result) : 'undefined', 'res');
    } catch (err) {
        logTerminal(`Error: ${err.message}`, 'err');
    }
}

function logTerminal(text, type = 'res') {
    const logs = document.getElementById('terminalLogs');
    const screen = document.getElementById('terminalScreen');
    if (!logs) return;

    const row = document.createElement('div');
    row.className = `term-log-row ${type}`;
    row.textContent = text;
    logs.appendChild(row);

    if (screen) screen.scrollTop = screen.scrollHeight;
}

function clearTerminalOutput() {
    const logs = document.getElementById('terminalLogs');
    if (logs) logs.innerHTML = '';
}

function runActiveCode() {
    openTerminalPanel();
    switchBottomTab('terminal');

    if (!state.activeFilePath) {
        logTerminal('Nenhum arquivo ativo para executar.', 'err');
        return;
    }

    const file = state.files.get(state.activeFilePath);
    if (!file) return;

    if (file.name.endsWith('.js')) {
        logTerminal(`▶ Executando "${file.name}"...`, 'cmd');
        try {
            const fn = new Function(file.content);
            fn();
            logTerminal(`✔ "${file.name}" executado com sucesso!`, 'res');
        } catch (err) {
            logTerminal(`❌ Erro de execução em ${file.name}: ${err.message}`, 'err');
        }
    } else if (file.name.endsWith('.html')) {
        if (!state.isLivePreviewOpen) toggleLivePreview();
        refreshLivePreview();
        logTerminal(`▶ Visualização ao vivo atualizada para "${file.name}"`, 'res');
    } else {
        logTerminal(`ℹ Arquivo "${file.name}" salvo. (Linguagem: ${file.model.getLanguageId()})`, 'res');
    }
}

// ==================== Editor Shortcuts & Commands ====================
function editorUndo() { state.editor?.trigger('keyboard', 'undo', null); }
function editorRedo() { state.editor?.trigger('keyboard', 'redo', null); }
function selectAllText() { state.editor?.trigger('keyboard', 'selectAll', null); }
function editorFormatDocument() { state.editor?.getAction('editor.action.formatDocument')?.run(); }
function openMonacoFind() { state.editor?.getAction('actions.find')?.run(); }
function openMonacoReplace() { state.editor?.getAction('editor.action.startFindReplaceAction')?.run(); }
function copyLineDown() { state.editor?.getAction('editor.action.copyLinesDownAction')?.run(); }
function moveLineDown() { state.editor?.getAction('editor.action.moveLinesDownAction')?.run(); }
function addCursorBelow() { state.editor?.getAction('editor.action.insertCursorBelow')?.run(); }
function toggleMinimap() {
    state.settings.minimap = !state.settings.minimap;
    state.editor?.updateOptions({ minimap: { enabled: state.settings.minimap } });
}
function toggleWordWrap() {
    state.settings.wordWrap = state.settings.wordWrap === 'on' ? 'off' : 'on';
    state.editor?.updateOptions({ wordWrap: state.settings.wordWrap });
}

// ==================== Themes & Settings ====================
function initThemePicker() {
    const themes = [
        { id: 'vs-dark', name: 'VS Code Dark Modern', icon: 'fa-moon', color: '#1e1e1e' },
        { id: 'dracula', name: 'Dracula Official', icon: 'fa-ghost', color: '#282a36' },
        { id: 'monokai', name: 'Monokai Pro', icon: 'fa-palette', color: '#272822' },
        { id: 'one-dark', name: 'One Dark Pro', icon: 'fa-circle-half-stroke', color: '#21252b' },
        { id: 'cyberpunk', name: 'Cyberpunk Neon', icon: 'fa-bolt', color: '#0d0d1a' },
        { id: 'vs', name: 'Light (Claro)', icon: 'fa-sun', color: '#ffffff' },
        { id: 'hc-black', name: 'High Contrast', icon: 'fa-circle-dot', color: '#000000' }
    ];

    const grid = document.getElementById('themePickerGrid');
    if (!grid) return;
    grid.innerHTML = '';

    themes.forEach(t => {
        const card = document.createElement('div');
        card.className = `theme-btn-card ${state.currentTheme === t.id ? 'active' : ''}`;
        card.innerHTML = `<i class="fa-solid ${t.icon}" style="color:#a855f7;"></i> <span>${t.name}</span>`;
        card.onclick = () => setMonacoTheme(t.id);
        grid.appendChild(card);
    });
}

function setMonacoTheme(themeId) {
    state.currentTheme = themeId;
    monaco.editor.setTheme(themeId);
    initThemePicker();
}

function initSettingsPanel() {
    const body = document.getElementById('settingsBody');
    if (!body) return;

    body.innerHTML = `
        <div class="setting-item">
            <label>Tamanho da Fonte (px)</label>
            <span>Altera o tamanho do texto no editor.</span>
            <input type="number" id="cfgFontSize" value="${state.settings.fontSize}" min="10" max="32" onchange="updateEditorSetting('fontSize', parseInt(this.value))">
        </div>

        <div class="setting-item">
            <label>Tamanho da Tabulação (Tab Size)</label>
            <span>Quantidade de espaços por tabulação.</span>
            <select id="cfgTabSize" onchange="updateEditorSetting('tabSize', parseInt(this.value))">
                <option value="2" ${state.settings.tabSize === 2 ? 'selected' : ''}>2 Espaços</option>
                <option value="4" ${state.settings.tabSize === 4 ? 'selected' : ''}>4 Espaços</option>
                <option value="8" ${state.settings.tabSize === 8 ? 'selected' : ''}>8 Espaços</option>
            </select>
        </div>

        <div class="setting-checkbox-row">
            <input type="checkbox" id="cfgMinimap" ${state.settings.minimap ? 'checked' : ''} onchange="updateEditorSetting('minimap', this.checked)">
            <div>
                <label style="color:#fff; font-size:12px; font-weight:600;">Exibir Minimapa</label>
                <div style="color:#8c8c8c; font-size:11px;">Mostra a visão geral do código à direita.</div>
            </div>
        </div>

        <div class="setting-checkbox-row">
            <input type="checkbox" id="cfgFormatOnSave" ${state.settings.formatOnSave ? 'checked' : ''} onchange="updateEditorSetting('formatOnSave', this.checked)">
            <div>
                <label style="color:#fff; font-size:12px; font-weight:600;">Formatar ao Salvar (Format on Save)</label>
                <div style="color:#8c8c8c; font-size:11px;">Organiza a indentação automaticamente com Ctrl+S.</div>
            </div>
        </div>
    `;
}

function updateEditorSetting(key, val) {
    state.settings[key] = val;
    if (state.editor) {
        if (key === 'fontSize') state.editor.updateOptions({ fontSize: val });
        if (key === 'tabSize') state.editor.updateOptions({ tabSize: val });
        if (key === 'minimap') state.editor.updateOptions({ minimap: { enabled: val } });
    }
}

// ==================== Panels & Navigation ====================
function switchPanel(name) {
    state.activePanel = name;
    document.querySelectorAll('.activity-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.activity-item[data-panel="${name}"]`)?.classList.add('active');

    document.querySelectorAll('.sidebar-panel-view').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`panel${capitalize(name)}`);
    if (target) target.classList.add('active');
}

function switchBottomTab(name) {
    state.activeBottomTab = name;
    document.querySelectorAll('.panel-tab-item').forEach(t => t.classList.remove('active'));
    document.querySelector(`.panel-tab-item[data-tab="${name}"]`)?.classList.add('active');

    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(`tabContent${capitalize(name)}`)?.classList.add('active');
}

function toggleTerminalPanel() {
    const p = document.getElementById('bottomPanel');
    if (p) p.style.display = p.style.display === 'none' ? 'flex' : 'none';
}

function openTerminalPanel() {
    const p = document.getElementById('bottomPanel');
    if (p) p.style.display = 'flex';
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ==================== Command Palette & Shortcuts Modal ====================
function openCommandPalette() {
    const modal = document.getElementById('commandPaletteModal');
    const input = document.getElementById('paletteInput');
    if (modal && input) {
        modal.classList.add('visible');
        input.value = '>';
        input.focus();
        renderPaletteCommands('');
    }
}

function closeCommandPalette(e) {
    const modal = document.getElementById('commandPaletteModal');
    if (modal) modal.classList.remove('visible');
}

function showShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.classList.add('visible');
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.classList.remove('visible');
}

function showWelcomeScreen() {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function showAboutModal() {
    alert(`Visual Studio Code Pro 2026
Versão Web IDE 2026.1 (Microsoft Monaco Engine)
Desenvolvido para 4U.IA.BR`);
}

function renderPaletteCommands(filter) {
    const list = document.getElementById('paletteResultsList');
    if (!list) return;
    list.innerHTML = '';

    const commands = [
        { label: 'File: New File', action: createNewUntitled },
        { label: 'File: Save Active File (Ctrl+S)', action: saveActiveFile },
        { label: 'File: Open Local Folder...', action: openFolderPicker },
        { label: 'File: Download Project (.ZIP)', action: exportProjectZip },
        { label: 'Format: Format Document (Shift+Alt+F)', action: editorFormatDocument },
        { label: 'Run: Execute / Live Preview (F5)', action: runActiveCode },
        { label: 'View: Toggle Live Preview (Alt+L)', action: toggleLivePreview },
        { label: 'View: Toggle Terminal (Ctrl+`)', action: toggleTerminalPanel },
        { label: 'Theme: Switch to Dracula', action: () => setMonacoTheme('dracula') },
        { label: 'Theme: Switch to Cyberpunk', action: () => setMonacoTheme('cyberpunk') },
        { label: 'Theme: Switch to Monokai', action: () => setMonacoTheme('monokai') },
        { label: 'Help: Keyboard Shortcuts', action: showShortcutsModal }
    ];

    const filtered = commands.filter(c => c.label.toLowerCase().includes(filter.toLowerCase().replace('>', '').trim()));
    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = 'palette-item';
        item.textContent = c.label;
        item.onclick = () => {
            closeCommandPalette();
            c.action();
        };
        list.appendChild(item);
    });
}

function initUIEvents() {
    // Top menus dropdown closer
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-item')) {
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('visible'));
        }
    });

    // Keyboard global shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.shiftKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                openCommandPalette();
            } else if (e.key.toLowerCase() === 'p') {
                e.preventDefault();
                openCommandPalette();
            } else if (e.key === '`') {
                e.preventDefault();
                toggleTerminalPanel();
            }
        }
    });

    // Palette input filter
    const palInput = document.getElementById('paletteInput');
    if (palInput) {
        palInput.addEventListener('input', (e) => renderPaletteCommands(e.target.value));
        palInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeCommandPalette();
            if (e.key === 'Enter') {
                const first = document.querySelector('.palette-item');
                if (first) first.click();
            }
        });
    }
}

function toggleDropdown(id, event) {
    event.stopPropagation();
    const menu = document.getElementById(id);
    const isVis = menu?.classList.contains('visible');
    document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('visible'));
    if (!isVis && menu) menu.classList.add('visible');
}

// Global exposes for inline HTML handlers
window.createNewUntitled = createNewUntitled;
window.createNewFilePrompt = createNewFilePrompt;
window.createNewFolderPrompt = createNewFolderPrompt;
window.openFolderPicker = openFolderPicker;
window.openFilePicker = openFilePicker;
window.exportProjectZip = exportProjectZip;
window.saveActiveFile = saveActiveFile;
window.saveFileAs = saveFileAs;
window.closeActiveTab = closeActiveTab;
window.closeAllTabs = closeAllTabs;
window.closeTab = closeTab;
window.editorUndo = editorUndo;
window.editorRedo = editorRedo;
window.editorFormatDocument = editorFormatDocument;
window.openMonacoFind = openMonacoFind;
window.openMonacoReplace = openMonacoReplace;
window.selectAllText = selectAllText;
window.copyLineDown = copyLineDown;
window.moveLineDown = moveLineDown;
window.addCursorBelow = addCursorBelow;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.showShortcutsModal = showShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
window.showWelcomeScreen = showWelcomeScreen;
window.showAboutModal = showAboutModal;
window.switchPanel = switchPanel;
window.switchBottomTab = switchBottomTab;
window.toggleLivePreview = toggleLivePreview;
window.refreshLivePreview = refreshLivePreview;
window.setPreviewDevice = setPreviewDevice;
window.openPreviewInNewTab = openPreviewInNewTab;
window.toggleTerminalPanel = toggleTerminalPanel;
window.clearTerminalOutput = clearTerminalOutput;
window.runActiveCode = runActiveCode;
window.toggleMinimap = toggleMinimap;
window.toggleWordWrap = toggleWordWrap;
window.loadSampleProject = loadSampleProject;
window.toggleDropdown = toggleDropdown;
window.updateEditorSetting = updateEditorSetting;

