import { eventBus, EVENTS } from '../events/EventBus';
import { logger } from '../logger';

export class ProtectionSystem {
  private verificationFailures = new Map<number, number>();
  private totalToolCalls = new Map<number, number>();
  private maxVerificationFailures = 3;
  private maxToolCallsPerTask = 50;
  private isEnabled = true;

  constructor() {
    this.setupListeners();
  }

  configure(maxToolCalls: number = 50, enabled: boolean = true) {
    this.maxToolCallsPerTask = maxToolCalls > 0 ? maxToolCalls : Infinity;
    this.isEnabled = enabled;
  }

  private setupListeners() {
    eventBus.on(EVENTS.VERIFICATION_FAILED, (payload: any) => {
      const chatId = payload?.chatId;
      if (chatId === undefined) return;
      const fails = (this.verificationFailures.get(chatId) || 0) + 1;
      this.verificationFailures.set(chatId, fails);
      this.checkInstability(chatId);
    });

    eventBus.on(EVENTS.TOOL_EXECUTED, (payload: any) => {
      const chatId = payload?.chatId;
      if (chatId === undefined) return;
      const calls = (this.totalToolCalls.get(chatId) || 0) + 1;
      this.totalToolCalls.set(chatId, calls);
      this.checkInstability(chatId);
    });

    eventBus.on(EVENTS.TASK_STARTED, (payload: any) => {
      const chatId = payload?.chatId;
      if (chatId === undefined) return;
      this.reset(chatId);
    });
  }

  private checkInstability(chatId: number) {
    if (!this.isEnabled) return;

    let unstable = false;
    let reason = '';

    const vFails = this.verificationFailures.get(chatId) || 0;
    if (vFails >= this.maxVerificationFailures) {
      unstable = true;
      reason = `Превышено число ошибок проверки верификации (${this.maxVerificationFailures} подряд). Возможно зацикливание.`;
    }

    const tCalls = this.totalToolCalls.get(chatId) || 0;
    if (tCalls >= this.maxToolCallsPerTask) {
      unstable = true;
      reason = `Достигнут лимит вызова инструментов (${this.maxToolCallsPerTask}) для одной задачи. Выполнение остановлено защитой. Вы можете изменить лимит в Настройках.`;
    }

    if (unstable) {
      logger.error(`[UNSTABLE AGENT PROTECTION TRIGGERED for Chat ${chatId}] ${reason}`);
      this.haltExecution(chatId, reason);
    }
  }

  private haltExecution(chatId: number, reason: string) {
    logger.error(`Execution halted by Protection System for chat ${chatId}. Diagnostics generated.`);
    eventBus.emit(EVENTS.PROTECTION_HALT_EXECUTION, { chatId, reason });
  }

  reset(chatId: number) {
    this.verificationFailures.set(chatId, 0);
    this.totalToolCalls.set(chatId, 0);
  }
}

export const protectionSystem = new ProtectionSystem();
