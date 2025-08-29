# AI Workstation - Vercel Backend Server

This is the backend server for the AI Workstation application. It's built with Node.js and Express, and has been re-architected to run as a **serverless function on Vercel**.

It uses **Vercel KV** (a serverless Redis database) for persistent storage of user accounts, files, and sessions. This means your data will be safe and you no longer need to run a local server process.

## Deployment to Vercel

Follow these steps to deploy your backend and connect it to a persistent database.

### Prerequisites

*   You have an account on [Vercel](https://vercel.com).
*   You have [Node.js](https://nodejs.org/) installed locally.
*   You have installed the Vercel CLI: `npm install -g vercel`.

### Step 1: Link Your Project to Vercel

1.  Navigate to the root directory of this project (the one containing `index.html`).
2.  Run the following command to link your local project to a new or existing Vercel project:
    ```bash
    vercel link
    ```
    Follow the prompts from the Vercel CLI.

### Step 2: Create and Link Vercel KV Store

1.  Go to your project's dashboard on the Vercel website.
2.  Navigate to the **Storage** tab.
3.  Click **Create Database** and select **KV (Redis)**. Choose a region and create the database.
4.  Once the KV store is created, click **Connect**. It will show you environment variables. You don't need to copy them manually.
5.  In your local terminal (still in the project root), run the following command to pull the environment variables and link the KV store to your project:
    ```bash
    vercel env pull .env.development.local
    ```
    This creates a local environment file so you can run the app locally with `vercel dev` if you wish.

### Step 3: Set Your Gemini API Key

You need to add your Gemini `API_KEY` as a secret environment variable in Vercel.

Run this command in your terminal:

```bash
vercel env add API_KEY
```

Paste your API key when prompted. This will securely store your key and make it available to the serverless function.

### Step 4: Deploy

You're all set! To deploy your application to production, run:

```bash
vercel --prod
```

Vercel will build both the frontend and the backend, deploy them, and provide you with a live URL. Your user accounts and data will now be stored permanently in your Vercel KV database.
