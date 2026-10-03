import { createLivingRuntime } from '../lib/living/runtime.ts';
const runtime=createLivingRuntime(message=>self.postMessage(message));
self.onmessage=event=>runtime.handle(event.data);
