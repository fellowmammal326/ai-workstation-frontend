/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- IMPORTANT DEPLOYMENT STEP ---
// This is now a relative path to work with the Vercel serverless backend.
const API_BASE_URL = '';

// --- API Client ---
// A centralized place for all communication with the backend server.
const apiClient = {
    // Helper to handle fetch requests and errors
    async request(endpoint: string, options: RequestInit = {}) {
        const headers = new Headers(options.headers || {});
        headers.set('Content-Type', 'application/json');
        
        // Add the current user's username to the headers for authenticated requests
        // NOTE: This is an insecure method for demonstration. A real app would use JWTs.
        if (currentUser) {
            headers.set('X-Username', currentUser.username);
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || 'An unknown API error occurred');
        }
        return response;
    },

    // Auth
    signup: (username: string, password: string) => apiClient.request('/api/signup', { method: 'POST', body: JSON.stringify({ username, password }) }),
    login: (username: string, password: string) => apiClient.request('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    
    // Files
    getFiles: () => apiClient.request('/api/files'),
    saveFile: (type: string, name: string, content: string) => apiClient.request('/api/files', { method: 'POST', body: JSON.stringify({ type, name, content }) }),
    deleteFile: (type: string, name: string) => apiClient.request(`/api/files/${type}/${name}`, { method: 'DELETE' }),
    
    // Sessions
    getSessions: () => apiClient.request('/api/sessions'),
    saveSession: (state: any) => apiClient.request('/api/sessions', { method: 'POST', body: JSON.stringify(state) }),
    loadSession: (sessionId: string) => apiClient.request(`/api/sessions/${sessionId}`),
    deleteSession: (sessionId: string) => apiClient.request(`/api/sessions/${sessionId}`, { method: 'DELETE' }),

    // Storage
    getStorageUsage: () => apiClient.request('/api/storage'),

    // AI Methods
    chat: (prompt: string) => apiClient.request('/api/ai/chat', { method: 'POST', body: JSON.stringify({ prompt }) }),
    generateImage: (prompt: string) => apiClient.request('/api/ai/generate-image', { method: 'POST', body: JSON.stringify({ prompt }) }),
    googleSearch: (query: string) => apiClient.request('/api/ai/google-search', { method: 'POST', body: JSON.stringify({ query }) }),
};

// --- DOM Elements ---
// ... (omitted for brevity, no changes from previous version)
const appContainer = document.getElementById('app-container')!;
const chatHistory = document.getElementById('chat-history')!;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const welcomeMessage = document.getElementById('welcome-message')!;
const desktop = document.getElementById('desktop')!;
const cursor = document.getElementById('cursor')!;
cursor.style.left = '100px';
cursor.style.top = '100px';
const iconDocs = document.getElementById('icon-docs')!;
const iconBrowser = document.getElementById('icon-browser')!;
const iconDoodle = document.getElementById('icon-doodle')!;
const iconStudio = document.getElementById('icon-studio')!;
const iconExplorer = document.getElementById('icon-explorer')!;
const saveButton = document.getElementById('save-button') as HTMLButtonElement;
const loadButton = document.getElementById('load-button') as HTMLButtonElement;
const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
const loadSessionModal = document.getElementById('load-session-modal')!;
const closeModalBtn = document.getElementById('close-modal-btn')!;
const savedSessionsList = document.getElementById('saved-sessions-list')!;
const authModal = document.getElementById('auth-modal')!;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const signupForm = document.getElementById('signup-form') as HTMLFormElement;
const loginUsernameInput = document.getElementById('login-username') as HTMLInputElement;
const loginPasswordInput = document.getElementById('login-password') as HTMLInputElement;
const signupUsernameInput = document.getElementById('signup-username') as HTMLInputElement;
const signupPasswordInput = document.getElementById('signup-password') as HTMLInputElement;
const loginError = document.getElementById('login-error')!;
const signupError = document.getElementById('signup-error')!;
const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');
const storageBarInner = document.getElementById('storage-bar-inner')!;
const storageText = document.getElementById('storage-text')!;
const testingModeIndicator = document.getElementById('testing-mode-indicator')!;

// Debug Tool Elements
const debugButton = document.getElementById('debug-button')!;
const debugConsole = document.getElementById('debug-console')!;
const closeDebugConsoleBtn = document.getElementById('close-debug-console-btn')!;


// --- State ---
let windowZIndex = 10;
let activeWindow: HTMLElement | null = null;
let openWindows: Map<string, HTMLElement> = new Map();
let openFiles = new Map<HTMLElement, { type: 'docs' | 'doodle' | 'studio', name: string }>();
const browserState = new Map<HTMLElement, { query: string, sources: any[], summary: string }>();
let clipboard: { type: string, data: string } | null = null;
let currentUser: { username: string } | null = null;
const MAX_STORAGE = 10 * 1024 * 1024; // This is now just a frontend display constant
let isTestingMode = false;


// --- Testing Mode ---

const enableTestingMode = () => {
    isTestingMode = true;
    document.body.classList.add('testing-mode');
    testingModeIndicator.classList.remove('hidden');
    chatInput.placeholder = "AI disabled in Testing Mode";
    chatInput.disabled = true;
    sendButton.disabled = true;
    showToast("Testing Mode Activated!");
};

const disableTestingMode = () => {
    isTestingMode = false;
    document.body.classList.remove('testing-mode');
    testingModeIndicator.classList.add('hidden');
    chatInput.placeholder = "Ask the AI to do something...";
    chatInput.disabled = false;
    sendButton.disabled = chatInput.value.trim() === '';
    showToast("Testing Mode Deactivated.");
};

const promptForTestingMode = () => {
    const password = prompt("Enter testing mode password:");
    if (password === "Dexter:3") {
        enableTestingMode();
    } else if (password !== null) {
        alert("Incorrect password.");
    }
};

// --- Storage Management ---

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${Math.round(kb)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
};

const updateStorageIndicator = async () => {
    if (!currentUser) {
        storageBarInner.style.width = `0%`;
        storageText.textContent = ``;
        return;
    }

    try {
        const response = await apiClient.getStorageUsage();
        const { used } = await response.json();
        const percentage = (used / MAX_STORAGE) * 100;

        storageBarInner.style.width = `${percentage}%`;
        storageText.textContent = `${formatBytes(used)} / ${formatBytes(MAX_STORAGE)}`;

        if (percentage > 90) {
            storageBarInner.style.backgroundColor = 'var(--error-color)';
        } else if (percentage > 75) {
            storageBarInner.style.backgroundColor = '#ffbd2e'; // Yellow
        } else {
            storageBarInner.style.backgroundColor = 'var(--accent-primary)';
        }
    } catch (error) {
        console.error("Error updating storage indicator:", error);
        storageText.textContent = "Error";
    }
};

