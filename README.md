# TasHOME ⚡

> Modern, lightweight Smart Home Relay WebApp & Dashboard for Tasmota & ESP8266 devices.

TasHOME provides an intuitive, high-performance web interface to monitor and control Tasmota smart switches, relays, and power monitoring plugs across your local network.

## 🚀 Key Features

- **Modern Dashboard with Responsive Container Queries**: Widgets smoothly adapt across 9 layout sizes (1×1 to 3×3) using CSS Container Queries with mobile-first breakpoints.
- **Relay Toggle Widget (P2)**: Multi-channel support (1CH to 4CH) with quick `PulseTime` auto-off timers (1m, 5m, 15m, 30m).
- **Energy Monitor Widget (P1)**: Real-time telemetry monitoring for Voltage (V), Current (A), Power (W), Apparent/Reactive Power, Power Factor ($\cos \varphi$), Today/Yesterday/Total consumption (kWh).
- **LAN Auto-Discovery (P3)**: Batch scanning of local `/24` subnets (20 IPs/batch, 300ms timeout) to discover Tasmota nodes and add them in 1-click.
- **Smart Scenes & Presets (P4)**: Atomic server-persisted scenes (`data/scenes.json`) with parallel non-blocking execution across all online devices via `Promise.allSettled`.
- **Integrated Console**: Built-in CLI command console with autocompletion and jq-styled syntax highlighting.
- **Enterprise-Grade Security**: RFC 6238 TOTP 2FA authentication, rate limiting, and 24-hour HTTP-only session cookies.

## 🛠 Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Zustand
- **Build Tool**: Vite v8
- **Backend Server**: Node.js HTTP server (zero external npm runtime dependencies)
- **Deployment**: Systemd service, Tailscale / Cloudflare Tunnel compatible

## 📦 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/Tiendepchai/TasHOME.git
cd TasHOME

# Install dependencies
npm install

# Build production assets
npm run build

# Start the server
npm start
```

Default server port: `3000`.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Web server listening port | `3000` |
| `RELAY_HOST` | Primary Tasmota device IP | `192.168.1.140` |
| `RELAY_PORT` | Primary Tasmota HTTP port | `80` |
| `APP_PIN` | Fallback PIN for emergency access | `823543` |

## 📄 License

MIT
