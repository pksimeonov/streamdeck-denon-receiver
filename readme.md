# Denon Receiver Control for Elgato Stream Deck

A Stream Deck plugin that controls Denon and Marantz receivers with HEOS over the network (telnet protocol). It works on all Stream Deck models. On a Stream Deck +, the dials show the live volume and subwoofer level on the touch strip.

> **Mirabox, Soomfon or Ajazz user?** This plugin is for Elgato Stream Deck. Use the [mirabox-denon-receiver](https://github.com/pksimeonov/mirabox-denon-receiver) repository instead.

## Features

### Volume Control

- **Key:** choose a mode in the action settings: Set Volume, Volume Up, Volume Down, Toggle Mute, Mute or Unmute. The key title shows the current volume, "Muted" or "Off".
- **Stream Deck + dial:** rotate to adjust the volume by the configured step size (0.5, 1, 1.5, 2, 2.5 or 5 dB per tick). Push or touch toggles mute. The touch strip shows an icon, "Vol: N" and a level bar.

### Subwoofer Level

Adjusts the subwoofer channel level via Options > Channel Level. This is a runtime offset and does not touch the MultEQ/Audyssey calibration.

- **Dial:** rotate to adjust by the configured step size. Push or touch resets to 0 dB.
- **Key:** shows the current level (for example "+2dB"). Press to reset to 0 dB.

### Power Control

Toggle, turn on or turn off. The key shows the current power state.

### Input Source Control

Set the input source, or set the Video Select source.

### Dynamic Volume

Cycles through Off, Light, Medium and Heavy. The key shows the current state.

### Dynamic EQ

Toggles Dynamic EQ on or off. The key shows the current state.

### Zones

Volume, Power and Source support the Main zone and Zone 2.

## Requirements

- Stream Deck software 6.4 or later
- Windows 10 or later, or macOS 10.15 or later
- Denon or Marantz receiver with HEOS, with network control enabled (no HEOS login needed)
- Receiver on the same LAN as your computer for automatic discovery, or use Manual IP

## Installation

1. Download the latest `.streamDeckPlugin` file from the [releases page](https://github.com/pksimeonov/streamdeck-denon-receiver/releases/latest).
2. Double-click the file. The Stream Deck software installs the plugin.

## Setup and usage

1. Drag any Receiver Control action onto a key or dial.
2. In the action settings, pick your receiver from the **Receiver** dropdown. Receivers are discovered automatically via SSDP. Use the refresh button to search again.
3. If discovery fails, type the receiver's address into **Manual IP** and press **Connect**. This is the recommended approach if discovery is unreliable. Give the receiver a fixed IP address (static or DHCP reservation).
4. The **Status** field shows the connection status.
5. Choose the **Zone** (Main or Zone 2) and the action-specific options, such as the volume mode, step size, power action or input source.

You only need to pick the receiver once. The last receiver you connected becomes the default, and every action you add afterwards uses it automatically. If only one receiver is found on the network, it becomes the default without any setup. To control a different receiver from one action, pick it in that action's settings.

## Development

Requires Node.js 20 (see `.nvmrc`).

Install dependencies:

```bash
npm install
```

Build the plugin:

```bash
npm run build
```

Validate the manifest and plugin:

```bash
npm run validate
```

Enable Stream Deck developer mode (once):

```bash
npx streamdeck dev
```

Symlink the plugin folder into the Stream Deck plugins directory:

```bash
npm run link
```

Rebuild and restart the plugin:

```bash
npm run restart
```

Or rebuild and restart automatically on save:

```bash
npm run watch
```

Create the installable package at `release/com.pksimeonov.denon-receiver.streamDeckPlugin`:

```bash
npm run pack
```

Notes:

- Logs are written to `com.pksimeonov.denon-receiver.sdPlugin/logs/`.
- The manifest has `Nodejs.Debug` enabled during development, so the VS Code "Attach to Plugin" configuration can attach to the running plugin.
- The plugin icon `imgs/plugin/marketplace.png` is 288x288. Re-export it at 256x256 from `images/marketplace.kra` before any Marketplace submission.

## Troubleshooting

**Receiver not found**

- Make sure HEOS is enabled on the receiver. You do not need to be logged into HEOS.
- Make sure the receiver and your computer are on the same LAN segment.
- Your firewall may prompt for the Stream Deck Node runtime to use UDP for discovery. Allow it.
- If discovery still fails, enter the receiver's address under Manual IP and press Connect.

**Actions show a warning triangle**

The receiver is unreachable. The plugin keeps reconnecting automatically, retrying at most every 30 seconds. Check that the receiver is powered (network standby enabled) and reachable on the network.

**Connection drops after toggling a VPN or after sleep**

The plugin reconnects when the connection resets and when the computer wakes up. It also checks the receiver every 30 seconds and reconnects if it stops responding. If the receiver gets a new IP address, discovery picks it up and the connection follows it. If it does not recover, press Connect in the action settings.

## Credits

Based on my [Mirabox implementation](https://github.com/pksimeonov/mirabox-denon-receiver), which in turn is based on [mthiel/stream-deck-denon-receiver](https://github.com/mthiel/stream-deck-denon-receiver) by Matthew Thiel.

Mirabox, Soomfon and Ajazz users: use the [mirabox-denon-receiver](https://github.com/pksimeonov/mirabox-denon-receiver) repository. The Mirabox build lives on its `main` branch and the `mirabox-v1.0.0` tag.
