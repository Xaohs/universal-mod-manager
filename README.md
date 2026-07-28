# Universal Mod Manager

One in-game settings window for every Deadlock mod that opts in.

**[Documentation](https://xaohs.github.io/universal-mod-manager/)**

UMM adds a single entry next to Settings in Deadlock's escape menu.
Every mod that opts in gets its own tab there, with its own settings, saved automatically.
UMM does nothing on its own: it only shows settings for mods that support it.

## For players

Drop the VPK into `Deadlock/game/citadel/addons/`, then press Esc in the main menu or in a match.

- [Install guide](https://xaohs.github.io/universal-mod-manager/players/install/)
- [Using the window](https://xaohs.github.io/universal-mod-manager/players/using/)
- [Troubleshooting](https://xaohs.github.io/universal-mod-manager/players/troubleshooting/)

## For mod authors

Integration is one self-contained snippet pasted into your own Panorama script.
There is nothing to bundle and no dependency to take: if UMM is not installed, your declared defaults stand and your mod is unaffected.

- [Integration snippet](https://xaohs.github.io/universal-mod-manager/authors/integration/)
- [Settings reference](https://xaohs.github.io/universal-mod-manager/authors/settings-reference/) - every control type
- [umm_client.js](https://xaohs.github.io/universal-mod-manager/umm_client.js) - optional wrapper, for mods with many settings
- [Bus protocol](https://xaohs.github.io/universal-mod-manager/internals/protocol/)

Persistence is automatic.
Deadlock's Panorama exposes no storage API at all, so UMM encodes settings into a hero build's description, which Valve stores server-side.
You write no persistence code.

## About this repository

This repository hosts the published documentation and downloads.

The `gh-pages` branch is generated output, built and force-pushed by CI.
Do not edit it by hand; changes there are overwritten on the next deploy.
