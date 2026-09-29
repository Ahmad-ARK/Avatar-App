import config from '../config.js'; import { UsageLedger } from './UsageLedger.js';
export const usageLedger = new UsageLedger(config.paths.usage);
