import { createLLMProvider, LLMProvider } from '../llm/Provider';
import { DesktopSettings, ModelProfile, TeamMemberConfig } from '../desktop/types';

export type TeamStatusCallback = (content: string) => Promise<void> | void;
export type TeamMemberState = 'waiting' | 'thinking' | 'done' | 'executing' | 'stopped' | 'error';
export type TeamRunPhase = 'discussion' | 'decision' | 'execution' | 'complete' | 'stopped' | 'error';

export interface TeamRoomMember {
  id: string;
  profileId: string;
  name: string;
  model: string;
  role: TeamMemberConfig['role'];
  roleLabel: string;
  state: TeamMemberState;
  round: number;
  tokens: number;
  durationMs: number;
  contribution?: string;
}

export interface TeamRoomSnapshot {
  runId: string;
  phase: TeamRunPhase;
  rounds: number;
  currentRound: number;
  startedAt: string;
  updatedAt: string;
  totalTokens: number;
  members: TeamRoomMember[];
  journal: Array<{
    id: string;
    memberId: string;
    memberName: string;
    roleLabel: string;
    round: number;
    content: string;
    createdAt: string;
  }>;
  decision?: string;
  error?: string;
}

export interface TeamRunOptions {
  runId: string;
  task: string;
  settings: DesktopSettings;
  signal?: AbortSignal;
  status: TeamStatusCallback;
  room?: (snapshot: TeamRoomSnapshot) => Promise<void> | void;
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

function responseTokens(response: Awaited<ReturnType<LLMProvider['chatComplete']>>) {
  return Math.max(0, Number(response.usage?.totalTokens || 0));
}

function isAbortError(error: unknown) {
  const value = error as any;
  return value?.name === 'AbortError' || /abort|остановлен/i.test(String(value?.message || value || ''));
}

export class TeamOrchestrator {
  private readonly skippedMembers = new Map<string, Set<string>>();
  private readonly activeMembers = new Map<string, { memberId: string; controller: AbortController }>();

  stopMember(runId: string, memberId: string) {
    const skipped = this.skippedMembers.get(runId);
    if (!skipped) return false;
    skipped.add(memberId);
    const active = this.activeMembers.get(runId);
    if (active?.memberId === memberId) active.controller.abort();
    return true;
  }

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
    const skipped = new Set<string>();
    this.skippedMembers.set(options.runId, skipped);
    const getProvider = (profile: ModelProfile) => options.providerFactory?.(profile) || providerFor(options.settings, profile);
    const snapshot: TeamRoomSnapshot = {
      runId: options.runId,
      phase: 'discussion',
      rounds,
      currentRound: 1,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalTokens: 0,
      members: members.map((member) => {
        const profile = profilesById.get(member.profileId)!;
        return {
          id: member.id,
          profileId: member.profileId,
          name: profile.name,
          model: profile.model,
          role: member.role,
          roleLabel: ROLE_LABELS[member.role] || ROLE_LABELS.custom,
          state: 'waiting',
          round: 0,
          tokens: 0,
          durationMs: 0,
        };
      }),
      journal: [],
    };
    const emitRoom = async () => {
      snapshot.updatedAt = new Date().toISOString();
      await options.room?.(JSON.parse(JSON.stringify(snapshot)));
    };
    const stopRequested = () => Boolean(options.signal?.aborted);

    await emitRoom();
    await options.status(`🤝 *Команда моделей начала обсуждение: ${members.length} участников, ${rounds} раунд(а).*`);

    try {
      for (let round = 1; round <= rounds; round += 1) {
        snapshot.currentRound = round;
        for (const member of members) {
          if (stopRequested()) throw new Error('Командная задача остановлена пользователем.');
          const roomMember = snapshot.members.find((item) => item.id === member.id)!;
          if (skipped.has(member.id)) {
            roomMember.state = 'stopped';
            await emitRoom();
            continue;
          }

          const profile = profilesById.get(member.profileId)!;
          const role = ROLE_LABELS[member.role] || ROLE_LABELS.custom;
          const memberController = new AbortController();
          const abortWholeRun = () => memberController.abort();
          options.signal?.addEventListener('abort', abortWholeRun, { once: true });
          this.activeMembers.set(options.runId, { memberId: member.id, controller: memberController });
          roomMember.state = 'thinking';
          roomMember.round = round;
          await emitRoom();
          const started = Date.now();

          try {
            const response = await getProvider(profile).chatComplete({
              signal: memberController.signal,
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
            const tokens = responseTokens(response);
            journal.push(entry);
            roomMember.state = 'done';
            roomMember.tokens += tokens;
            roomMember.durationMs += Date.now() - started;
            roomMember.contribution = contribution;
            snapshot.totalTokens += tokens;
            snapshot.journal.push({
              id: `${options.runId}-${round}-${member.id}`,
              memberId: member.id,
              memberName: profile.name,
              roleLabel: role,
              round,
              content: contribution,
              createdAt: new Date().toISOString(),
            });
            await emitRoom();
            await options.status(`👥 **${profile.name} · ${role}**\n${contribution}`);
          } catch (error) {
            roomMember.durationMs += Date.now() - started;
            if (skipped.has(member.id) && isAbortError(error)) {
              roomMember.state = 'stopped';
              await emitRoom();
              await options.status(`⏭ *${profile.name} отключён от текущего обсуждения.*`);
              continue;
            }
            roomMember.state = 'error';
            await emitRoom();
            throw error;
          } finally {
            options.signal?.removeEventListener('abort', abortWholeRun);
            if (this.activeMembers.get(options.runId)?.memberId === member.id) this.activeMembers.delete(options.runId);
          }
        }
      }

      if (stopRequested()) throw new Error('Командная задача остановлена пользователем.');
      const coordinatorProfile = profilesById.get(coordinator.profileId)!;
      const coordinatorRoomMember = snapshot.members.find((item) => item.id === coordinator.id)!;
      snapshot.phase = 'decision';
      coordinatorRoomMember.state = 'thinking';
      await emitRoom();
      const decisionStarted = Date.now();
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
      const decisionTokens = responseTokens(decision);
      coordinatorRoomMember.state = 'done';
      coordinatorRoomMember.tokens += decisionTokens;
      coordinatorRoomMember.durationMs += Date.now() - decisionStarted;
      snapshot.totalTokens += decisionTokens;
      snapshot.decision = plan;
      await emitRoom();
      await options.status(`🧭 **Решение координатора · ${coordinatorProfile.name}**\n${plan}`);

      const executorProfile = profilesById.get(executor.profileId)!;
      const executorRoomMember = snapshot.members.find((item) => item.id === executor.id)!;
      snapshot.phase = 'execution';
      executorRoomMember.state = 'executing';
      await emitRoom();
      await options.status(`🛠 *Единственный исполнитель «${executorProfile.name}» начинает работу. Остальные модели больше не изменяют среду.*`);
      const executionStarted = Date.now();
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
      executorRoomMember.durationMs += Date.now() - executionStarted;
      executorRoomMember.state = 'done';
      snapshot.phase = 'complete';
      await emitRoom();
    } catch (error) {
      snapshot.phase = stopRequested() ? 'stopped' : 'error';
      snapshot.error = String((error as any)?.message || error || '');
      snapshot.members.forEach((member) => {
        if (member.state === 'thinking' || member.state === 'executing') member.state = snapshot.phase === 'stopped' ? 'stopped' : 'error';
      });
      await emitRoom();
      throw error;
    } finally {
      this.activeMembers.delete(options.runId);
      this.skippedMembers.delete(options.runId);
    }
  }
}