// --- Authentication & App Initialization ---

const initializeAppState = () => {
    openWindows.forEach(win => win.remove());
    openWindows.clear();
    openFiles.clear();
    browserState.clear();
    activeWindow = null;
    windowZIndex = 10;
    chatHistory.innerHTML = '';
    addMessage('assistant', `Hello, ${currentUser?.username}! I'm your AI assistant. What can I help you with today?`);
    cursor.style.left = '100px';
    cursor.style.top = '100px';
    clipboard = null;
    disableTestingMode();
};

const loginUser = (username: string) => {
    currentUser = { username };
    sessionStorage.setItem('currentUser', username);
    
    authModal.style.display = 'none';
    appContainer.classList.remove('hidden');
    
    welcomeMessage.textContent = `Welcome, ${username}!`;
    initializeAppState();
    updateStorageIndicator();
};

const logoutUser = () => {
    sessionStorage.removeItem('currentUser');
    currentUser = null;

    appContainer.classList.add('hidden');
    authModal.style.display = 'flex';

    loginForm.reset();
    signupForm.reset();
    switchAuthTab('login');
    updateStorageIndicator();
    disableTestingMode();
};

const switchAuthTab = (tab: 'login' | 'signup') => {
    authTabs.forEach(t => t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab));
    authForms.forEach(f => f.classList.toggle('active', f.id.startsWith(tab)));
    loginError.textContent = '';
    signupError.textContent = '';
};

const validatePassword = (password: string): boolean => {
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(password);
};

const checkSession = () => {
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        loginUser(savedUser);
    }
};

authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        switchAuthTab((tab as HTMLElement).dataset.tab as 'login' | 'signup');
    });
});

logoutButton.addEventListener('click', logoutUser);

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupError.textContent = '';
    const username = signupUsernameInput.value.trim();
    const password = signupPasswordInput.value.trim();

    if (!username || !password) {
        signupError.textContent = 'Please fill out all fields.';
        return;
    }
    if (!validatePassword(password)) {
        signupError.textContent = 'Password does not meet requirements.';
        return;
    }

    try {
        await apiClient.signup(username, password);
        loginUser(username);
    } catch (error) {
        signupError.textContent = (error as Error).message;
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
        loginError.textContent = 'Please fill out all fields.';
        return;
    }

    try {
        await apiClient.login(username, password);
        loginUser(username);
    } catch (error) {
        loginError.textContent = (error as Error).message;
    }
});

const getDesktopState = (): string => {
    const desktopRect = desktop.getBoundingClientRect();
    const desktopState = `Desktop Dimensions: ${Math.round(desktopRect.width)}px wide, ${Math.round(desktopRect.height)}px tall.`;

    if (openWindows.size === 0) {
        return `${desktopState}\nThe desktop is empty. No windows are open.`;
    }

    const windowStates = Array.from(openWindows.values()).map(win => {
        const winRect = win.getBoundingClientRect();
        const title = win.querySelector('.window-title')?.textContent || 'Untitled';
        const isMaximized = win.classList.contains('maximized');
        const pos = `Position: { left: ${Math.round(winRect.left - desktopRect.left)}px, top: ${Math.round(winRect.top - desktopRect.top)}px }`;
        const size = `Size: { width: ${Math.round(winRect.width)}px, height: ${Math.round(winRect.height)}px }`;
        return `- Window ID: #${win.id}, Title: "${title}", Maximized: ${isMaximized}, ${pos}, ${size}`;
    });

    return `${desktopState}\nOpen Windows:\n${windowStates.join('\n')}`;
};

