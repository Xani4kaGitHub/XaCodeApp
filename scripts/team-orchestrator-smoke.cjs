const assert = require('assert');
const { TeamOrchestrator } = require('../dist/agent/TeamOrchestrator');

console.log('--- Running Team Orchestrator Smoke Test ---');

const profiles = [
  { id: 'coordinator', name: 'Coordinator Model', provider: 'openai', apiKey: 'test', baseUrl: 'https://example.test', model: 'coordinator', maxContextTokens: 32000, showReasoning: false },
  { id: 'developer', name: 'Developer Model', provider: 'openai', apiKey: 'test', baseUrl: 'https://example.test', model: 'developer', maxContextTokens: 32000, showReasoning: false },
  { id: 'reviewer', name: 'Reviewer Model', provider: 'openai', apiKey: 'test', baseUrl: 'https://example.test', model: 'reviewer', maxContextTokens: 32000, showReasoning: false },
];
const settings = {
  modelProfiles: profiles,
  teamEnabled: true,
  teamDiscussionRounds: 2,
  teamMembers: [
    { id: 'one', profileId: 'coordinator', role: 'coordinator' },
    { id: 'two', profileId: 'developer', role: 'developer' },
    { id: 'three', profileId: 'reviewer', role: 'reviewer' },
  ],
};

const calls = [];
const statuses = [];
const rooms = [];
const executions = [];
const providerFactory = (profile) => ({
  chatComplete: async (request) => {
    const prompt = request.messages.map((message) => message.content).join('\n');
    calls.push({ profileId: profile.id, prompt });
    if (prompt.includes('прими одно итоговое решение')) return { content: 'Единый план команды', usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 } };
    return { content: `Вклад модели ${profile.name}`, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
  },
});

(async () => {
  await new TeamOrchestrator().run({
    runId: 'smoke-team-run',
    task: 'Реализовать безопасную функцию',
    settings,
    providerFactory,
    status: (content) => statuses.push(content),
    room: (snapshot) => rooms.push(snapshot),
    execute: async (profileId, executionPrompt) => executions.push({ profileId, executionPrompt }),
  });

  assert.strictEqual(executions.length, 1, 'environment must have exactly one writer');
  assert.strictEqual(executions[0].profileId, 'developer', 'developer role must be the writer');
  assert.ok(executions[0].executionPrompt.includes('Единый план команды'), 'executor must receive coordinator decision');
  assert.ok(calls.some((call) => call.profileId === 'developer' && call.prompt.includes('Coordinator Model')), 'later members must see earlier journal entries');
  assert.ok(calls.some((call) => call.profileId === 'coordinator' && call.prompt.includes('Reviewer Model')), 'coordinator must see the full team journal');
  assert.ok(statuses.some((status) => status.includes('Единственный исполнитель')), 'single-writer rule must be visible');
  assert.ok(rooms.some((room) => room.members.some((member) => member.state === 'thinking')), 'live room must expose a thinking member');
  assert.ok(rooms.some((room) => room.journal.length > 0), 'live room must expose the shared journal');
  assert.strictEqual(rooms.at(-1).phase, 'complete', 'live room must finish in complete phase');
  assert.ok(rooms.at(-1).totalTokens > 0, 'live room must count discussion tokens');
  console.log('✅ Shared journal, coordinator decision, and single-writer execution verified.');
})().catch((error) => {
  console.error('❌ Team Orchestrator smoke test failed:', error);
  process.exit(1);
});
