import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { parse, YAMLParseError } from 'yaml';
import { parseRoutineConfig } from '../src/lib/routineConfig.ts';

// Turns `import x from '.../config/*.yaml'` into `export default <validated routine JSON>`.
// The yaml package stays in this build-time plugin and never reaches the app bundle.
export function yamlRoutinePlugin(): Plugin {
  return {
    name: 'yaml-routine',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0];
      if (!/[\/]config[\/][^\/]+\.ya?ml$/.test(file)) return null;
      this.addWatchFile(file);
      const text = readFileSync(file, 'utf8');
      let data: unknown;
      try {
        data = parse(text);
      } catch (e) {
        const pos = e instanceof YAMLParseError ? e.linePos?.[0] : undefined;
        this.error(`${file}\n${pos ? `line ${pos.line}: ` : ''}${(e as Error).message}`);
      }
      try {
        return `export default ${JSON.stringify(parseRoutineConfig(data))};`;
      } catch (e) {
        this.error(`${file}\n${(e as Error).message}`);
      }
    },
  };
}
