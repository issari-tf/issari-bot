# SourceMod Plugin Development on Windows — Issari TF2

This guide gets you from "I have a Windows PC" to "I have a working SourceMod
plugin running on my own test server" — and explains how to get your plugin
considered for our community server.

Our server is a **community open server**: anyone is welcome to write plugins,
test them locally, and submit them for review. You do **not** need access to
the production server to develop — everything below runs on your own PC.

## Server info

| | |
|---|---|
| Game | Team Fortress 2 |
| Mode | VSH (Versus Saxton Hale) |
| Connect | `connect 72.60.111.15:27030` or `steam://connect/72.60.111.15:27030` |
| Discord | https://discord.gg/pCMwuQHqwW |

---

## 1. What you're installing

- **SteamCMD** — command-line tool to download a TF2 dedicated server.
- **A local TF2 dedicated server** — a private copy that only you can connect
  to, used purely for testing plugins.
- **Metamod:Source** — a plugin loader that lets SourceMod hook into the game.
- **SourceMod** — the plugin framework itself (this is what `.sp`/`.smx`
  plugins run on).
- **VS Code + SourcePawn extension** — editor with syntax highlighting,
  autocomplete, and a built-in compiler for `.sp` files.

Total disk space needed: roughly 20-25 GB (mostly the TF2 server install).

---

## 2. Install SteamCMD

1. Create a folder for your tools, e.g. `C:\srcds`.
2. Download SteamCMD: https://developer.valvesoftware.com/wiki/SteamCMD#Windows
3. Extract `steamcmd.zip` into `C:\srcds\steamcmd`.
4. Run `steamcmd.exe` once — it will self-update and drop you at a `Steam>` prompt.

---

## 3. Download a TF2 dedicated server

In the `Steam>` prompt:

```
force_install_dir C:\srcds\tf2server
login anonymous
app_update 232250 validate
quit
```

This downloads the **Team Fortress 2 Dedicated Server** (app ID `232250`) into
`C:\srcds\tf2server`. It'll take a while — it's a few GB.

### First run

From `C:\srcds\tf2server\bin`, run:

```
srcds.exe -console -game tf -maxplayers 12 +map vsh_skyhigh_resort_blw
```

(`vsh_skyhigh_resort_blw` is the map our live server runs — using it locally
keeps your testing consistent with production. Any TF2 map works for testing
though, e.g. `cp_dustbowl`.)

If the server starts and you see `Connection to Steam servers successful`,
you're good. You can connect to it yourself from TF2 via the console
(`~` key in-game):

```
connect 127.0.0.1:27015
```

Stop the server with `quit` in its console when you're done.

---

## 4. Install Metamod:Source

1. Download the **Windows** build from https://www.sourcemm.net/downloads.php
   (pick the latest stable build for "Source 2013" — that's the TF2 engine
   branch).
2. Extract the archive **directly into** `C:\srcds\tf2server\tf\` — it should
   merge an `addons` folder containing `metamod` and a few `.vdf` files into
   your existing `tf` folder.
3. Edit `C:\srcds\tf2server\tf\cfg\server.cfg` (create it if it doesn't exist)
   and make sure it does **not** disable plugin loading — no changes needed
   for a default install.
4. Start the server and check the console for a line like:
   ```
   Metamod:Source 1.x loaded
   ```
   Or type `meta version` in the server console to confirm.

---

## 5. Install SourceMod

1. Download the **Windows** build from https://www.sourcemod.net/downloads.php
   (matching "Source 2013" branch, same as Metamod).
2. Extract it **directly into** `C:\srcds\tf2server\tf\` the same way —
   it merges into `addons\sourcemod`.
3. Start the server and run `sm version` in the console to confirm SourceMod
   loaded. You should see plugin list output from `sm plugins list`.

At this point you have a fully working local SourceMod server. Everything
from here is about writing and compiling plugins.

---

## 6. Set up your editor (VS Code)

1. Install [VS Code](https://code.visualstudio.com/).
2. Install the **SourcePawn** extension (search "SourcePawn" in the
   Extensions panel — the one by `Sarrus` / `sourcepawn-studio` is the
   actively maintained one). It bundles:
   - Syntax highlighting and autocomplete for `.sp` files
   - The `spcomp` compiler
   - Go-to-definition for SourceMod/Metamod includes
3. Open `C:\srcds\tf2server\tf\addons\sourcemod\scripting` in VS Code as your
   project folder — this is where `.sp` source files live, and `compiled`
   subfolder is where `.smx` binaries go.

The extension auto-detects the `include` folder inside `scripting/include`,
which contains the SourceMod API definitions (`sourcemod.inc`, `tf2.inc`,
`sdktools.inc`, etc.) — these give you autocomplete for everything the engine
exposes.

---

## 7. Write and compile your first plugin

Create `scripting/hello.sp`:

```sourcepawn
#pragma semicolon 1
#include <sourcemod>

