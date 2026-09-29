import { Mail } from 'lucide-react';
import { channelApi } from '../../services/channelApi';
import { ChannelsModal } from './ChannelsModal';

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export function GmailModal(props: Props) {
  return (
    <ChannelsModal
      {...props}
      title="Gmail"
      icon={<Mail className="text-red-500" size={22} />}
      platforms={['gmail']}
      simulatedLabel="Demo mailbox (simulated)"
      formTitle="Connect a Gmail account"
      formHelp="Sign in with Google and allow reading and sending email. New customer emails arrive in the inbox within a minute or two, one conversation per thread."
      fields={[]}
      connectLabel="Connect with Google"
      busyLabel="Opening Google…"
      connect={async () => {
        const { authorize_url } = await channelApi.authorizeGmail();
        window.location.assign(authorize_url);
        return [];
      }}
      registerHint={() => ''}
      accent={['focus:ring-gray-900/20 focus:border-gray-900', 'bg-gray-900 hover:bg-gray-800']}
    />
  );
}
