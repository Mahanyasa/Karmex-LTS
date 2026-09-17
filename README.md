# Daily Planner (MERN)

Login-based to-do planner. Tasks reset/roll over daily at 9:00 AM, you can
dictate tasks by voice (Web Speech API), and a local rule-based organizer
sorts your day by mentioned time and priority — no external AI call.

## Structure

```
todo-mern/
  backend/     Express + Mongoose API, JWT auth, node-cron 9am reset
  frontend/    React app, login/register, dashboard, mic dictation
```

## How "listening" works

The **browser's built-in Web Speech API** does the listening (mic access,
speech-to-text) — this runs client-side in Chrome/Edge. The resulting text
is sent to the backend, which splits it into tasks and organizes them with
local heuristics (detects times like "at 5pm", durations like "for 30
minutes", and urgency words like "urgent"/"asap").

---

## 0. Google Cloud setup (for phone reminders)

"Google Reminders" as a standalone API no longer exists — the reliable way
to get a task to ping your phone is a **Google Calendar event with a popup
notification**, created via the official Calendar API through OAuth. This
app never touches your Gmail password; you authorize it like any other app
that uses "Sign in with Google."

1. Go to https://console.cloud.google.com → create a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → set up as "External" (or
   "Internal" if using Google Workspace), add your Gmail as a test user
   while the app is unverified.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → type: Web application.
   - Authorized redirect URI: `http://localhost:5000/api/google/callback`
     (or `https://yourdomain.com/api/google/callback` in production)
5. Copy the generated Client ID and Client Secret into `backend/.env`:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
6. On your phone, make sure the **Google Calendar app** is installed and
   notifications are enabled for it — that's what delivers the push.

In the app: click **"Connect Google reminders"** on the dashboard, sign in
and approve access, and you're redirected back connected. From then on,
every task you add (manually or by dictation) that has a time creates a
Calendar event with a reminder; tasks without a spoken time default to a
reminder 10 minutes out.

## 1. MongoDB Atlas setup

1. Create a free cluster at https://cloud.mongodb.com
2. Database Access → add a user with a password.
3. Network Access → add your AWS EC2 instance's public IP (or 0.0.0.0/0
   while testing, then lock it down).
4. Get your connection string (Connect → Drivers) — looks like:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/tododb`

## 2. Backend setup (on your AWS server)

```bash
cd backend
cp .env.example .env
# edit .env: set MONGO_URI (Atlas string above), JWT_SECRET (random string),
# CLIENT_ORIGIN (your frontend's public URL), RESET_TZ (e.g. Asia/Kolkata)

npm install
npm start          # or: pm2 start ecosystem.config.js
```

Generate a strong JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Keep it running persistently with PM2:
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup     # follow the printed command to enable on reboot
```

Open the port in your EC2 Security Group (inbound rule for PORT, default
5000), or put Nginx in front of it as a reverse proxy on 80/443.

## 3. Frontend setup

```bash
cd frontend
cp .env.example .env
# edit .env: set REACT_APP_API_URL to http://<your-server>:5000/api
# (or https://yourdomain.com/api if behind Nginx + SSL)

npm install
npm run build
```

Serve the `build/` folder with Nginx, or any static host (S3 + CloudFront,
Vercel, Netlify). Voice dictation (Web Speech API) requires HTTPS in
production — plan for an SSL cert (e.g. via Let's Encrypt + Nginx, or
CloudFront) before relying on the mic button on your real domain.

## 4. Test it

- Visit the frontend URL → Sign up → you're logged in with a JWT stored
  in localStorage.
- Click "Start dictation", say something like: *"Call mom at 5pm, then
  finish report urgent for 1 hour, and buy groceries"* → Stop → "Add &
  organize".
- Tasks appear sorted: timed tasks first (by time), then by priority.
- The 9:00 AM cron job (`backend/cron/dailyReset.js`) runs daily in the
  `RESET_TZ` timezone and rolls incomplete tasks into the new day's
  bucket; completed tasks stay archived under their original date.

## Notes on the "AI organize" step

Per your choice, there's no external AI API call — `backend/utils/organizer.js`
does everything locally with regex/keyword rules (time extraction,
duration extraction, priority keywords, then sorting). It's fast, free,
and has no third-party dependency or ToS risk. If you ever want to swap
in a real AI call later, that file is the single place to change —
replace `organizeTasks`/`parseDictation` with an API request and keep the
same return shape.
