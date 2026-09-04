# AI Assistant Deployment Setup

Each client installation must set a unique `APP_ENCRYPTION_KEY` server environment variable before an administrator saves an AI provider key. Use a cryptographically random 32-byte value encoded as 64 hexadecimal characters, for example:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store the generated value only in the installation's deployment secret store or `.env` file. Never reuse it between client installations, commit it to source control, or share it with an AI provider.

The application uses this key with AES-256-GCM to encrypt the client administrator's Anthropic or OpenAI API key before storing it in the local database. Losing or changing `APP_ENCRYPTION_KEY` makes previously stored AI API keys unrecoverable; the administrator must save the provider key again.