import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { fixupConfigRules } from '@eslint/compat';
export default defineConfig([...fixupConfigRules(nextVitals), ...fixupConfigRules(nextTs), globalIgnores(['.next/**','next-env.d.ts','worker/**','test-results/**']), {rules:{'react-hooks/set-state-in-effect':'off'}}]);
