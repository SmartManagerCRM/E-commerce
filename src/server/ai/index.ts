import "server-only";

import { anthropicProvider, aiConfigured } from "./anthropic";
import type { AIProvider } from "./provider";

export { aiConfigured };
export type * from "./provider";

/** The provider currently wired up. Swapping providers means changing this one line. */
export const aiProvider: AIProvider = anthropicProvider;
