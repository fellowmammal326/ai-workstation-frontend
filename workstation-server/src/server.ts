

// FIX: Changed express import to include explicit types for Request, Response, and NextFunction
// to resolve type errors throughout the file.
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 10000;

// === In-Memory Data Store ===
interface UserData {
    password: string;
    files: {
        documents: { [name: string]: { content: string, modified: number } };
        images: { [name: string]: { content: string, modified: number } };
    };
    sessions: { [id: string]: any };
}
const userData: { [username: string]: UserData } = {};

// === Middleware ===
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// === Gemini AI Initialization (Robust) ===
let ai: GoogleGenAI | null = null;
let aiInitializationError: string | null = null;

try {
    // NOTE: For local development, you can create a .env file in this directory
    // with your API_KEY, and it will be loaded automatically by Node.
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable not set. Please create a .env file in the workstation-server directory.");
    }
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.log("Gemini AI initialized successfully.");
} catch (e: any) {
    aiInitializationError = e.message;
    console.error("!!! GEMINI AI INITIALIZATION FAILED !!!");
    console.error(aiInitializationError);
}

const systemInstruction = `You are an AI assistant with a virtual workstation. You can control a virtual mouse cursor to interact with applications on the desktop.
With every request, you will receive the current state of the desktop, including desktop dimensions and details for all open windows (ID, title, position, size). Use this information to understand what's on the screen and where to position items. The user's request will follow the desktop state.
Your primary role is to find and display information for the user, not to narrate it back to them in the chat. Use the browser to find information and leave the results on the screen for the user to read. Use the 'speak' action to explain your steps, not to deliver the final answer.
Your response MUST be a JSON object with a single key "sequence", which is an array of action objects. Do not add any extra text or markdown.
To resize a window, move the mouse to its maximize/restore button (selector: '#window-id .maximize-btn') and click it.
Available actions:
1.  {"action": "speak", "text": "string"}: Say something to the user in the chat to explain what you're doing.
2.  {"action": "move_mouse_to_element", "selector": "#element-id"}: Move the mouse cursor to the center of a given DOM element with a natural, curved motion.
3.  {"action": "click"}: Simulate a left mouse click at the current cursor position. This will focus the clicked element (like an input field).
4.  {"action": "type", "text": "string", "enter": boolean (optional)}: Types text into the currently active window's focused element. The Document Writer supports rich text and images.
5.  {"action": "scroll", "selector": "string", "pixels": number}: Scrolls a specific element (like a window body) down by a certain number of pixels. The selector must point to the scrollable element.
6.  {"action": "doodle", "lines": [[[x,y], [x,y], ...], [[x,y], ...]]}: A high-level action that opens the doodle pad and draws a series of lines.
7.  {"action": "draw_with_cursor", "lines": [[[x,y], [x,y], ...]]}: Move the cursor along a specific path on the desktop for expressive gestures.
8.  {"action": "generate_image", "prompt": "string"}: Opens the Image Studio and generates an image from the given text prompt. The generated image is automatically copied to the clipboard.
9.  {"action": "find_image", "prompt": "string"}: A high-level action that generates an image in the background (without opening a window) and copies it to the clipboard, ready to be placed.
10. {"action": "place_image_in_doc"}: Places the image from the clipboard into the Document Writer app.
11. {"action": "list_files"}: Opens the File Explorer to show all saved files.
12. {"action": "open_file", "filename": "string"}: Opens a file from the file system.
13. {"action": "save_active_file", "filename": "string"}: Saves the content of the currently active window with the given filename.
14. {"action": "delete_file", "filename": "string"}: Deletes a file from the file system.
15. {"action": "drag_window", "selector": "#window-id", "x": number, "y": number}: Drags a window to a new position on the desktop. The coordinates are relative to the top-left of the desktop.
Example Task: "Make the document window fullscreen."
Assuming desktop state shows: Open Windows: - Window ID: #window-docs-12345, Title: "📝 New Document", Maximized: false
{ "sequence": [
    {"action": "speak", "text": "Okay, I'll make the document window fullscreen."},
    {"action": "move_mouse_to_element", "selector": "#window-docs-12345 .maximize-btn"},
    {"action": "click"}
]}`;
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    sequence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          text: { type: Type.STRING, nullable: true },
          selector: { type: Type.STRING, nullable: true },
          query: { type: Type.STRING, nullable: true },
          prompt: { type: Type.STRING, nullable: true },
          filename: { type: Type.STRING, nullable: true },
          enter: { type: Type.BOOLEAN, nullable: true },
          pixels: { type: Type.NUMBER, nullable: true },
          x: { type: Type.NUMBER, nullable: true },
          y: { type: Type.NUMBER, nullable: true },
          lines: {
            type: Type.ARRAY,
            nullable: true,
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.NUMBER,
                },
              },
            },
          },
        },
      },
    },
  },
  required: ["sequence"],
};

