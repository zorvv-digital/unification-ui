import { FaFacebookMessenger } from 'react-icons/fa';
import { channelApi, type MetaCredentials } from '../../services/channelApi';
import { ChannelsModal } from './ChannelsModal';

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export function MetaPagesModal(props: Props) {
  return (
    <ChannelsModal
      {...props}
      title="Facebook Page & Instagram"
      icon={<FaFacebookMessenger className="text-[#0084ff]" size={22} />}
      platforms={['messenger', 'instagram']}
      simulatedLabel="Demo channel (simulated)"
      formTitle="Connect or reconnect a Facebook Page"
      formHelp="A linked Instagram professional account is connected too. Get a Page access token with messaging permissions in Meta for Developers (Messenger → Settings), and the app secret from App settings → Basic."
      fields={[
        { key: 'page_id', label: 'Page ID' },
        { key: 'page_access_token', label: 'Page access token', secret: true },
        { key: 'app_secret', label: 'App secret', secret: true },
      ]}
      connect={form => channelApi.connectMeta(form as unknown as MetaCredentials)}
      registerHint={c => (c.platform === 'instagram' ? 'Instagram → Webhooks' : 'Messenger → Webhooks (Page)')}
      accent={['focus:ring-[#0084ff]/30 focus:border-[#0084ff]', 'bg-[#0084ff] hover:bg-[#0073e6]']}
    />
  );
}
