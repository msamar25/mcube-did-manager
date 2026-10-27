# Dev harness: run the real backend without Google, MCube or Brevo

**Development only.** It never reads production credentials and never contacts Google, MCube or Brevo.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
python tools/dev-harness/run_dev.py            # backend :5301, fake MCube :5302
cd frontend-next && npm run dev:live           # UI against it
```

**Sign-in:**
- Logins: `admin@dev.local` / PIN `2468`, `operator@dev.local` / PIN `1357`.
- The one-time code is printed in the console and written to `tools/dev-harness/.last_otp` (git-ignored).

**What is real and what is fake:**
- **Real:** all of `backend/`, including auth, FIFO, the queue, verification, the journal and the scheduler.
- **Fake:**
  - `fake_gspread.py`: an in-memory spreadsheet that mimics gspread.
  - `fake_mcube.py`: an in-memory MCube with `get-did-list`, `get-onetoone-did`, the config login, employees and inbound calls.
- **Data:** everything in `run_dev.py` is synthetic (made-up names and numbers; the real operator names are used). It resets on every restart.

**Failure drills:**
- `POST http://127.0.0.1:5302/_control` with `{"fail":"activate"}` makes MCube reject the next activation.
- `{"fail":"deactivate-error"}` simulates an uncertain outage (HTTP 500).
- `{"call":{"callto":"<agent number>"}}` adds an inbound cancelled call, which "Sync calls" turns into a request.

**Login throttling:** the backend allows 5 login attempts per 15 minutes per email. Restart the harness to reset it.
