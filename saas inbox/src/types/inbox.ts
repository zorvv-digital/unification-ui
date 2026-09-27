export interface Message {
  id: string;
  provider: 'gmail';
  sender: string;
  subject: string;
  body: string;
  timestamp: number;
  isRead: boolean;
}
