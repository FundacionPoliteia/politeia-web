import { config } from './config.js';

const summary = {
  provider: config.mailProvider,
  projectKey: config.mailProjectKey,
  brandName: config.mailBrandName,
  senders: {
    internal: config.mailFromInternal,
    updates: config.mailFromUpdates,
    newsletter: config.mailFromNewsletter,
  },
  replyTo: config.mailReplyTo || '(not configured)',
  apiPublicUrl: config.apiPublicUrl,
  publicSiteUrl: config.publicSiteUrl,
  audienceKey: config.newsletterAudienceKey,
  resend: {
    apiKeyConfigured: Boolean(config.resendApiKey),
    segmentConfigured: Boolean(config.resendSegmentId),
    topicConfigured: Boolean(config.resendTopicId),
  },
  newsletterTokenSecretConfigured: Boolean(config.newsletterTokenSecret),
};

console.log(JSON.stringify(summary, null, 2));

if (config.mailProvider === 'resend' && (!config.resendApiKey || !config.resendSegmentId || !config.newsletterTokenSecret)) {
  console.error('Mail configuration is incomplete for Resend.');
  process.exitCode = 1;
}
