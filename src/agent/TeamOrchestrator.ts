import { createLLMProvider, LLMProvider } from '../llm/Provider';
import { DesktopSettings, ModelProfile, TeamMemberConfig } from '../desktop/types';

export type TeamStatusCallback = (content: string) => Promise<void> | void;

export interface TeamRunOptions {
  task: string;
  settings: DesktopSettings;
  signal?: AbortSignal;
  status: TeamStatusCallback;
  execute: (profileId: string, executionPrompt: string) => Promise<void>;
  providerFactory?: (profile: ModelProfile) => LLMProvider;
}

const ROLE_LABELS: Record<TeamMemberConfig['role'], string> = {
  coordinator: 'Координатор',
  architect: 'Архитектор',
  developer: 'Исполнитель',
  reviewer: 'Ревьюер',
  custom: 'Специалист',
};

function providerFor(settings: DesktopSettings, profile: ModelProfile): LLMProvider {
  const selectedProvider = profile.provider === 'anthropic' ? 'anthropic' : 'openai';
  return createLLMProvider(selectedProvider, {
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model,
    maxContextTokens: profile.maxContextTokens || 32000,
    temperatureEnabled: Boolean(settings.temperatureEnabled),
    temperature: Math.max(0, Math.min(2, Number(settings.temperature ?? 0.7))),
    enableHyperagentHeader: profile.enableHyperagentHeader !== undefined
      ? Boolean(profile.enableHyperagentHeader)
      : Boolean(settings.enableHyperagentHeader),
    hyperagentSecret: profile.hyperagentSecret || settings.hyperagentSecret || '',
    enableDeepseekThinking: profile.enableDeepseekThinking,
    reasoningEffort: profile.reasoningEffort,
  });
}

function compactJournal(entries: string[], limit = 14000) {
  const joined = entries.join('\n\n');
  return joined.length > limit ? joined.slice(joined.length - limit) : joined;
}

export class TeamOrchestrator {
  async run(options: TeamRunOptions) {
    const profilesById = new Map(options.settings.modelProfiles.map((profile) => [profile.id, profile]));
    const members = (options.settings.teamMembers || [])
      .slice(0, 4)
      .filter((member) => profilesById.has(member.profileId));

    if (!options.settings.teamEnabled) throw new Error('Команда моделей выключена в настройках.');
    if (members.length < 2) throw new Error('Для команды выберите минимум две настроенные модели.');

    const coordinator = members.find((member) => member.role === 'coordinator') || members[0];
    const executor = members.find((member) => member.role === 'developer') || coordinator;
    const rounds = Math.max(1, Math.min(3, Number(options.settings.teamDiscussionRounds || 1)));
    const journal: string[] = [];
    const getProvider = (profile: ModelProfile) => options.providerFactory?.(profile) || providerFor(options.settings, profile);

    await options.status(`🤝 *Команда моделей начала обсуждение: ${members.length} участников, ${rounds} раунд(а).*`);

    for (let round = 1; round <= rounds; round += 1) {
      for (const member of members) {
        if (options.signal?.aborted) throw new Error('Командная задача остановлена пользователем.');
        const profile = profilesById.get(member.profileId)!;
        const role = ROLE_LABELS[member.role] || ROLE_LABELS.custom;
        const response = await getProvider(profile).chatComplete({
          signal: options.signal,
          messages: [
            {
              role: 'system',
              content: `Ты участник команды AI-моделей в роли «${role}».
Общайся с другими участниками через общий журнал. Не спорь ради спора: уточняй, дополняй и стремись к общему решению.
Не вызывай инструменты и не изменяй файлы на этапе обсуждения.
Предложи конкретный вклад в решение, отметь риски и явно напиши, что рекомендуешь следующему участнику.
${member.instructions ? `Твоя дополнительная инструкция: ${member.instructions}` : ''}`,
            },
            {
              role: 'user',
              content: `Задача пользователя:\n${options.task}\n\nРаунд: ${round}/${rounds}\n\nОбщий журнал команды:\n${compactJournal(journal) || 'Пока пусто. Ты начинаешь обсуждение.'}`,
            },
          ],
        });
        const contribution = String(response.content || '').trim() || 'Нет дополнительных замечаний.';
        const entry = `[Раунд ${round}] ${profile.name} (${role}):\n${contribution}`;
        journal.push(entry);
        await options.status(`👥 **${profile.name} · ${role}**\n${contribution}`);
      }
    }

    if (options.signal?.aborted) throw new Error('Командная задача остановлена пользователем.');
    const coordinatorProfile = profilesById.get(coordinator.profileId)!;
    const decision = await getProvider(coordinatorProfile).chatComplete({
      signal: options.signal,
      messages: [
        {
          role: 'system',
          content: `Ты координатор команды AI-моделей.
На основе общего журнала прими одно итоговое решение. Не продолжай спор и не оставляй взаимоисключающих вариантов.
Составь краткий исполнимый план, учти замечания участников и отдельно перечисли ограничения для единственного исполнителя.
Только назначенный исполнитель меняет файлы, остальные участники являются советниками.`,
        },
        {
          role: 'user',
          content: `Задача пользователя:\n${options.task}\n\nОбщий журнал:\n${compactJournal(journal)}`,
        },
      ],
    });
    const plan = String(decision.content || '').trim();
    if (!plan) throw new Error('Координатор не смог сформировать общий план.');
    await options.status(`🧭 **Решение координатора · ${coordinatorProfile.name}**\n${plan}`);

    const executorProfile = profilesById.get(executor.profileId)!;
    await options.status(`🛠 *Единственный исполнитель «${executorProfile.name}» начинает работу. Остальные модели больше не изменяют среду.*`);
    await options.execute(executor.profileId, `[TEAM EXECUTION MODE]
Ты единственный участник команды, которому разрешено изменять файлы и выполнять команды.
Другие модели уже обсудили задачу. Следуй единому решению координатора, не отменяй согласованные решения без доказанной технической причины.
Проверь текущее состояние среды перед изменениями, выполняй работу последовательно и заверши проверками.

[ORIGINAL USER TASK]
${options.task}

[TEAM JOURNAL]
${compactJournal(journal)}

[COORDINATOR DECISION]
${plan}`);
  }
}
