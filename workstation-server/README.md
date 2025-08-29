# AI Workstation - Local Backend Server

This is the backend server for the AI Workstation application. It's built with Node.js and Express and is designed to run locally on your machine.

**IMPORTANT:** This server uses **in-memory storage**. This means any user accounts, saved files, or sessions will be **lost** when the server is stopped or restarted.

## Local Development

### Prerequisites

*   You have [Node.js](https://nodejs.org/) and npm installed.

### Step 1: Set Your Gemini API Key

The server needs a Gemini API key to function.

1.  Create a new file named `.env` inside this `workstation-server` directory.
2.  Add the following line to the `.env` file, replacing `YOUR_API_KEY` with your actual key:
    ```
    API_KEY=YOUR_API_KEY
    ```

### Step 2: Install Dependencies

Navigate to this directory in your terminal and run:

```bash
npm install
```

### Step 3: Run the Server

To start the server in development mode (with automatic reloading on changes), run:

```bash
npm start
```

The server will be running on `http://localhost:10000`. The frontend application is already configured to connect to this address.
