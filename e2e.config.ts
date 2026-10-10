import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

try {
  process.loadEnvFile('.env');
} catch {
  // CI has no .env; CMD_API_KEY arrives from the environment there.
}

// Command Code's Provider API, OpenAI Chat Completions compatible. Model ids are
// Command Code's own catalogue ids (the /model list); Claude ids only answer on
// /v1/messages, so chatModel() cannot reach them.
const commandcode = createOpenAICompatible({
  name: 'commandcode',
  baseURL: 'https://api.commandcode.ai/provider/v1',
  apiKey: process.env.CMD_API_KEY,
  // The endpoint accepts response_format: json_schema (verified against it), so
  // judgments and extract() get real structured output instead of a warning.
  supportsStructuredOutputs: true,
});

export default {
  agents: {
    default: {
      model: commandcode.chatModel('deepseek/deepseek-v4-flash'),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:3000',
      // Or let the runner start the dev server:
      // command: { executable: 'npm', args: ['run', 'dev'] },
    },
  }],
  // The seeded owner from packages/database/prisma/seed.constants.ts. Public test
  // data, never deployed; CI overrides with E2E_USER_OWNER_USERNAME/PASSWORD.
  credentials: {
    owner: { username: 'owner@marketcore.test', password: 'correct-horse-battery' },
  },
} satisfies E2EConfig;
