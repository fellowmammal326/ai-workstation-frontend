// Fix: Explicitly import Request, Response, and NextFunction from express to avoid type conflicts with global types.
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { kv } from '@vercel/kv';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for large session data

const defaultDb = {
    files: { documents: {}, images: {} },
    sessions: {},
};

// Signup Endpoint
// Fix: Use imported Request and Response types for correct typing.
app.post('/signup', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const existingUser = await kv.get(username);
        if (existingUser) {
            return res.status(409).json({ message: 'Username already exists.' });
        }

        const newUser = {
            password, // In a production app, this should be securely hashed.
            db: defaultDb,
        };
        await kv.set(username, newUser);

        res.status(201).json({ message: 'User created successfully.' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// Login Endpoint
// Fix: Use imported Request and Response types for correct typing.
app.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const user = await kv.get(username) as any;
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        res.status(200).json({ message: 'Login successful.', data: user.db });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// Middleware for authenticating data requests
// Fix: Use imported Request, Response, and NextFunction types for correct typing.
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const username = req.headers['x-username'] as string;
    if (!username) {
        return res.status(401).json({ message: 'Unauthorized: Missing X-Username header.' });
    }
    // Attach username to the request object for use in handlers
    (req as any).username = username;
    next();
};

// Endpoint to save/update user data
// Fix: Use imported Request and Response types for correct typing.
app.post('/data', authMiddleware, async (req: Request, res: Response) => {
    const username = (req as any).username;
    const newDb = req.body;

    if (!newDb || !newDb.files || !newDb.sessions) {
        return res.status(400).json({ message: 'Invalid data format provided.' });
    }

    try {
        const user = await kv.get(username) as any;
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        user.db = newDb;
        await kv.set(username, user);
        
        res.status(200).json({ message: 'Data saved successfully.' });
    } catch (error) {
        console.error('Save Data Error:', error);
        res.status(500).json({ message: 'An internal server error occurred while saving data.' });
    }
});

// Export the Express app for Vercel
export default app;