public Plugin myinfo =
{
    name = "Hello Issari",
    author = "Your Name",
    description = "Test plugin",
    version = "1.0",
    url = ""
};

public void OnPluginStart()
{
    PrintToChatAll("[Hello] Plugin loaded!");
    RegConsoleCmd("sm_hello", Cmd_Hello);
}

public Action Cmd_Hello(int client, int args)
{
    PrintToChat(client, "Hello, %N!", client);
    return Plugin_Handled;
}
```

Compile it:

- **In VS Code**: right-click the file → "SourcePawn: Compile" (or use the
  command palette). This runs `spcomp` and drops `hello.smx` into
  `scripting/compiled/`.
- **Manually**: copy `hello.smx` into `addons/sourcemod/plugins/`.

Then in your running server console:

```
sm plugins load hello
```

Connect with TF2 (`connect 127.0.0.1:27015`) and run `sm_hello` in chat or
console to test it.

---

## 8. Testing against the live server's ruleset

Our server runs **VSH (Versus Saxton Hale)**, which itself is powered by a
plugin (Freak Fortress 2 / VSH plugin set). If your plugin needs to interact
with VSH-specific logic:

1. Install the same VSH/Freak Fortress 2 plugin on your local server so the
   gamemode matches production.
2. Test your plugin alongside it locally on `vsh_skyhigh_resort_blw` (or any
   VSH map) before submitting.

This avoids surprises where a plugin works fine on a vanilla server but
conflicts with the VSH ruleset.

---

## 9. Submitting a plugin for the community server

We don't hand out shell access to the production server, but contributions
are very welcome:

1. Test thoroughly on your local server first (steps above).
2. Open a pull request or issue against
   [`issari-tf/issari-bot`](https://github.com/issari-tf/issari-bot) with:
   - The `.sp` source file
   - A short description of what it does and why
   - Confirmation it's been tested locally with the VSH gamemode running
3. Or post it in the Discord (`!sourcemod` for this guide, ask in chat for
   the plugin-submissions channel) — an admin will review, test, and deploy
   it to the live server.

---

## 10. Useful resources

- [SourceMod Scripting Tutorials (AlliedModders wiki)](https://wiki.alliedmods.net/Category:SourceMod_Scripting)
- [SourceMod API Reference](https://sm.alliedmods.net/new-api/)
- [AlliedModders Forums](https://forums.alliedmods.net/) — the main place to
  ask SourcePawn questions and find existing plugins/extensions
- [Metamod:Source](https://www.sourcemm.net/)
- [SourceMod Downloads](https://www.sourcemod.net/downloads.php)

---

## Troubleshooting

- **`sm` command not recognized in console** → Metamod isn't loaded. Check
  `addons/metamod.vdf` exists in `tf/addons` and re-check step 4.
- **Plugin doesn't show in `sm plugins list`** → make sure the `.smx` (not
  `.sp`) is in `addons/sourcemod/plugins/`, and check
  `addons/sourcemod/logs/errors_*.log` for compile/load errors.
- **Server won't start / missing `.dll` errors** → re-run
  `app_update 232250 validate` in SteamCMD — a file likely failed to download.
