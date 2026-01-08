import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  name: string;
  version: string;
};

export const VERSION = packageJson.version;
export const PACKAGE_NAME = packageJson.name;
export const pkg = packageJson;
