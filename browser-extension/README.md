# Karmex LTS Autofill Extension

This unpacked Manifest V3 extension fills login forms from the client-encrypted Karmex LTS vault.

## Install in Chrome or Edge

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `browser-extension` folder.
4. Open the extension, select the settings button, and enter the deployed backend API URL, including `/api/v1`.
5. Sign in with the Karmex LTS account password, then unlock the vault with its separate master password.

The extension keeps the auth token and decrypted entries in browser session storage, clears decrypted entries after five minutes, and never stores the master password. Autofill occurs only after the user selects a credential.
