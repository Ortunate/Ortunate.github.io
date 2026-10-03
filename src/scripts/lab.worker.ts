import { createRuntime } from '../lib/lab/runtime.ts';
const runtime = createRuntime(message => self.postMessage(message));
self.onmessage = event => runtime.handle(event.data);
