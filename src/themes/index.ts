import type { ThemeDef } from './types';
import { base } from './base';
import { halloween } from './halloween';
import { hiver } from './hiver';
import { noel } from './noel';
import { sakura } from './sakura';
import { plage } from './plage';

export const THEMES: Record<string, ThemeDef> = { base, halloween, hiver, noel, sakura, plage };
