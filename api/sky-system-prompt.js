import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SKY_INSTRUCTIONS_PATH = path.join(__dirname, '..', 'SKY_INSTRUCTIONS.md');
const SKY_SYSTEM_PROMPT = fs.readFileSync(SKY_INSTRUCTIONS_PATH, 'utf-8');

export default SKY_SYSTEM_PROMPT;