// --- High-level actions, AI prompt, execution logic ---
const addMessage = (sender: 'user' | 'assistant', text: string, thinking = false) => {
  const messageEl = document.createElement('div');
  messageEl.classList.add('chat-message', sender);
  if (thinking) {
    messageEl.classList.add('thinking');
    messageEl.innerHTML = `<div class="spinner"></div><span>${text}</span>`;
  } else {
    messageEl.textContent = text;
  }
  chatHistory.appendChild(messageEl);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return messageEl;
};
const handleUserInput = async () => {
  const prompt = chatInput.value.trim();
  if (!prompt || isTestingMode) return;
  addMessage('user', prompt);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  const thinkingMessage = addMessage('assistant', 'Thinking...', true);
  sendButton.disabled = true;
  try {
    const desktopState = getDesktopState();
    const fullPrompt = `DESKTOP STATE:\n${desktopState}\n\nUSER REQUEST:\n${prompt}`;
    const response = await apiClient.chat(fullPrompt);
    const { decision: decisionText } = await response.json();
    const decision = JSON.parse(decisionText);
    thinkingMessage.remove();
    if (decision.sequence) {
      await executeActionSequence(decision.sequence);
    } else {
      addMessage('assistant', "I'm not sure how to respond to that.");
    }
  } catch (error) {
    console.error("Error processing user input:", error);
    thinkingMessage.remove();
    addMessage('assistant', "Sorry, I encountered an error. Please try again.");
  } finally {
    sendButton.disabled = false;
  }
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const animateCursor = (startX: number, startY: number, endX: number, endY: number, duration: number) => {
    return new Promise(resolve => {
        const controlX = (startX + endX) / 2 + (endY - startY) * (Math.random() - 0.5) * 0.8;
        const controlY = (startY + endY) / 2 + (startX - endX) * (Math.random() - 0.5) * 0.8;
        let startTime: number | null = null;
        const animationFrame = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 5);
            const t = easeProgress;
            const x = Math.pow(1 - t, 2) * startX + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * endX;
            const y = Math.pow(1 - t, 2) * startY + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * endY;
            cursor.style.left = `${x}px`;
            cursor.style.top = `${y}px`;
            if (progress < 1) {
                requestAnimationFrame(animationFrame);
            } else {
                resolve(null);
            }
        };
        requestAnimationFrame(animationFrame);
    });
};
const animateLinear = (startX: number, startY: number, endX: number, endY: number, duration: number) => {
    return new Promise(resolve => {
        let startTime: number | null = null;
        const animationFrame = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const x = startX + (endX - startX) * progress;
            const y = startY + (endY - startY) * progress;
            cursor.style.left = `${x}px`;
            cursor.style.top = `${y}px`;
            if (progress < 1) {
                requestAnimationFrame(animationFrame);
            } else {
                resolve(null);
            }
        };
        requestAnimationFrame(animationFrame);
    });
};
const followCursorPath = async (path: [number, number][]) => {
    if (!path || path.length === 0) return;
    const startX = parseFloat(cursor.style.left || '0');
    const startY = parseFloat(cursor.style.top || '0');
    await animateCursor(startX, startY, path[0][0], path[0][1], 300);
    for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];
        const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const duration = Math.max(50, distance * 3.5);
        await animateLinear(from[0], from[1], to[0], to[1], duration);
    }
};
const openAppViaIcon = async (appId: string, iconSelector: string): Promise<HTMLElement | null> => {
    let windowEl: HTMLElement | undefined | null = null;
    if (['browser', 'doodle', 'studio', 'explorer'].includes(appId)) {
        windowEl = openWindows.get(appId);
        if (windowEl) {
            setActiveWindow(windowEl);
            return windowEl;
        }
    } 
    else if (appId === 'docs') {
        const existingNewDoc = Array.from(openWindows.values()).find(w => w.dataset.app === 'docs' && !openFiles.has(w));
        if (existingNewDoc) {
            setActiveWindow(existingNewDoc);
            return existingNewDoc;
        }
    }
    const iconEl = document.querySelector(iconSelector);
    if (iconEl) {
        const startX = parseFloat(cursor.style.left || '0');
        const startY = parseFloat(cursor.style.top || '0');
        const rect = iconEl.getBoundingClientRect();
        const desktopRect = desktop.getBoundingClientRect();
        const targetX = rect.left - desktopRect.left + rect.width / 2;
        const targetY = rect.top - desktopRect.top + rect.height / 2;
        await animateCursor(startX, startY, targetX, targetY, 600);
        const cursorRect = cursor.getBoundingClientRect();
        const targetElement = document.elementFromPoint(cursorRect.left + 12, cursorRect.top + 12);
        if (targetElement) {
            const iconToClick = (targetElement as HTMLElement).closest('.icon');
            if (iconToClick) {
                (iconToClick as HTMLElement).click();
                await sleep(300);
            }
        }
        if (['browser', 'doodle', 'studio', 'explorer'].includes(appId)) {
            return openWindows.get(appId) || null;
        } else if (appId === 'docs') {
            let newestDoc: HTMLElement | null = null;
            let maxZ = -1;
            openWindows.forEach(win => {
                if (win.dataset.app === 'docs' && !openFiles.has(win)) {
                    const z = parseInt(win.style.zIndex);
                    if (z > maxZ) {
                        maxZ = z;
                        newestDoc = win;
                    }
                }
            });
            return newestDoc;
        }
    }
    return null;
};
const dragWindow = async (selector: string, targetX: number, targetY: number) => {
    const windowEl = document.querySelector(selector) as HTMLElement;
    const headerEl = windowEl?.querySelector('.window-header') as HTMLElement;
    if (!windowEl || !headerEl) {
        addMessage('assistant', `I tried to move a window, but I couldn't find it.`);
        return;
    };
    if (windowEl.classList.contains('maximized')) {
        addMessage('assistant', `I can't move that window because it's maximized.`);
        return;
    }
    const startCursorX = parseFloat(cursor.style.left);
    const startCursorY = parseFloat(cursor.style.top);
    const headerRect = headerEl.getBoundingClientRect();
    const desktopRect = desktop.getBoundingClientRect();
    const headerCenterX = headerRect.left - desktopRect.left + headerRect.width / 2;
    const headerCenterY = headerRect.top - desktopRect.top + headerRect.height / 2;
    await animateCursor(startCursorX, startCursorY, headerCenterX, headerCenterY, 500);
    const windowRect = windowEl.getBoundingClientRect();
    const windowStartX = windowRect.left - desktopRect.left;
    const windowStartY = windowRect.top - desktopRect.top;
    const offsetX = headerCenterX - windowStartX;
    const offsetY = headerCenterY - windowStartY;
    let windowTargetX = targetX - offsetX;
    let windowTargetY = targetY - offsetY;
    windowTargetX = Math.max(0, Math.min(windowTargetX, desktopRect.width - windowRect.width));
    windowTargetY = Math.max(0, Math.min(windowTargetY, desktopRect.height - windowRect.height));
    const finalCursorX = windowTargetX + offsetX;
    const finalCursorY = windowTargetY + offsetY;
    const duration = 1000;
    let startTime: number | null = null;
    const animationFrame = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        const currentCursorX = headerCenterX + (finalCursorX - headerCenterX) * easeProgress;
        const currentCursorY = headerCenterY + (finalCursorY - headerCenterY) * easeProgress;
        cursor.style.left = `${currentCursorX}px`;
        cursor.style.top = `${currentCursorY}px`;
        const currentWindowX = windowStartX + (windowTargetX - windowStartX) * easeProgress;
        const currentWindowY = windowStartY + (windowTargetY - windowStartY) * easeProgress;
        windowEl.style.left = `${currentWindowX}px`;
        windowEl.style.top = `${currentWindowY}px`;
        if (progress < 1) {
            requestAnimationFrame(animationFrame);
        }
    };
    return new Promise<void>(resolve => {
        requestAnimationFrame(animationFrame);
        setTimeout(() => resolve(), duration);
    });
};
const executeActionSequence = async (sequence: any[]) => {
    for (const action of sequence) {
        await sleep(200);
        switch (action.action) {
            case 'speak':
                addMessage('assistant', action.text);
                break;
            case 'move_mouse_to_element':
                const el = document.querySelector(action.selector);
                if (el) {
                    const startX = parseFloat(cursor.style.left || '0');
                    const startY = parseFloat(cursor.style.top || '0');
                    const rect = el.getBoundingClientRect();
                    const desktopRect = desktop.getBoundingClientRect();
                    const targetX = rect.left - desktopRect.left + rect.width / 2;
                    const targetY = rect.top - desktopRect.top + rect.height / 2;
                    await animateCursor(startX, startY, targetX, targetY, 600);
                }
                break;
            case 'click':
                const cursorRect = cursor.getBoundingClientRect();
                const targetElement = document.elementFromPoint(cursorRect.left + 12, cursorRect.top + 12);
                if (targetElement) {
                    (targetElement as HTMLElement).click();
                    await sleep(300);
                }
                break;
            case 'type':
                if (activeWindow) {
                    if (activeWindow.dataset.app === 'docs') {
                        const body = activeWindow.querySelector('.window-body');
                        if (body) {
                            const textWithBreaks = action.text.replace(/\n/g, '<br>');
                            for (const char of textWithBreaks) {
                                body.innerHTML += char;
                                await sleep(20);
                            }
                            if (action.enter) {
                                body.innerHTML += '<br>';
                            }
                            body.scrollTop = body.scrollHeight;
                        }
                    } else {
                        const targetInput = activeWindow.querySelector('input:focus, textarea:focus') as HTMLInputElement | HTMLTextAreaElement;
                        if (targetInput) {
                            for (const char of action.text) {
                                targetInput.value += char;
                                await sleep(25);
                            }
                            if (action.enter) {
                                const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                                targetInput.dispatchEvent(enterEvent);
                            }
                        }
                    }
                }
                break;
            case 'scroll':
                const scrollableEl = document.querySelector(action.selector);
                if(scrollableEl) {
                    scrollableEl.scrollBy({ top: action.pixels, behavior: 'smooth' });
                    await sleep(500);
                }
                break;
            case 'doodle':
                await useDoodlePad(action.lines);
                break;
            case 'generate_image':
                await useImageStudio(action.prompt);
                break;
            case 'find_image':
                try {
                    const response = await apiClient.generateImage(action.prompt);
                    const { base64ImageBytes } = await response.json();
                    if (base64ImageBytes) {
                        const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                        clipboard = { type: 'image', data: imageUrl };
                    }
                } catch(error) {
                    console.error("find_image error:", error);
                    addMessage('assistant', `Sorry, I couldn't create an image for: "${action.prompt}"`);
                }
                break;
            case 'place_image_in_doc':
                if (clipboard && clipboard.type === 'image') {
                    let docWindow: HTMLElement | null = Array.from(openWindows.values()).find(w => w.dataset.app === 'docs' && !openFiles.has(w))!;
                    if (!docWindow) {
                        docWindow = await openAppViaIcon('docs', '#icon-docs');
                    }
                    if (docWindow) {
                        setActiveWindow(docWindow);
                        const docBody = docWindow.querySelector('.window-body');
                        if (docBody) {
                            docBody.innerHTML += `<img src="${clipboard.data}" alt="AI Generated Image">`;
                            docBody.scrollTop = docBody.scrollHeight;
                        }
                    } else {
                         addMessage('assistant', "I couldn't open a document to place the image.");
                    }
                } else {
                    addMessage('assistant', "There's no image on the clipboard to place.");
                }
                break;
            case 'draw_with_cursor':
                if (action.lines && Array.isArray(action.lines)) {
                    for (const line of action.lines) {
                        await followCursorPath(line);
                    }
                }
                break;
            case 'list_files':
                await openAppViaIcon('explorer', '#icon-explorer');
                break;
            case 'open_file':
                if (action.filename) {
                    const files = await getFiles();
                    const docData = files.documents[action.filename];
                    const imgData = files.images[action.filename];
                    if (docData) {
                        openDocumentWriter({ name: action.filename, content: docData.content });
                    } else if (imgData) {
                        openImageViewer(action.filename, imgData.content);
                    } else {
                        addMessage('assistant', `File not found: "${action.filename}"`);
                    }
                }
                break;
            case 'save_active_file':
                if (activeWindow && action.filename) {
                    const appType = activeWindow.dataset.app;
                    if (appType === 'docs') {
                        const content = activeWindow.querySelector('.window-body')!.innerHTML;
                        await saveFile('documents', action.filename, content);
                        openFiles.set(activeWindow, { type: 'docs', name: action.filename });
                        activeWindow.querySelector('.window-title')!.textContent = `📝 ${action.filename}`;
                    } else if (appType === 'doodle') {
                        const canvas = activeWindow.querySelector('canvas') as HTMLCanvasElement;
                        const content = canvas.toDataURL();
                        await saveFile('images', action.filename, content);
                        openFiles.set(activeWindow, { type: 'doodle', name: action.filename });
                        activeWindow.querySelector('.window-title')!.textContent = `🎨 ${action.filename}`;
                    } else if (appType === 'studio') {
                        const img = activeWindow.querySelector('.image-container img') as HTMLImageElement;
                        if (img) {
                            await saveFile('images', action.filename, img.src);
                            openFiles.set(activeWindow, { type: 'studio', name: action.filename });
                            activeWindow.querySelector('.window-title')!.textContent = `🖼️ ${action.filename}`;
                        }
                    }
                }
                break;
            case 'drag_window':
                if (action.selector && typeof action.x === 'number' && typeof action.y === 'number') {
                    await dragWindow(action.selector, action.x, action.y);
                } else {
                     addMessage('assistant', `I was asked to move a window, but the details were missing.`);
                }
                break;
            case 'delete_file':
                 if (action.filename) {
                    const files = await getFiles();
                    if (files.documents[action.filename]) {
                        await deleteFile('documents', action.filename);
                    } else if (files.images[action.filename]) {
                        await deleteFile('images', action.filename);
                    } else {
                        addMessage('assistant', `File not found: "${action.filename}"`);
                    }
                    const explorer = openWindows.get('explorer');
                    if (explorer) {
                        await renderExplorer(explorer);
                    }
                }
                break;
        }
    }
};

