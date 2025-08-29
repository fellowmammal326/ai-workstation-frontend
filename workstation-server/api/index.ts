// Fix: Aliased express types to avoid conflicts with global types.
import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction as ExpressNextFunction } from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import { kv } from '@vercel/kv';

// Initialize the Express application for Vercel
const app = express();

// === Type Definition for User Data ===
interface UserData {
    password: string;
    files: {
        documents: { [name: string]: { content: string, modified: number } };
        images: { [name: string]: { content: string, modified: number } };
    };
    sessions: { [id: string]: any };
}

// === Middleware ===

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Enable the express.json middleware to parse incoming JSON payloads
// Increase the limit to 10MB to allow for larger image/session saves.
app.use(express.json({ limit: '10mb' }));

// === Gemini AI Initialization (Robust) ===
let ai: GoogleGenAI | null = null;
let aiInitializationError: string | null = null;

try {
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable not set in server environment");
    }
    ai = new GoogleGenAI({ apiKey: API_KEY });
    console.log("Gemini AI initialized successfully.");
} catch (e: any) {
    aiInitializationError = e.message;
    console.error("!!! GEMINI AI INITIALIZATION FAILED !!!");
    console.error(aiInitializationError);
}


// Constants for AI interaction
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

// === Public Routes (No Auth Required) ===

// Health Check Endpoint
app.get('/api/health', (req: ExpressRequest, res: ExpressResponse) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        aiStatus: aiInitializationError ? 'error' : 'ok',
        aiError: aiInitializationError,
    });
});


// === Middleware to get user from header using Vercel KV ===
const getUser = async (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    // Allow signup and login routes to pass through
    if (req.path === '/api/signup' || req.path === '/api/login') {
        return next();
    }
    
    const username = req.headers['x-username'] as string;
    if (!username) {
         return res.status(401).json({ message: 'Unauthorized: X-Username header not provided.' });
    }

    try {
        const user = await kv.get<UserData>(username);
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized: User not found.' });
        }
        // Attach username to the request object for later use
        (req as any).username = username;
        next();
    } catch(error) {
        console.error("KV Error in getUser:", error);
        return res.status(500).json({ message: 'Database error.' });
    }
};
app.use(getUser);


// === API Routes ===

// --- Auth Routes ---

app.post('/api/signup', async (req: ExpressRequest, res: ExpressResponse) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  
  try {
      const existingUser = await kv.get(username);
      if (existingUser) {
        return res.status(409).json({ message: 'Username is already taken.' });
      }

      const newUser: UserData = {
        password, // IMPORTANT: In a real app, you MUST HASH AND SALT this password!
        files: { documents: {}, images: {} },
        sessions: {}
      };
      
      await kv.set(username, newUser);

      console.log(`User created: ${username}`);
      res.status(201).json({ message: 'User created successfully!' });
  } catch(error) {
      console.error("KV Error in signup:", error);
      res.status(500).json({ message: 'Error creating user.' });
  }
});

app.post('/api/login', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    
    try {
        const user = await kv.get<UserData>(username);
        // IMPORTANT: In a real app, you would compare a hashed password here!
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        console.log(`User logged in: ${username}`);
        res.status(200).json({ message: 'Login successful.' });
    } catch(error) {
        console.error("KV Error in login:", error);
        res.status(500).json({ message: 'Error during login.' });
    }
});

// --- File Routes ---

app.get('/api/files', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const user = await kv.get<UserData>(username);
    res.json(user!.files);
});

app.post('/api/files', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const { type, name, content } = req.body as { type: 'documents' | 'images', name: string, content: string };
    if (!['documents', 'images'].includes(type) || !name || content === undefined) {
        return res.status(400).json({ message: 'Invalid file data provided.' });
    }
    
    const user = await kv.get<UserData>(username);
    user!.files[type][name] = { content, modified: Date.now() };
    await kv.set(username, user);

    console.log(`Saved file "${name}" for user ${username}`);
    res.status(201).json({ message: 'File saved successfully.' });
});

app.delete('/api/files/:type/:name', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const { type, name } = req.params;
    const user = await kv.get<UserData>(username);

    if (type !== 'documents' && type !== 'images') {
        return res.status(400).json({ message: 'Invalid file type.' });
    }
    if (!user!.files[type] || !user!.files[type][name]) {
        return res.status(404).json({ message: 'File not found.' });
    }
    delete user!.files[type][name];
    await kv.set(username, user);
    
    console.log(`Deleted file "${name}" for user ${username}`);
    res.status(200).json({ message: 'File deleted successfully.' });
});

// --- Session Routes ---

app.get('/api/sessions', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const user = await kv.get<UserData>(username);
    res.json(user!.sessions);
});

app.post('/api/sessions', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const sessionState = req.body;
    const sessionId = `session_${Date.now()}`;
    
    const user = await kv.get<UserData>(username);
    user!.sessions[sessionId] = sessionState;
    await kv.set(username, user);

    console.log(`Saved session ${sessionId} for user ${username}`);
    res.status(201).json({ message: 'Session saved successfully.' });
});

app.get('/api/sessions/:id', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const { id } = req.params;

    const user = await kv.get<UserData>(username);
    const session = user!.sessions[id];
    if (!session) {
        return res.status(404).json({ message: 'Session not found.' });
    }
    res.json(session);
});

app.delete('/api/sessions/:id', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const { id } = req.params;

    const user = await kv.get<UserData>(username);
    if (!user!.sessions[id]) {
        return res.status(404).json({ message: 'Session not found.' });
    }
    delete user!.sessions[id];
    await kv.set(username, user);
    
    console.log(`Deleted session ${id} for user ${username}`);
    res.status(200).json({ message: 'Session deleted successfully.' });
});

// --- Storage Route ---

app.get('/api/storage', async (req: ExpressRequest, res: ExpressResponse) => {
    const { username } = (req as any);
    const user = await kv.get<UserData>(username);
    
    // This is an approximation of storage size.
    const userStorageString = JSON.stringify({
        files: user!.files,
        sessions: user!.sessions
    });
    const sizeInBytes = new Blob([userStorageString]).size;
    res.json({ used: sizeInBytes });
});

// --- AI Routes (Secure Backend) ---
const checkAiService = (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    if (!ai) {
        return res.status(503).json({ message: `AI service is unavailable. Server-side error: ${aiInitializationError}` });
    }
    next();
};

app.post('/api/ai/chat', checkAiService, async (req: ExpressRequest, res: ExpressResponse) => {
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

app.post('/api/ai/generate-image', checkAiService, async (req: ExpressRequest, res: ExpressResponse) => {
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

app.post('/api/ai/google-search', checkAiService, async (req: ExpressRequest, res: ExpressResponse) => {
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

// Export the app for Vercel
export default app;