// === Auth Middleware ===
// FIX: Updated function signature to use imported Request, Response, and NextFunction types.
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const username = req.headers['x-username'] as string;
    if (!username) {
        return res.status(401).json({ message: 'Unauthorized: X-Username header is required.' });
    }
    if (!userData[username]) {
        return res.status(401).json({ message: 'Unauthorized: User not found.' });
    }
    (req as any).username = username; // Attach username to request for endpoint handlers
    next();
};

// === Public Routes (No Auth Required) ===
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        aiStatus: aiInitializationError ? 'error' : 'ok',
        aiError: aiInitializationError,
    });
});

app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (userData[username]) {
        return res.status(409).json({ message: 'Username is already taken.' });
    }
    userData[username] = {
        password, // In a real app, HASH AND SALT this password!
        files: { documents: {}, images: {} },
        sessions: {},
    };
    console.log(`User created: ${username}`);
    res.status(201).json({ message: 'User created successfully.' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    const user = userData[username];
    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Invalid username or password.' });
    }
    console.log(`User logged in: ${username}`);
    res.status(200).json({ message: 'Login successful.' });
});

// === Protected API Routes (Auth Required) ===

// --- File Routes ---
app.get('/api/files', authMiddleware, (req, res) => {
    const { username } = req as any;
    res.json(userData[username].files);
});

app.post('/api/files', authMiddleware, (req, res) => {
    const { username } = req as any;
    const { type, name, content } = req.body as { type: 'documents' | 'images', name: string, content: string };
    if (!['documents', 'images'].includes(type) || !name || content === undefined) {
        return res.status(400).json({ message: 'Invalid file data provided.' });
    }
    userData[username].files[type][name] = { content, modified: Date.now() };
    res.status(201).json({ message: 'File saved successfully.' });
});

app.delete('/api/files/:type/:name', authMiddleware, (req, res) => {
    const { username } = req as any;
    const { type, name } = req.params;
    if ((type !== 'documents' && type !== 'images') || !userData[username].files[type as 'documents' | 'images'][name]) {
         return res.status(404).json({ message: 'File not found.' });
    }
    delete userData[username].files[type as 'documents' | 'images'][name];
    res.status(200).json({ message: 'File deleted successfully.' });
});


// --- Session Routes ---
app.get('/api/sessions', authMiddleware, (req, res) => {
    const { username } = req as any;
    res.json(userData[username].sessions);
});

app.post('/api/sessions', authMiddleware, (req, res) => {
    const { username } = req as any;
    const sessionId = `session_${Date.now()}`;
    userData[username].sessions[sessionId] = req.body;
    res.status(201).json({ message: 'Session saved successfully.' });
});

app.get('/api/sessions/:id', authMiddleware, (req, res) => {
    const { username } = req as any;
    const session = userData[username].sessions[req.params.id];
    if (!session) {
        return res.status(404).json({ message: 'Session not found.' });
    }
    res.json(session);
});

app.delete('/api/sessions/:id', authMiddleware, (req, res) => {
    const { username } = req as any;
    if (!userData[username].sessions[req.params.id]) {
        return res.status(404).json({ message: 'Session not found.' });
    }
    delete userData[username].sessions[req.params.id];
    res.status(200).json({ message: 'Session deleted successfully.' });
});

// --- Storage Route ---
app.get('/api/storage', authMiddleware, (req, res) => {
    const { username } = req as any;
    const user = userData[username];
    const userStorageString = JSON.stringify({ files: user.files, sessions: user.sessions });
    const sizeInBytes = new Blob([userStorageString]).size;
    res.json({ used: sizeInBytes });
});


// --- AI Routes ---
// FIX: Updated function signature to use imported Request, Response, and NextFunction types.
const checkAiService = (req: Request, res: Response, next: NextFunction) => {
    if (!ai) {
        return res.status(503).json({ message: `AI service is unavailable. Server-side error: ${aiInitializationError}` });
    }
    next();
};

app.post('/api/ai/chat', authMiddleware, checkAiService, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: 'Prompt is required.' });
        }
        const response = await ai!.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema,
            }
        });
        res.json({ decision: response.text });
    } catch (error) {
        console.error('AI Chat Error:', error);
        res.status(500).json({ message: 'Error processing AI chat request.' });
    }
});

app.post('/api/ai/generate-image', authMiddleware, checkAiService, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: 'Prompt is required.' });
        }
        const response = await ai!.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
        });
        const base64ImageBytes = response.generatedImages?.[0]?.image.imageBytes || null;
        res.json({ base64ImageBytes });
    } catch (error) {
        console.error('AI Image Generation Error:', error);
        res.status(500).json({ message: 'Error generating image.' });
    }
});

app.post('/api/ai/google-search', authMiddleware, checkAiService, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ message: 'Query is required.' });
        }
        const response = await ai!.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Summarize information about "${query}" from the web.`,
            config: { tools: [{ googleSearch: {} }] },
        });
        const summary = response.text;
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        res.json({ summary, sources });
    } catch (error) {
        console.error('AI Google Search Error:', error);
        res.status(500).json({ message: 'Error with Google Search.' });
    }
});


// === Start Server ===
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Data is stored in-memory and will be lost on restart.');
});
