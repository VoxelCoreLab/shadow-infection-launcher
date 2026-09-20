# Shadow Infection Launcher

Tauri-2-Desktop-Client für Shadow Infection.

```bash
npm install
npm run tauri dev
```

## Lint, Format und Tests

Check-Befehle ändern nichts und eignen sich für die CI. Fix-Befehle beheben Probleme lokal. Reihenfolge lokal wie in der CI: Format, Lint, Unit Test.

|                 | Check                 | Fix                       |
| --------------- | --------------------- | ------------------------- |
| Frontend Format | `npm run format`      | `npm run format:fix`      |
| Frontend Lint   | `npm run lint`        | `npm run lint:fix`        |
| Frontend Test   | `npm run test`        | —                         |
| Rust Format     | `npm run format:rust` | `npm run format:rust:fix` |
| Rust Lint       | `npm run lint:rust`   | `npm run lint:rust:fix`   |
| Rust Test       | `npm run test:rust`   | —                         |

`npm run test:watch` startet Vitest im Watch-Modus.
