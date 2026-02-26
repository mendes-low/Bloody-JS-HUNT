# Bloody JS Hunt

A real-time classroom horror game for 10-15 students.

- One player creates the room and becomes the **Bloody JS icon** (the host).
- Other players join from their own laptops as students.
- Students move around a dark map with the **arrow keys**.
- When the host catches a student, that student gets a **random multiple-choice question**.
- If the student answers correctly, the host is weakened for 5 seconds.
- If the student answers incorrectly, the student is eliminated and becomes a spectator.

## Tech stack

This build is intentionally simple so you can run it fast:

- **Node.js** server
- **Express** for serving the website
- **Socket.IO** for multiplayer real-time communication
- **HTML/CSS/JavaScript Canvas** on the frontend

No database is required for the first playable version. Rooms and questions are stored **in memory** while the server is running.

## Project structure

```text
bloody-js-hunt/
├── package.json
├── server.js
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Where to put what

- Put **all files exactly as they are** into one folder named `bloody-js-hunt`.
- `server.js` stays in the project root.
- `public/index.html`, `public/styles.css`, and `public/app.js` must stay inside the `public` folder.
- Do not move the `public` folder, because the server serves it automatically.

## Local launch instructions

### 1. Install Node.js
Install **Node.js 20.9 or newer**.

### 2. Open the project folder
In your terminal:

```bash
cd bloody-js-hunt
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start the website

```bash
npm start
```

### 5. Open it in your browser
Visit:

```text
http://localhost:3000
```

## How to play locally with several laptops

### Option A - same laptop, several browser tabs
Good for a quick test.

1. Open `http://localhost:3000`
2. Create one room as the host.
3. Open more tabs or private windows.
4. Join the room from each tab as a student.

### Option B - several laptops on the same Wi-Fi
Good for classroom testing.

1. Run the server on your laptop.
2. Find your local IP address.
   - Example: `192.168.1.25`
3. Students open this address in their browser:

```text
http://YOUR_LOCAL_IP:3000
```

Example:

```text
http://192.168.1.25:3000
```

Important:
- All laptops must be on the same network.
- Your firewall must allow port `3000`.

## Deploy to the internet

This app is easiest to deploy as **one Node web service**, because the website and Socket.IO server are in the same project.

## Deploy on Render

### 1. Create a GitHub repository
Upload the whole `bloody-js-hunt` folder to GitHub.

### 2. Create a new Web Service on Render
Use these settings:

- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### 3. Set the port
You do not need to hardcode the port. The app already reads `process.env.PORT`.

### 4. Open the deployed URL
Render will give you a public URL. Share that URL with students.

## Gameplay controls

- **Arrow keys**: move
- **WASD**: also works
- **Host**: catch students
- **Student**: answer correctly to weaken the host

## How to customize questions

Open `server.js` and edit the `QUESTIONS` array.

Example:

```js
{
  prompt: 'What does HTML stand for?',
  options: ['HyperText Markup Language', 'HighText Markdown Language', 'Home Tool Markup Language', 'Hyper Transfer Markup Language'],
  answerIndex: 0,
}
```

## How to change the map

Open `server.js` and edit the `OBSTACLES` array.

Each obstacle looks like this:

```js
{ x: 210, y: 120, width: 180, height: 180 }
```

## How to change game rules

Open `server.js` and edit these constants near the top:

- `ROUND_DURATION_MS`
- `QUIZ_DURATION_MS`
- `HOST_DEBUFF_MS`
- `HOST_SPEED`
- `HOST_DEBUFF_SPEED`
- `STUDENT_SPEED`

## Notes

- This version is a **fully playable MVP**.
- Data is not persistent yet. If the server restarts, rooms disappear.
- For a bigger production version, the next upgrades should be:
  - PostgreSQL or Supabase for persistent questions/results
  - admin login
  - custom room settings
  - multiple maps
  - sound files instead of generated oscillator audio
  - anti-cheat improvements
