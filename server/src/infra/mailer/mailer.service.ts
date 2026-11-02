import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Phase 0 stub for transactional mail (password reset, invites).
 * Dev: logs the message so you can copy the link. Production: drops it with a warning
 * (the real transport arrives with the provider adapters in Phase 1C).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(mail: OutgoingMail): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      this.logger.warn(`Mail transport not configured; dropped "${mail.subject}"`);
      return;
    }
    this.logger.log(`[DEV MAIL] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}
