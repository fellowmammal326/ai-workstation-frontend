// FIX: Import Request, Response, and NextFunction types from express to ensure correct type checking.
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Initialize the Express application
const app = express();
const port = process.env.PORT || 3000; // Use environment variable for port, default to 3000

// === Middleware ===

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Enable the express.json middleware to parse incoming JSON payloads
// Increase the limit to 10MB to allow for larger image/session saves.
app.use(express.json({ limit: '10mb' }));


// === In-Memory "Database" ===

// This is a temporary placeholder for a real database.
// Data stored here will be LOST every time the server restarts.
// The next step is to replace this with a connection to a real database.
const userData: {
    [username: string]: {
        password: string;
        files: {
            documents: { [name: string]: { content: string, modified: number } };
            images: { [name: string]: { content: string, modified: number } };
        };
        sessions: { [id: string]: any };
    }
} = {};

// === Middleware to get user from header (INSECURE DEMO) ===
// In a real app, you would use JWTs or a proper session middleware.
// This is a simple, insecure way to identify the user for the demo.
// FIX: Use the imported Request, Response, and NextFunction types for the middleware parameters.
const getUser = (req: Request, res: Response, next: NextFunction) => {
    // Allow signup and login routes to pass through without the header
    if (req.path === '/api/signup' || req.path === '/api/login') {
        return next();
    }
    
    const username = req.headers['x-username'] as string;
    if (!username || !userData[username]) {
        return res.status(401).json({ message: 'Unauthorized: User not found or not provided in X-Username header.' });
    }
    // Attach user to the request object for later use
    (req as any).user = { username };
    next();
};
app.use(getUser);


// === API Routes ===

// --- Auth Routes ---

// FIX: Add explicit types for request and response objects in route handlers.
app.post('/api/signup', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  if (userData[username]) {
    return res.status(409).json({ message: 'Username is already taken.' });
  }
  // Initialize the full data structure for the new user
  userData[username] = {
    password, // IMPORTANT: In a real app, you MUST HASH AND SALT this password!
    files: { documents: {}, images: {} },
    sessions: {}
  };
  console.log(`User created: ${username}`);
  res.status(201).json({ message: 'User created successfully!' });
});

// FIX: Add explicit types for request and response objects in route handlers.
app.post('/api/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    const user = userData[username];
    // IMPORTANT: In a real app, you would compare a hashed password here!
    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Invalid username or password.' });
    }
    console.log(`User logged in: ${username}`);
    res.status(200).json({ message: 'Login successful.' });
});

// --- File Routes ---

// FIX: Add explicit types for request and response objects in route handlers.
app.get('/api/files', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    res.json(userData[username].files);
});

// FIX: Add explicit types for request and response objects in route handlers.
app.post('/api/files', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    const { type, name, content } = req.body as { type: 'documents' | 'images', name: string, content: string };
    if (!['documents', 'images'].includes(type) || !name || content === undefined) {
        return res.status(400).json({ message: 'Invalid file data provided.' });
    }
    userData[username].files[type][name] = { content, modified: Date.now() };
    console.log(`Saved file "${name}" for user ${username}`);
    res.status(201).json({ message: 'File saved successfully.' });
});

// FIX: Add explicit types for request and response objects in route handlers.
app.delete('/api/files/:type/:name', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    const { type, name } = req.params;
    if (type !== 'documents' && type !== 'images') {
        return res.status(400).json({ message: 'Invalid file type.' });
    }
    if (!userData[username].files[type] || !userData[username].files[type][name]) {
        return res.status(404).json({ message: 'File not found.' });
    }
    delete userData[username].files[type][name];
    console.log(`Deleted file "${name}" for user ${username}`);
    res.status(200).json({ message: 'File deleted successfully.' });
});

// --- Session Routes ---

// FIX: Add explicit types for request and response objects in route handlers.
app.get('/api/sessions', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    res.json(userData[username].sessions);
});

// FIX: Add explicit types for request and response objects in route handlers.
app.post('/api/sessions', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    const sessionState = req.body;
    const sessionId = `session_${Date.now()}`;
    userData[username].sessions[sessionId] = sessionState;
    console.log(`Saved session ${sessionId} for user ${username}`);
    res.status(201).json({ message: 'Session saved successfully.' });
});

// FIX: Add explicit types for request and response objects in route handlers.
app.get('/api/sessions/:id', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    const { id } = req.params;
    const session = userData[username].sessions[id];
    if (!session) {
        return res.status(404).json({ message: 'Session not found.' });
    }
    res.json(session);
});

// FIX: Add explicit types for request and response objects in route handlers.
app.delete('/api/sessions/:id', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    const { id } = req.params;
    if (!userData[username].sessions[id]) {
        return res.status(404).json({ message: 'Session not found.' });
    }
    delete userData[username].sessions[id];
    console.log(`Deleted session ${id} for user ${username}`);
    res.status(200).json({ message: 'Session deleted successfully.' });
});

// --- Storage Route ---

// FIX: Add explicit types for request and response objects in route handlers.
app.get('/api/storage', (req: Request, res: Response) => {
    const { username } = (req as any).user;
    // This is an approximation of storage size.
    const userStorageString = JSON.stringify({
        files: userData[username].files,
        sessions: userData[username].sessions
    });
    const sizeInBytes = new Blob([userStorageString]).size;
    res.json({ used: sizeInBytes });
});


// === Start the server ===
app.listen(port, () => {
  console.log(`Backend server is running at http://localhost:${port}`);
});
