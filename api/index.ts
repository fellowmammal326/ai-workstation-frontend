// Fix: Use type aliases for express Request and Response to avoid conflicts with global types.
import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import cors from 'cors';
import { kv } from '@vercel/kv';

const app = express();

// --- Configuration Check Middleware ---
// This runs before every request to ensure the database is configured.
const checkDbConnection = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    if (!process.env.KV_URL) {
        console.error("Vercel KV environment variables not found.");
        // 503 Service Unavailable is a more appropriate status code here.
        return res.status(503).json({ 
            message: 'Database not configured. Please link a Vercel KV store to this project in your Vercel dashboard and redeploy.' 
        });
    }
    // If everything is okay, proceed to the actual route handler.
    next();
};

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for large session data
// Apply the DB connection check to all routes.
app.use(checkDbConnection);


const defaultDb = {
    files: { documents: {}, images: {} },
    sessions: {},
};

// Signup Endpoint
// Fix: Use Request and Response types from express.
app.post('/signup', async (req: ExpressRequest, res: ExpressResponse) => {
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
// Fix: Use Request and Response types from express.
app.post('/login', async (req: ExpressRequest, res: ExpressResponse) => {
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
// Fix: Use Request, Response, and NextFunction types from express.
const authMiddleware = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const username = req.headers['x-username'] as string;
    if (!username) {
        return res.status(401).json({ message: 'Unauthorized: Missing X-Username header.' });
    }
    // Attach username to the request object for use in handlers
    (req as any).username = username;
    next();
};

// Endpoint to save/update user data
// Fix: Use Request and Response types from express.
app.post('/data', authMiddleware, async (req: ExpressRequest, res: ExpressResponse) => {
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
