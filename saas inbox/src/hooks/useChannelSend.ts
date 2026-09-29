import { useEffect, useState } from 'react';
import { apiService, useMessaging } from '../context/MessagingContext';
import { channelApi, type Channel } from '../services/channelApi';
import type { Conversation } from '../types/messaging';

export const TOKEN_EXPIRED = "This Page's access token expired or was revoked. Reconnect the Page from the ⋯ menu.";

/**
 * Sending for a channel page: loads the workspace's channels, shows send errors (e.g. the closed 24-hour window),
 * and notices a failed send that disconnected the channel.
 */
export function useChannelSend(conversation: Conversation | undefined) {
  const { sendMessage } = useMessaging();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sendError, setSendError] = useState('');

  const reload = async () => {
    if (!apiService) return [];
    const all = await channelApi.listChannels().catch(() => channels);
    setChannels(all);
    return all;
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => setSendError(''), [conversation?.id]);

  const channel = channels.find(c => c.id === conversation?.channelId);

  const send = async (content: string): Promise<boolean> => {
    if (!conversation) return false;
    try {
      const message = await sendMessage(conversation.id, content, 'text');
      if (message.status === 'failed') {
        const current = (await reload()).find(c => c.id === conversation.channelId);
        setSendError(current?.status === 'disconnected' ? TOKEN_EXPIRED : 'Meta could not deliver this message.');
        return false;
      }
      setSendError('');
      return true;
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send');
      return false;
    }
  };

  return { channel, sendError, send, reload, isSimulated: !channel || channel.adapter_type === 'simulated' };
}
