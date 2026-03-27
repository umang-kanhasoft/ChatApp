import os from 'node:os';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const instanceId =
  env.INSTANCE_ID ||
  `${os.hostname().replace(/[^a-zA-Z0-9-]/g, '-')}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
