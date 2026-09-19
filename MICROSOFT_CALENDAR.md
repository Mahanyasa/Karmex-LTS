# Microsoft Calendar setup

Karmex sends new scheduled tasks to the connected user's default Outlook calendar. Changes to task text, date, duration, priority, and completion update the event; task and board deletion attempt to remove events. Completing a task disables its Outlook reminder. Google and Microsoft can both be connected and will both receive new reminders.

## Server configuration

1. In Microsoft Entra admin center, create an app registration. To support both work/school and personal Outlook accounts, choose **Accounts in any organizational directory and personal Microsoft accounts**.
2. Add a **Web** redirect URI matching the backend exactly: `https://YOUR-BACKEND/api/microsoft/callback`. For local development use `http://localhost:3001/api/microsoft/callback`.
3. Add the Microsoft Graph **delegated** permission `Calendars.ReadWrite`. The authorization flow also requests `offline_access` for background token renewal. Organizations may require administrator consent.
4. Create a client secret. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (the secret value), and `MICROSOFT_TENANT_ID=common` in the backend environment. Set `APP_BASE_URL` to the public backend URL or set `MICROSOFT_REDIRECT_URI` explicitly. Never put the secret in frontend environment variables.
5. Run the backend on Node.js 18+ and restart it after setting the environment. Deploy frontend and API on the same site (for example app.example.com and api.example.com) so the HTTP-only OAuth binding cookie works. Production requires HTTPS. Localhost on separate ports works for development.
6. Open **Settings → Connected services → Microsoft Calendar → Connect**, choose an account, and consent.

## Verification

Create a task with a future date/time; confirm the event appears at that exact time in Outlook. Change its title/time, complete it, and delete it. Confirm edits and deletion in Outlook. Test cancellation, disconnect/reconnect, expired access tokens, and a denied organizational consent policy.

Sync is one-way from Karmex to Outlook; existing tasks are not bulk-exported on connection, and Outlook edits are not imported. Editing an existing scheduled task will sync it. Disconnect removes stored tokens but leaves existing Outlook events. Deletion failures produce a message so the user can remove a remaining event manually. Task sync failures are stored with the task; editing it retries synchronization. There is no background retry queue.

OAuth state is short-lived, browser-bound, and consumed once; authorization uses PKCE. Microsoft tokens are excluded from default user queries. Use encrypted database storage and restrict database access, as the server needs refresh tokens to renew calendar access.

References: [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Microsoft Graph calendar events](https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0).
