# StyleSeat Guardian — Deployment Guide (Mac)

This guide walks you through deploying Guardian so that anyone on the internet can access it. The frontend (what users see) is hosted free on GitHub Pages. The backend (the server) runs on your Mac and is exposed to the internet through a secure Cloudflare Tunnel.

**No prior experience required.** Every step is explained in detail.

---

## Table of Contents

1. [What You Need Before Starting](#1-what-you-need-before-starting)
2. [Install Homebrew](#2-install-homebrew)
3. [Install Required Software](#3-install-required-software)
4. [Clone the Project](#4-clone-the-project)
5. [Set Up the Backend](#5-set-up-the-backend)
6. [Start the Backend Server](#6-start-the-backend-server)
7. [Create a Cloudflare Account and Add a Domain](#7-create-a-cloudflare-account-and-add-a-domain)
8. [Set Up the Cloudflare Tunnel](#8-set-up-the-cloudflare-tunnel)
9. [Update the Frontend Configuration](#9-update-the-frontend-configuration)
10. [Enable GitHub Pages](#10-enable-github-pages)
11. [Push Your Changes to GitHub](#11-push-your-changes-to-github)
12. [Verify Everything Works](#12-verify-everything-works)
13. [Keep the Server Running After Closing Terminal](#13-keep-the-server-running-after-closing-terminal)
14. [Day-to-Day Operations](#14-day-to-day-operations)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. What You Need Before Starting

Before you begin, make sure you have the following:

- **A Mac computer** that will stay on and connected to the internet (this is your server)
- **A GitHub account** with access to the `styleseat/guardian` repository
- **A domain name** you own (e.g. `yourdomain.com`). If you don't have one, you can buy one from [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/), [Namecheap](https://www.namecheap.com/), or [Google Domains](https://domains.google/). Cost is typically $10-15/year.
- **A Cloudflare account** (free — you will create one in Step 7)

**Time needed:** About 30-45 minutes for the first-time setup.

---

## 2. Install Homebrew

Homebrew is a package manager for Mac. It lets you install software from the command line.

### 2.1 Open Terminal

1. Press **Cmd + Space** to open Spotlight Search
2. Type **Terminal** and press **Enter**
3. A window with a command prompt appears — this is where you will type commands

### 2.2 Check if Homebrew is already installed

Type this command and press **Enter**:

```bash
brew --version
```

- If you see a version number like `Homebrew 4.x.x`, Homebrew is already installed. **Skip to Step 3.**
- If you see `command not found: brew`, continue below.

### 2.3 Install Homebrew

Copy and paste this entire line into Terminal and press **Enter**:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

What happens:
- It will ask for your Mac password (the one you use to log in). **When you type your password, no characters will appear on screen** — this is normal. Type it and press Enter.
- It may ask you to press **Enter** again to confirm.
- Installation takes a few minutes. Wait until you see the command prompt (`$` or `%`) again.

If it tells you to run additional commands to add Homebrew to your PATH (common on Apple Silicon Macs), **copy and run those commands exactly as shown**. They usually look like:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 2.4 Verify Homebrew works

```bash
brew --version
```

You should see `Homebrew 4.x.x`. If you do, you're good.

---

## 3. Install Required Software

You need four tools: Python, Node.js, Git, and the Cloudflare Tunnel client.

### 3.1 Install everything at once

Copy and paste this into Terminal:

```bash
brew install python@3.13 node git cloudflare/cloudflare/cloudflared
```

This installs:
- **Python** — runs the backend server
- **Node.js** — builds the frontend
- **Git** — downloads and manages the code
- **cloudflared** — creates the secure tunnel to the internet

Wait for it to finish (may take a few minutes).

### 3.2 Verify each tool is installed

Run these commands one at a time:

```bash
python3 --version
```
Expected: `Python 3.13.x` (or similar)

```bash
node --version
```
Expected: `v20.x.x` or `v22.x.x` (any recent version is fine)

```bash
git --version
```
Expected: `git version 2.x.x`

```bash
cloudflared --version
```
Expected: `cloudflared version 2024.x.x` (or similar)

If any of these fail, try closing Terminal and opening a new one, then try again.

---

## 4. Clone the Project

"Cloning" means downloading the project code from GitHub to your Mac.

### 4.1 Choose where to put the project

We'll put it in your home folder. Run:

```bash
cd ~
```

This takes you to your home directory (e.g. `/Users/yourname`).

### 4.2 Clone the repository

```bash
git clone https://github.com/styleseat/guardian.git
```

If it asks for a username and password:
- **Username:** your GitHub username
- **Password:** a [Personal Access Token](https://github.com/settings/tokens) (not your GitHub password). Create one with `repo` scope.

When it finishes, you'll have a `guardian` folder. Verify:

```bash
ls guardian
```

You should see folders like `backend`, `frontend`, `.github`, etc.

### 4.3 Go into the project folder

```bash
cd ~/guardian
```

---

## 5. Set Up the Backend

### 5.1 Go into the backend folder

```bash
cd ~/guardian/backend
```

### 5.2 Create a Python virtual environment

A "virtual environment" is an isolated space for the project's dependencies so they don't interfere with your system.

```bash
python3 -m venv venv
```

This creates a `venv` folder inside `backend/`. It takes a few seconds.

### 5.3 Activate the virtual environment

```bash
source venv/bin/activate
```

Your terminal prompt should now show `(venv)` at the beginning, like:
```
(venv) yourname@Mac backend %
```

**Important:** You need to run this `source venv/bin/activate` command every time you open a new Terminal window and want to work with the backend.

### 5.4 Install Python dependencies

```bash
pip install -r requirements.txt
```

This downloads and installs all the Python libraries the backend needs. It may take a minute or two. You'll see a lot of output — that's normal. Wait until you see the `(venv)` prompt again.

### 5.5 Create the configuration file

```bash
cp .env.example .env
```

This creates a `.env` file from the template. Now edit it:

```bash
open -e .env
```

This opens the file in TextEdit. Find this line near the bottom:

```
ALLOWED_EMAIL_DOMAIN=*
```

- **Leave it as `*`** if you want anyone to be able to create an account with any email address.
- **Change it to `styleseat.com`** if you want only `@styleseat.com` email addresses to be allowed.

Save the file (**Cmd + S**) and close TextEdit.

### 5.6 Seed the database

"Seeding" creates the initial database with a demo user account:

```bash
python seed.py
```

You should see output like:
```
Demo user created: demo / Demo1234
Project 'Automation Overview' created.
```

---

## 6. Start the Backend Server

Make sure you're still in the backend folder with the virtual environment active:

```bash
cd ~/guardian/backend
source venv/bin/activate
python run.py
```

You should see output like:
```
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5001
 * Running on http://192.168.x.x:5001
```

**The server is now running.** Leave this Terminal window open — closing it stops the server. (Step 13 shows how to keep it running permanently.)

### 6.1 Test that the server works

Open a **new Terminal tab** (press **Cmd + T**) and run:

```bash
curl http://localhost:5001/api/projects
```

You should see a JSON response like `[{"id": 1, "name": "Automation Overview", ...}]`. This confirms the backend is working.

---

## 7. Create a Cloudflare Account and Add a Domain

Cloudflare creates a secure tunnel so people on the internet can reach your backend server without you needing to configure your router or get a static IP.

### 7.1 Create a Cloudflare account

1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Enter your email and a password
3. Click **Create Account**

### 7.2 Add your domain to Cloudflare

1. After signing up, click **"Add a site"**
2. Enter your domain name (e.g. `yourdomain.com`) and click **Add site**
3. Select the **Free** plan and click **Continue**
4. Cloudflare will scan your DNS records. Click **Continue**
5. Cloudflare will give you two **nameservers** (e.g. `anna.ns.cloudflare.com` and `bob.ns.cloudflare.com`)

### 7.3 Update your domain's nameservers

Go to wherever you bought your domain (Namecheap, Google Domains, etc.) and change the nameservers to the two Cloudflare nameservers.

**How to do this varies by registrar:**
- **Namecheap:** Domain List > your domain > Nameservers > Custom DNS > paste the two Cloudflare nameservers
- **Google Domains:** DNS > Custom name servers > paste them
- **Others:** Look for "DNS" or "Nameservers" in your domain settings

**After updating nameservers:** Go back to the Cloudflare dashboard and click **"Done, check nameservers"**. It can take up to 24 hours for the change to propagate, but it's usually done within 5-30 minutes. Cloudflare will email you when it's active.

**If your domain is already on Cloudflare:** Skip to Step 8.

---

## 8. Set Up the Cloudflare Tunnel

This step creates a secure tunnel from the internet to your Mac.

### 8.1 Log in to Cloudflare from Terminal

In the **second Terminal tab** (not the one running the server), run:

```bash
cloudflared tunnel login
```

This opens your web browser. Select the domain you added to Cloudflare and click **Authorize**. You'll see a success message in the browser.

Back in Terminal, you should see:
```
You have successfully logged in.
```

### 8.2 Create the tunnel

```bash
cloudflared tunnel create guardian-api
```

You'll see output like:
```
Tunnel credentials written to /Users/yourname/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json.
Created tunnel guardian-api with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 8.3 Create a DNS record for the tunnel

This tells Cloudflare to route `guardian-api.yourdomain.com` to your tunnel:

```bash
cloudflared tunnel route dns guardian-api guardian-api.yourdomain.com
```

**Replace `yourdomain.com` with your actual domain name.**

You should see:
```
Added CNAME guardian-api.yourdomain.com which will route to this tunnel
```

### 8.4 Start the tunnel

```bash
cloudflared tunnel --url http://localhost:5001 run guardian-api
```

You'll see output with `Connection registered` messages. This means the tunnel is active.

**Leave this Terminal window open.** (Step 13 shows how to keep it running permanently.)

### 8.5 Test the tunnel

Open a **third Terminal tab** (Cmd + T) and run:

```bash
curl https://guardian-api.yourdomain.com/api/projects
```

**Replace `yourdomain.com` with your actual domain.**

You should see the same JSON response as before. If you do, the tunnel is working and your backend is accessible from the internet.

---

## 9. Update the Frontend Configuration

Now you need to tell the frontend where the backend is.

### 9.1 Edit the production environment file

```bash
open -e ~/guardian/frontend/.env.production
```

Change the contents to:

```
VITE_API_URL=https://guardian-api.yourdomain.com/api
```

**Replace `yourdomain.com` with your actual domain.**

Save (**Cmd + S**) and close TextEdit.

---

## 10. Enable GitHub Pages

GitHub Pages is a free hosting service for static websites. You need to turn it on.

1. Open your browser and go to:
   ```
   https://github.com/styleseat/guardian/settings/pages
   ```
2. Under **"Build and deployment"**, find the **Source** dropdown
3. Change it from "Deploy from a branch" to **"GitHub Actions"**
4. The page saves automatically — you're done here

---

## 11. Push Your Changes to GitHub

Pushing sends your changes to GitHub, which triggers an automatic build and deployment of the frontend.

### 11.1 Configure Git (first time only)

If you've never used Git on this Mac, set your name and email:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 11.2 Stage and commit your changes

```bash
cd ~/guardian
git add -A
git commit -m "Configure deployment for GitHub Pages and Cloudflare Tunnel"
```

### 11.3 Push to GitHub

```bash
git push origin master
```

If asked for credentials, use your GitHub username and Personal Access Token (see Step 4.2).

### 11.4 Watch the deployment

1. Go to [https://github.com/styleseat/guardian/actions](https://github.com/styleseat/guardian/actions)
2. You should see a workflow called **"Deploy Frontend to GitHub Pages"** running (yellow circle)
3. Wait for it to turn into a **green checkmark** (usually 1-2 minutes)
4. If it shows a **red X**, click on it to see what went wrong (see Troubleshooting)

---

## 12. Verify Everything Works

### 12.1 Open the application

Open your browser and go to:

```
https://styleseat.github.io/guardian/
```

You should see the Guardian login page.

### 12.2 Log in with the demo account

- **Username:** `demo`
- **Password:** `Demo1234`

Click **Login**. You should see the dashboard with projects and data.

### 12.3 Test registration (as a new user would)

1. Log out (click your avatar in the sidebar, then Logout)
2. Click **Register**
3. Enter a username, any email address, and a password (at least 8 characters, with uppercase, lowercase, and a number)
4. Click **Register**
5. You should be logged in and see the dashboard

If all of this works, your deployment is complete.

---

## 13. Keep the Server Running After Closing Terminal

Right now, closing the Terminal windows stops both the backend server and the Cloudflare Tunnel. To keep them running permanently, use `tmux` — a tool that keeps terminal sessions alive in the background.

### 13.1 Install tmux

```bash
brew install tmux
```

### 13.2 Stop the currently running server and tunnel

Go to each Terminal tab running the server and tunnel, and press **Ctrl + C** to stop them.

### 13.3 Start the backend in a tmux session

```bash
tmux new-session -d -s backend "cd ~/guardian/backend && source venv/bin/activate && python run.py"
```

This starts the backend in the background. You won't see any output — that's normal.

### 13.4 Start the tunnel in a tmux session

```bash
tmux new-session -d -s tunnel "cloudflared tunnel --url http://localhost:5001 run guardian-api"
```

### 13.5 Verify both are running

```bash
tmux list-sessions
```

You should see:
```
backend: ...
tunnel: ...
```

Both processes are now running in the background. You can close Terminal entirely and they will keep running.

### 13.6 Useful tmux commands

| What you want to do | Command |
|---|---|
| See backend logs | `tmux attach -t backend` |
| See tunnel logs | `tmux attach -t tunnel` |
| Detach from a session (return to normal Terminal) | Press **Ctrl + B**, then press **D** |
| Stop the backend | `tmux kill-session -t backend` |
| Stop the tunnel | `tmux kill-session -t tunnel` |
| Restart everything | Run steps 13.3 and 13.4 again |

---

## 14. Day-to-Day Operations

### Starting the server after a Mac restart

After restarting your Mac, the server and tunnel stop. To start them again:

```bash
tmux new-session -d -s backend "cd ~/guardian/backend && source venv/bin/activate && python run.py"
tmux new-session -d -s tunnel "cloudflared tunnel --url http://localhost:5001 run guardian-api"
```

**Tip:** You can add these commands to a script so you only need to run one command. Create a file:

```bash
cat > ~/start-guardian.sh << 'EOF'
#!/bin/bash
tmux kill-session -t backend 2>/dev/null
tmux kill-session -t tunnel 2>/dev/null
tmux new-session -d -s backend "cd ~/guardian/backend && source venv/bin/activate && python run.py"
tmux new-session -d -s tunnel "cloudflared tunnel --url http://localhost:5001 run guardian-api"
echo "Guardian is running. Check with: tmux list-sessions"
EOF
chmod +x ~/start-guardian.sh
```

Then, any time you restart your Mac, just run:

```bash
~/start-guardian.sh
```

### Updating the application

When new code is pushed to GitHub:

```bash
cd ~/guardian
git pull origin master
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

Then restart the backend:

```bash
tmux kill-session -t backend
tmux new-session -d -s backend "cd ~/guardian/backend && source venv/bin/activate && python run.py"
```

The frontend updates automatically via GitHub Actions — no action needed.

### Resetting the database

If you want to start fresh (this deletes all data):

```bash
tmux kill-session -t backend
cd ~/guardian/backend
source venv/bin/activate
rm -f app.db
python seed.py
tmux new-session -d -s backend "cd ~/guardian/backend && source venv/bin/activate && python run.py"
```

---

## 15. Troubleshooting

### "command not found: brew"

Close Terminal and open a new one. If it still doesn't work, run:

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

If that fixes it, make it permanent:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
```

### "command not found: python3"

Try:

```bash
brew install python@3.13
```

### Backend won't start — "Address already in use"

Something else is using port 5001. Kill it:

```bash
lsof -ti:5001 | xargs kill -9
```

Then start the backend again.

### GitHub Actions workflow fails

1. Go to [https://github.com/styleseat/guardian/actions](https://github.com/styleseat/guardian/actions)
2. Click on the failed run (red X)
3. Click on the **"build"** job to see the logs
4. Common issues:
   - **"package-lock.json not found"**: Run `cd ~/guardian/frontend && npm install` locally, then commit and push the generated `package-lock.json`
   - **Permission errors**: Make sure GitHub Pages is set to "GitHub Actions" in repo settings (Step 10)

### "CORS error" in the browser console

This means the backend isn't allowing requests from GitHub Pages. Check that `backend/app/__init__.py` includes `https://styleseat.github.io` in the CORS origins list. If you changed the frontend URL, update accordingly.

### Tunnel not working — "connection refused"

Make sure the backend server is running:

```bash
tmux attach -t backend
```

If you see errors or the session doesn't exist, start it again (Step 13.3).

### "Unable to create account" when registering

Check the `ALLOWED_EMAIL_DOMAIN` setting in `backend/.env`:
- Set to `*` to allow any email
- Set to `styleseat.com` to restrict to that domain

After changing the `.env` file, restart the backend:

```bash
tmux kill-session -t backend
tmux new-session -d -s backend "cd ~/guardian/backend && source venv/bin/activate && python run.py"
```

### Users can't reach the site at all

1. Check that the Mac is on and not asleep (System Settings > Energy > Prevent automatic sleeping when the display is off)
2. Check that both tmux sessions are running: `tmux list-sessions`
3. Check that the tunnel is healthy: `tmux attach -t tunnel` and look for `Connection registered` messages

### Mac goes to sleep and server becomes unreachable

Prevent sleep when the lid is closed (requires power adapter):

1. Open **System Settings**
2. Go to **Energy** (or **Battery** > **Options** on laptops)
3. Turn on **"Prevent automatic sleeping when the display is off"**

On laptops, the Mac must be plugged into power for this to work.

---

## Quick Reference Card

| Item | Value |
|---|---|
| Frontend URL | `https://styleseat.github.io/guardian/` |
| Backend URL | `https://guardian-api.yourdomain.com` |
| Demo login | `demo` / `Demo1234` |
| Open registration | `ALLOWED_EMAIL_DOMAIN=*` in `backend/.env` |
| Start server | `~/start-guardian.sh` |
| Check server status | `tmux list-sessions` |
| View backend logs | `tmux attach -t backend` |
| View tunnel logs | `tmux attach -t tunnel` |
| Detach from logs | **Ctrl + B**, then **D** |
| Stop everything | `tmux kill-session -t backend && tmux kill-session -t tunnel` |
