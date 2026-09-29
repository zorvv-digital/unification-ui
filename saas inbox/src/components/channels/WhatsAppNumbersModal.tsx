import { FaWhatsapp } from 'react-icons/fa';
import { channelApi, type WhatsAppCredentials } from '../../services/channelApi';
import { ChannelsModal } from './ChannelsModal';

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export function WhatsAppNumbersModal(props: Props) {
  return (
    <ChannelsModal
      {...props}
      title="WhatsApp numbers"
      icon={<FaWhatsapp className="text-[#25D366]" size={22} />}
      platforms={['whatsapp']}
      simulatedLabel="Demo number (simulated)"
      formTitle="Connect a WhatsApp Business number"
      formHelp="From your app in Meta for Developers: WhatsApp → API Setup, and App settings → Basic for the app secret."
      fields={[
        { key: 'phone_number_id', label: 'Phone number ID' },
        { key: 'waba_id', label: 'WhatsApp Business Account ID' },
        { key: 'access_token', label: 'Access token', secret: true },
        { key: 'app_secret', label: 'App secret', secret: true },
      ]}
      connect={async form => [await channelApi.connectWhatsApp(form as unknown as WhatsAppCredentials)]}
      registerHint={() => 'WhatsApp → Configuration'}
      accent={['focus:ring-[#00a884]/30 focus:border-[#00a884]', 'bg-[#00a884] hover:bg-[#008f6f]']}
    />
  );
}
