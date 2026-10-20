# v19 — MCube config portal login

- Admin-only Settings panel saves username/password encrypted using Fernet in Google Sheets tab `MCube_Config_Credentials`.
- Render variable `MCUBE_CREDENTIAL_ENCRYPTION_KEY` is required. Generate it with:
  `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- Never put the encryption key in Google Sheets or GitHub. Back it up securely; changing it prevents decrypting saved credentials.
- Each `/filter-inbound` page and `/emp-filter` call obtains a new login token from `https://config.mcube.com/Restmcube-api/login`.
- Existing `api.mcube.com` bearer authorization is unchanged.
- The login request matches the supplied curl's JSON-text body with form-urlencoded content-type. MCube's actual login response schema has not been supplied: token parser accepts `token`, `access_token`, `auth_token`, `jwt`, `Authorization`, `authorization` at root or under `data`, `result`, `user`, `response`. If MCube uses a different field, Test login reports an unrecognized token without logging secrets.
- Credentials are saved only after read-back verification; Test login is separate and required before relying on call-log/employee sync.
- MCube password is never returned to frontend, nor included in the settings audit log.
- Existing `MCUBE_CONFIG_TOKEN` is no longer used by call-log or employee endpoints.
- Encryption at rest is not equivalent to a managed secret vault; the Render encryption key is critical.
