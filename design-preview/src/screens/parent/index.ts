import type { ScreenDef } from '../types';
import { screens as a } from './partA';
import { screens as b } from './partB';

export const screens: ScreenDef[] = [...a, ...b];
