// Discord plugin module implements accepted-message passive capture behavior.
import type { DiscordSenderIdentity } from "./sender-identity.js";

const AGENT_WORKER_CAPTURE_TIMEOUT_MS = 3_000;

export type AgentWorkerDiscordCaptureOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export type DiscordPassiveCaptureAdmission = {
  guildId?: string | null;
  sourceChannelId: string;
  resolvedMessageId?: string;
  resolvedContent?: string;
  authorId?: string;
  authorIsBot?: boolean;
  authorName?: string;
  sender: DiscordSenderIdentity;
  threadChannel: unknown | null;
  threadParentId?: string;
};

type CaptureDiscordMessageParams = DiscordPassiveCaptureAdmission & {
  capture?: AgentWorkerDiscordCaptureOptions;
  messageId: string;
  content: string;
};

export async function captureAcceptedAgentWorkerDiscordMessage(
  params: CaptureDiscordMessageParams,
): Promise<void> {
  const content = params.content.trim();
  const env = params.capture?.env ?? process.env;
  const fetchImpl = params.capture?.fetchImpl ?? fetch;
  const bridgeToken = env.AGENT_WORKER_BRIDGE_TOKEN?.trim();
  const baseUrl = env.AGENT_WORKER_BASE_URL?.trim().replace(/\/+$/, "");
  const workspaceKey = env.AGENT_WORKER_WORKSPACE_KEY?.trim();
  const guildId = params.guildId?.trim();
  const sourceChannelId = params.sourceChannelId.trim();
  const messageId = params.messageId.trim();
  const isThread = Boolean(params.threadChannel);
  const parentChannelId = params.threadParentId?.trim();

  if (
    !content ||
    (params.authorIsBot === true && !params.sender.isPluralKit) ||
    !guildId ||
    !sourceChannelId ||
    !messageId ||
    !bridgeToken ||
    !baseUrl ||
    !workspaceKey ||
    (isThread && !parentChannelId)
  ) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_WORKER_CAPTURE_TIMEOUT_MS);

  try {
    await fetchImpl(`${baseUrl}/api/conversation-capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-worker-bridge-token": bridgeToken,
      },
      body: JSON.stringify({
        platform: "discord",
        workspace_key: workspaceKey,
        guild_id: guildId,
        channel_id: isThread ? parentChannelId : sourceChannelId,
        channel_type: isThread ? "thread" : "text",
        thread_id: isThread ? sourceChannelId : undefined,
        message_id: messageId,
        author_id: params.authorId ?? params.sender.id,
        author_name: params.authorName ?? params.sender.label,
        content,
        task_candidate: false,
        reply_required: false,
      }),
      signal: controller.signal,
    });
  } catch {
    // Passive capture is observability for accepted room traffic; it must not
    // change Discord admission, mention gating, queueing, or reply behavior.
  } finally {
    clearTimeout(timeout);
  }
}
