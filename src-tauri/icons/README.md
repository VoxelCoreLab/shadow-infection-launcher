# Icon files required for production builds

Place the following icon files in this directory before creating a release build:

| File                | Size        | Format | Required on          |
|---------------------|-------------|--------|----------------------|
| `32x32.png`         | 32×32 px    | PNG    | Windows, Linux       |
| `128x128.png`       | 128×128 px  | PNG    | Windows, Linux       |
| `128x128@2x.png`    | 256×256 px  | PNG    | macOS (Retina)       |
| `icon.ico`          | multi-size  | ICO    | Windows              |
| `icon.icns`         | multi-size  | ICNS   | macOS                |

## Quick generation with Tauri CLI

Once the Rust toolchain and Tauri CLI are installed you can generate all sizes
from a single 1024×1024 PNG source image:

```bash
npm run tauri icon path/to/your-icon-1024.png
```

This command reads the source image and writes all required sizes into this
directory automatically.