const openDocumentWriter = (file: { name: string, content: string } | null = null) => {
    if (file) {
        for (const [win, fileInfo] of openFiles.entries()) {
            if (fileInfo.type === 'docs' && fileInfo.name === file.name) {
                setActiveWindow(win);
                return;
            }
        }
    }
    const windowTitle = file ? `📝 ${file.name}` : '📝 New Document';
    const windowEl = createAppWindow(windowTitle, file?.content || '', 'docs');
    const key = `docs-${Date.now()}`;
    openWindows.set(key, windowEl);
    const body = windowEl.querySelector('.window-body')!;
    body.setAttribute('contenteditable', 'true');
    body.setAttribute('spellcheck', 'false');
    let currentFilename = file?.name || null;
    if (currentFilename) {
        openFiles.set(windowEl, { type: 'docs', name: currentFilename });
    }
    const controls = windowEl.querySelector('.window-controls')!;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.innerHTML = '💾';
    saveBtn.title = 'Save File';
    controls.prepend(saveBtn);
    saveBtn.addEventListener('click', async () => {
        let saveAsName = currentFilename || prompt("Save as:", currentFilename || "document.txt");
        if (saveAsName) {
            const docContent = body.innerHTML;
            await saveFile('documents', saveAsName, docContent);
            currentFilename = saveAsName;
            openFiles.set(windowEl, { type: 'docs', name: currentFilename });
            windowEl.querySelector('.window-title')!.textContent = `📝 ${currentFilename}`;
        }
    });
};
const openBrowser = () => {
    if(openWindows.has('browser')) {
        setActiveWindow(openWindows.get('browser')!);
        return;
    }
    const windowEl = createAppWindow('🌐 Web Browser', '', 'browser', true);
    openWindows.set('browser', windowEl);
    const body = windowEl.querySelector('.window-body')!;
    body.innerHTML = `
        <div class="browser-header">
            <div class="browser-controls">
                <div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div>
            </div>
            <div class="address-bar-container">
                <input type="text" class="address-bar" placeholder="Search Google or type a URL">
                <button class="search-button">Go</button>
            </div>
        </div>
        <div class="browser-content">
            <div class="browser-homepage">
                <h1>AI Browser</h1>
                <p>Search the web using the address bar.</p>
            </div>
        </div>
    `;
    const addressBar = body.querySelector('.address-bar') as HTMLInputElement;
    const searchButton = body.querySelector('.search-button') as HTMLButtonElement;
    const browserContent = body.querySelector('.browser-content')!;
    browserState.set(windowEl, { query: '', sources: [], summary: '' });
    const performSearch = async () => {
        const query = addressBar.value.trim();
        if (!query) return;
        browserContent.innerHTML = `<div class="placeholder"><div class="spinner"></div>Searching for "${query}"...</div>`;
        try {
            const response = await apiClient.googleSearch(query);
            const { summary, sources } = await response.json();
            browserState.set(windowEl, { query, sources, summary });
            renderSearchResults(windowEl);
        } catch (error) {
            console.error('Browser Search Error:', error);
            browserContent.innerHTML = `<div class="placeholder error">Sorry, something went wrong with the search.</div>`;
        }
    };
    addressBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    searchButton.addEventListener('click', performSearch);
};
const renderSearchResults = (windowEl: HTMLElement) => {
    const state = browserState.get(windowEl);
    if (!state) return;
    const { query, sources } = state;
    const browserContent = windowEl.querySelector('.browser-content')!;
    const resultsHtml = sources.map((source: any, index: number) => `
        <div class="google-result" data-index="${index}">
            <div class="google-result-url">${source.web?.uri || 'Unknown Source'}</div>
            <h3 class="google-result-title">${source.web?.title || 'Untitled'}</h3>
            <p class="google-result-snippet">A summary of this content is available.</p>
        </div>
    `).join('');
    browserContent.innerHTML = `
        <div class="google-serp-container">
            <div class="google-header">
                <span class="google-logo">AI Search</span>
                <div class="google-search-bar-container">
                     <span class="google-search-icon">🔍</span>
                    <input type="text" class="google-search-bar" value="${query}" readonly>
                </div>
            </div>
            <div class="google-search-results">
                ${resultsHtml || '<p>No results found.</p>'}
            </div>
        </div>
    `;
    browserContent.querySelectorAll('.google-result').forEach(resultEl => {
        resultEl.addEventListener('click', () => {
            const index = parseInt((resultEl as HTMLElement).dataset.index!, 10);
            renderPageView(windowEl, index);
        });
    });
};
const renderPageView = (windowEl: HTMLElement, sourceIndex: number) => {
    const state = browserState.get(windowEl);
    if (!state) return;
    const { sources, summary } = state;
    const source = sources[sourceIndex];
    if (!source) return;
    const browserContent = windowEl.querySelector('.browser-content')!;
    browserContent.innerHTML = `
        <div class="browser-page-view">
            <button class="back-button">&larr; Back to Results</button>
            <header class="page-header">
                <h2>${source.web?.title || 'Untitled'}</h2>
                <a href="${source.web?.uri}" target="_blank">${source.web?.uri}</a>
            </header>
            <div class="page-content">
                <h3>Summary</h3>
                <p>${summary.replace(/\n/g, '<br>')}</p>
            </div>
        </div>
    `;
    browserContent.querySelector('.back-button')?.addEventListener('click', () => {
        renderSearchResults(windowEl);
    });
};
const useDoodlePad = async (lines: [number, number][][]) => {
    let windowEl: HTMLElement | null = openWindows.get('doodle') || null;
    if (!windowEl) {
        windowEl = await openAppViaIcon('doodle', '#icon-doodle');
        if (!windowEl) {
            addMessage('assistant', "I couldn't open the Doodle Pad.");
            return;
        }
    }
    setActiveWindow(windowEl!);
    const canvas = windowEl!.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    for (const line of lines) {
        if (line.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(line[0][0], line[0][1]);
        for (let i = 1; i < line.length; i++) {
            ctx.lineTo(line[i][0], line[i][1]);
            ctx.stroke();
            await sleep(10);
        }
    }
};
const openDoodlePad = (file: { name: string, content: string } | null = null) => {
    if (file) {
        for (const [win, fileInfo] of openFiles.entries()) {
            if (fileInfo.type === 'doodle' && fileInfo.name === file.name) {
                setActiveWindow(win);
                return win;
            }
        }
    }
    const windowTitle = file ? `🎨 ${file.name}` : '🎨 Doodle Pad';
    const windowEl = createAppWindow(windowTitle, '', 'doodle', true);
    openWindows.set('doodle', windowEl);
    const body = windowEl.querySelector('.window-body')!;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (file) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = file.content;
        openFiles.set(windowEl, { type: 'doodle', name: file.name });
    }
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    const draw = (e: MouseEvent) => {
        if (!isDrawing) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
    };
    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);
    const controls = windowEl.querySelector('.window-controls')!;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.innerHTML = '💾';
    saveBtn.title = 'Save Doodle';
    controls.prepend(saveBtn);
    saveBtn.addEventListener('click', async () => {
        let currentFilename = openFiles.get(windowEl)?.name;
        let saveAsName = currentFilename || prompt("Save as:", currentFilename || "doodle.png");
        if (saveAsName) {
            const dataUrl = canvas.toDataURL('image/png');
            await saveFile('images', saveAsName, dataUrl);
            openFiles.set(windowEl, { type: 'doodle', name: saveAsName });
            windowEl.querySelector('.window-title')!.textContent = `🎨 ${saveAsName}`;
        }
    });
    return windowEl;
};
const useImageStudio = async (prompt: string) => {
    let windowEl: HTMLElement | null = openWindows.get('studio') || null;
    if (!windowEl) {
        windowEl = await openAppViaIcon('studio', '#icon-studio');
        if (!windowEl) {
            addMessage('assistant', "I couldn't open the Image Studio.");
            return;
        }
    }
    setActiveWindow(windowEl);
    const imageContainer = windowEl.querySelector('.image-container')!;
    const promptDisplay = windowEl.querySelector('.image-prompt')!;
    promptDisplay.textContent = `Prompt: "${prompt}"`;
    imageContainer.innerHTML = `<div class="spinner"></div><p>Generating image...</p>`;
    try {
        const response = await apiClient.generateImage(prompt);
        const { base64ImageBytes } = await response.json();

        if (base64ImageBytes) {
            const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
            imageContainer.innerHTML = `<img src="${imageUrl}" alt="${prompt}">`;
            clipboard = { type: 'image', data: imageUrl };
            showToast('Image generated and copied to clipboard.');
        } else {
             imageContainer.innerHTML = `<p class="error">Couldn't generate an image for that prompt.</p>`;
        }
    } catch (error) {
        console.error("Image generation error:", error);
        imageContainer.innerHTML = `<p class="error">An error occurred during image generation.</p>`;
    }
};
const openImageStudio = () => {
    if(openWindows.has('studio')) {
        setActiveWindow(openWindows.get('studio')!);
        return openWindows.get('studio')!;
    }
    const windowEl = createAppWindow('🖼️ Image Studio', '', 'studio');
    openWindows.set('studio', windowEl);
    const body = windowEl.querySelector('.window-body')!;
    body.innerHTML = `
        <div class="image-studio-content">
            <div class="image-prompt">Enter a prompt via chat to generate an image.</div>
            <div class="image-container">
                 <div class="placeholder">
                    <span>🖼️</span>
                    <p>Generated image will appear here.</p>
                </div>
            </div>
        </div>
    `;
    const controls = windowEl.querySelector('.window-controls')!;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.innerHTML = '💾';
    saveBtn.title = 'Save Image';
    controls.prepend(saveBtn);
    saveBtn.addEventListener('click', async () => {
        const img = body.querySelector('.image-container img') as HTMLImageElement;
        if (img) {
            let currentFilename = openFiles.get(windowEl)?.name;
            let saveAsName = currentFilename || prompt("Save as:", currentFilename || "image.png");
             if (saveAsName) {
                await saveFile('images', saveAsName, img.src);
                openFiles.set(windowEl, { type: 'studio', name: saveAsName });
                windowEl.querySelector('.window-title')!.textContent = `🖼️ ${saveAsName}`;
            }
        } else {
            showToast("There is no image to save.");
        }
    });
    return windowEl;
};
const openImageViewer = (name: string, content: string) => {
    for (const [win, fileInfo] of openFiles.entries()) {
        if (['doodle', 'studio'].includes(fileInfo.type) && fileInfo.name === name) {
            setActiveWindow(win);
            return;
        }
    }
    const isDoodle = name.toLowerCase().includes('doodle');
    if (isDoodle) {
        openDoodlePad({ name, content });
    } else {
        openImageStudioWithContent(name, content);
    }
};
const openImageStudioWithContent = (name: string, content: string) => {
    const windowEl = openImageStudio();
    setActiveWindow(windowEl);
    const imageContainer = windowEl.querySelector('.image-container')!;
    const promptDisplay = windowEl.querySelector('.image-prompt')!;
    promptDisplay.textContent = `Viewing: "${name}"`;
    imageContainer.innerHTML = `<img src="${content}" alt="${name}">`;
    openFiles.set(windowEl, { type: 'studio', name });
    windowEl.querySelector('.window-title')!.textContent = `🖼️ ${name}`;
};
const renderExplorer = async (windowEl: HTMLElement) => {
    const body = windowEl.querySelector('.window-body')! as HTMLElement;
    const view = body.dataset.view || 'list';
    const allFiles = await getFiles();
    if (!allFiles) return;

    const documents = Object.entries(allFiles.documents || {}).map(([name, data]) => ({ name, type: 'document', data }));
    const images = Object.entries(allFiles.images || {}).map(([name, data]) => ({ name, type: 'image', data }));
    
    const files = [...documents, ...images].sort((a, b) => (b.data as any).modified - (a.data as any).modified);

    if (files.length === 0) {
        body.innerHTML = '<div class="placeholder">No saved files yet.</div>';
        return;
    }
    if (view === 'list') {
        body.innerHTML = `
            <ul class="file-list">
                ${files.map(file => `
                    <li class="file-item-row" data-filename="${file.name}" data-filetype="${file.type}" tabindex="0">
                        <span class="file-icon">${file.type === 'document' ? '📝' : '🖼️'}</span>
                        <div class="file-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-date">Modified: ${new Date((file.data as any).modified).toLocaleString()}</div>
                        </div>
                        <div class="file-actions">
                            <button class="delete-file-btn" data-filename="${file.name}" data-filetype="${file.type}">Delete</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    } else {
        body.innerHTML = `
            <ul class="file-grid">
                 ${files.map(file => `
                    <li class="file-grid-item" data-filename="${file.name}" data-filetype="${file.type}" tabindex="0">
                        <div class="file-thumbnail">
                            ${file.type === 'image' ? `<img src="${(file.data as any).content}" alt="${file.name}">` : '<span class="file-icon">📝</span>'}
                        </div>
                        <div class="file-name">${file.name}</div>
                         <div class="file-actions">
                            <button class="delete-file-btn" data-filename="${file.name}" data-filetype="${file.type}">Delete</button>
                        </div>
                    </li>
                 `).join('')}
            </ul>
        `;
    }
    body.querySelectorAll('.file-item-row, .file-grid-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            if ((e.target as HTMLElement).classList.contains('delete-file-btn')) return;
            const el = item as HTMLElement;
            const filename = el.dataset.filename!;
            const filetype = el.dataset.filetype!;
            const allFiles = await getFiles();
            if (!allFiles) return;
            const fileData = allFiles[filetype === 'document' ? 'documents' : 'images'][filename];
            if(filetype === 'document') {
                openDocumentWriter({ name: filename, content: fileData.content });
            } else {
                openImageViewer(filename, fileData.content);
            }
        });
    });
     body.querySelectorAll('.delete-file-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const el = btn as HTMLElement;
            const filename = el.dataset.filename!;
            const filetype = el.dataset.filetype!;
            if (confirm(`Are you sure you want to delete "${filename}"?`)) {
                await deleteFile(filetype, filename);
                await renderExplorer(windowEl);
            }
        });
    });
};
const openFileExplorer = async () => {
    let windowEl = openWindows.get('explorer');
    if (windowEl) {
        setActiveWindow(windowEl);
        await renderExplorer(windowEl);
        return;
    }
    windowEl = createAppWindow('📁 File Explorer', '', 'explorer', true);
    openWindows.set('explorer', windowEl);
    const header = windowEl.querySelector('.window-header')!;
    const viewControls = document.createElement('div');
    viewControls.className = 'view-controls';
    viewControls.innerHTML = `
        <button class="view-toggle list active" data-view="list" title="List View">📄</button>
        <button class="view-toggle grid" data-view="grid" title="Grid View">🖼️</button>
    `;
    header.prepend(viewControls);
    const body = windowEl.querySelector('.window-body')! as HTMLElement;
    body.dataset.view = 'list';
    await renderExplorer(windowEl);
    viewControls.querySelectorAll('.view-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
            const view = (btn as HTMLElement).dataset.view!;
            body.dataset.view = view;
            viewControls.querySelector('.active')?.classList.remove('active');
            btn.classList.add('active');
            await renderExplorer(windowEl!);
        });
    });
};
const createAppWindow = (title: string, content: string, app: string, noPadding = false) => {
    const windowEl = document.createElement('div');
    windowEl.className = 'app-window';
    windowEl.style.zIndex = String(windowZIndex++);
    windowEl.dataset.app = app;
    windowEl.id = `window-${app}-${Date.now()}`;
    windowEl.innerHTML = `
        <header class="window-header">
            <span class="window-title">${title}</span>
            <div class="window-controls">
                <button class="maximize-btn" title="Maximize/Restore">&#x26F6;</button>
                <button class="close-btn" title="Close Window">&times;</button>
            </div>
        </header>
        <div class="window-body ${noPadding ? 'no-padding' : ''}">${content}</div>
    `;
    desktop.appendChild(windowEl);
    setActiveWindow(windowEl);
    makeDraggable(windowEl);
    windowEl.querySelector('.close-btn')?.addEventListener('click', () => {
        windowEl.remove();
        for (const [key, value] of openWindows.entries()) {
            if (value === windowEl) {
                openWindows.delete(key);
                break;
            }
        }
        openFiles.delete(windowEl);
        browserState.delete(windowEl);
    });
    windowEl.querySelector('.maximize-btn')?.addEventListener('click', () => {
        if (windowEl.classList.contains('maximized')) {
            windowEl.classList.remove('maximized');
            windowEl.style.top = windowEl.dataset.restoreTop || '';
            windowEl.style.left = windowEl.dataset.restoreLeft || '';
            windowEl.style.width = windowEl.dataset.restoreWidth || '';
            windowEl.style.height = windowEl.dataset.restoreHeight || '';
        } else {
            const rect = windowEl.getBoundingClientRect();
            const desktopRect = desktop.getBoundingClientRect();
            windowEl.dataset.restoreTop = `${rect.top - desktopRect.top}px`;
            windowEl.dataset.restoreLeft = `${rect.left - desktopRect.left}px`;
            windowEl.dataset.restoreWidth = `${rect.width}px`;
            windowEl.dataset.restoreHeight = `${rect.height}px`;
            windowEl.classList.add('maximized');
            windowEl.style.top = '';
            windowEl.style.left = '';
            windowEl.style.width = '';
            windowEl.style.height = '';
        }
    });
    windowEl.addEventListener('mousedown', () => setActiveWindow(windowEl));
    const desktopRect = desktop.getBoundingClientRect();
    const maxX = desktopRect.width - windowEl.offsetWidth - 20;
    const maxY = desktopRect.height - windowEl.offsetHeight - 20;
    windowEl.style.left = `${Math.random() * (maxX - 50) + 50}px`;
    windowEl.style.top = `${Math.random() * (maxY - 50) + 50}px`;
    return windowEl;
};
const setActiveWindow = (windowEl: HTMLElement) => {
    if (activeWindow === windowEl) return;
    activeWindow = windowEl;
    document.querySelectorAll('.app-window').forEach(win => {
        if (win === windowEl) {
            (win as HTMLElement).style.zIndex = String(windowZIndex++);
            (win as HTMLElement).style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
        } else {
            (win as HTMLElement).style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.3)';
        }
    });
};
const makeDraggable = (el: HTMLElement) => {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = el.querySelector('.window-header') as HTMLElement;
    if (header) {
        header.onmousedown = dragMouseDown;
    }
    function dragMouseDown(e: MouseEvent) {
        if ((e.target as HTMLElement).closest('button')) return;
        if (el.classList.contains('maximized')) return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    function elementDrag(e: MouseEvent) {
        if (el.classList.contains('maximized')) return;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        let newTop = el.offsetTop - pos2;
        let newLeft = el.offsetLeft - pos1;
        const desktopRect = desktop.getBoundingClientRect();
        newLeft = Math.max(0, Math.min(newLeft, desktopRect.width - el.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, desktopRect.height - el.offsetHeight));
        el.style.top = newTop + "px";
        el.style.left = newLeft + "px";
    }
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
};
const showToast = (message: string) => {
    document.body.dataset.toastMessage = message;
    document.body.classList.add('show-toast');
    setTimeout(() => {
        document.body.classList.remove('show-toast');
    }, 3000);
};

// --- File & Session Management (Server-backed) ---

const getFiles = async () => {
    if (!currentUser) return { documents: {}, images: {} };
    try {
        const response = await apiClient.getFiles();
        return await response.json();
    } catch (error) {
        console.error("Error getting files:", error);
        showToast(`Could not load files: ${(error as Error).message}`);
        return { documents: {}, images: {} };
    }
};

const saveFile = async (type: 'documents' | 'images', name: string, content: string) => {
    if (!currentUser) {
        showToast("You must be logged in to save files.");
        return;
    }
    try {
        await apiClient.saveFile(type, name, content);
        showToast(`Saved as ${name}`);
        addMessage('assistant', `Saved ${type.slice(0, -1)} as "${name}"`);
        updateStorageIndicator();
    } catch (error) {
        console.error("Error saving file:", error);
        showToast(`Could not save file: ${(error as Error).message}`);
        addMessage('assistant', `I couldn't save "${name}": ${(error as Error).message}`);
    }
};

const deleteFile = async (type: string, name: string) => {
    if (!currentUser) return;
    try {
        await apiClient.deleteFile(type, name);
        showToast(`Deleted ${name}`);
        addMessage('assistant', `Deleted ${type.slice(0, -1)}: "${name}"`);
        updateStorageIndicator();
    } catch (error) {
        console.error("Error deleting file:", error);
        showToast(`Could not delete file: ${(error as Error).message}`);
    }
};

const saveSession = async () => {
    if (!currentUser) {
        showToast("You must be logged in to save sessions.");
        return;
    }
    const state = {
        openWindows: Array.from(openWindows.entries()).map(([key, win]) => {
            const body = win.querySelector('.window-body')!;
            return {
                key,
                app: win.dataset.app,
                title: win.querySelector('.window-title')?.textContent,
                left: win.style.left,
                top: win.style.top,
                width: win.style.width,
                height: win.style.height,
                content: body.innerHTML,
                fileInfo: openFiles.get(win),
                browserState: browserState.get(win)
            };
        }),
        chatHistory: chatHistory.innerHTML,
    };
    try {
        await apiClient.saveSession(state);
        showToast("Session saved!");
    } catch (error) {
        console.error("Error saving session:", error);
        showToast(`Could not save session: ${(error as Error).message}`);
    }
};

const loadSession = async (sessionId: string) => {
    try {
        const response = await apiClient.loadSession(sessionId);
        const state = await response.json();
        
        initializeAppState();
        chatHistory.innerHTML = state.chatHistory || '';
        chatHistory.scrollTop = chatHistory.scrollHeight;

        state.openWindows.forEach((winData: any) => {
            let windowEl: HTMLElement | undefined;
            switch(winData.app) {
                 case 'docs':
                    if (winData.fileInfo) {
                        openDocumentWriter({ name: winData.fileInfo.name, content: winData.content });
                    } else {
                        openDocumentWriter();
                    }
                    windowEl = Array.from(openWindows.values()).pop();
                    if (windowEl) windowEl.querySelector('.window-body')!.innerHTML = winData.content;
                    break;
                case 'browser':
                    openBrowser();
                    windowEl = openWindows.get('browser');
                    if (windowEl && winData.browserState) {
                        browserState.set(windowEl, winData.browserState);
                        if(winData.browserState.query) {
                           renderSearchResults(windowEl);
                        }
                    }
                    break;
                case 'doodle':
                     if(winData.fileInfo) {
                        openDoodlePad({name: winData.fileInfo.name, content: winData.content.match(/src="([^"]+)"/)?.[1] || ''});
                    } else {
                        openDoodlePad();
                    }
                    break;
                case 'studio':
                    if(winData.fileInfo) {
                        openImageStudioWithContent(winData.fileInfo.name, winData.content.match(/src="([^"]+)"/)?.[1] || '');
                    } else {
                        openImageStudio();
                    }
                    windowEl = openWindows.get('studio');
                    if(windowEl) windowEl.querySelector('.image-container')!.innerHTML = winData.content;
                    break;
                 case 'explorer':
                    openFileExplorer();
                    break;
            }
            if (windowEl) {
                windowEl.style.left = winData.left;
                windowEl.style.top = winData.top;
                windowEl.style.width = winData.width;
                windowEl.style.height = winData.height;
                if(winData.fileInfo) openFiles.set(windowEl, winData.fileInfo);
            }
        });
        
        loadSessionModal.style.display = 'none';
        showToast("Session loaded.");
    } catch (error) {
        console.error("Error loading session:", error);
        showToast(`Could not load session: ${(error as Error).message}`);
    }
};

const deleteSession = async (sessionId: string) => {
    if (!currentUser) return;
    try {
        await apiClient.deleteSession(sessionId);
        await renderLoadSessionModal();
    } catch (error) {
        console.error("Error deleting session:", error);
        showToast(`Could not delete session: ${(error as Error).message}`);
    }
};

const renderLoadSessionModal = async () => {
    try {
        const response = await apiClient.getSessions();
        const sessions = await response.json();
        const sortedSessions = Object.entries(sessions).sort((a, b) => {
            return parseInt(b[0].split('_')[1]) - parseInt(a[0].split('_')[1]);
        });

        if (sortedSessions.length === 0) {
            savedSessionsList.innerHTML = '<li>No saved sessions.</li>';
            return;
        }
        
        savedSessionsList.innerHTML = sortedSessions.map(([id, _]) => `
            <li class="session-item">
                <span class="session-item-date">Session from ${new Date(parseInt(id.split('_')[1])).toLocaleString()}</span>
                <div class="session-item-actions">
                    <button class="load-session-btn" data-session-id="${id}">Load</button>
                    <button class="delete-session-btn" data-session-id="${id}">Delete</button>
                </div>
            </li>
        `).join('');
    } catch (error) {
        console.error("Error rendering sessions:", error);
        savedSessionsList.innerHTML = `<li>Error loading sessions: ${(error as Error).message}</li>`;
    }
};

// --- Event Listeners ---
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${chatInput.scrollHeight}px`;
});
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserInput();
    }
});
sendButton.addEventListener('click', handleUserInput);
iconDocs.addEventListener('click', () => openDocumentWriter());
iconBrowser.addEventListener('click', openBrowser);
iconDoodle.addEventListener('click', () => openDoodlePad());
iconStudio.addEventListener('click', openImageStudio);
iconExplorer.addEventListener('click', openFileExplorer);
saveButton.addEventListener('click', saveSession);
loadButton.addEventListener('click', async () => {
    await renderLoadSessionModal();
    loadSessionModal.style.display = 'flex';
});
closeModalBtn.addEventListener('click', () => {
    loadSessionModal.style.display = 'none';
});
savedSessionsList.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const sessionId = target.dataset.sessionId;
    if (!sessionId) return;
    if (target.classList.contains('load-session-btn')) {
        await loadSession(sessionId);
    } else if (target.classList.contains('delete-session-btn')) {
        if(confirm('Are you sure you want to delete this session?')) {
            await deleteSession(sessionId);
        }
    }
});
let welcomeClickCount = 0;
let welcomeClickTimer: number | null = null;
welcomeMessage.addEventListener('click', () => {
    welcomeClickCount++;
    if (welcomeClickTimer) {
        clearTimeout(welcomeClickTimer);
    }
    welcomeClickTimer = window.setTimeout(() => {
        welcomeClickCount = 0;
    }, 2000);
    if (welcomeClickCount === 5) {
        welcomeClickCount = 0;
        if (welcomeClickTimer) clearTimeout(welcomeClickTimer);
        promptForTestingMode();
    }
});
testingModeIndicator.addEventListener('click', disableTestingMode);
debugButton.addEventListener('click', () => {
    debugConsole.classList.remove('hidden');
    // Ensure it's on top of all other UI, including modals
    debugConsole.style.zIndex = '10002';
});
closeDebugConsoleBtn.addEventListener('click', () => {
    debugConsole.classList.add('hidden');
});

// Make debug console draggable
makeDraggable(debugConsole);

// Run session check on page load
checkSession();