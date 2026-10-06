import { fileURLToPath } from 'node:url';

/** Package-root `templates/` directory (works from both `src/` and `dist/`). */
export const TEMPLATES_DIR: string = fileURLToPath(new URL('../templates/', import.meta.url));
