
import fetch from 'node-fetch';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

interface OneSignalNotification {
  headings: { en: string };
  contents: { en: string };
  include_external_user_ids?: string[];
  include_player_ids?: string[];
  url?: string;
  data?: any;
}

export async function sendOneSignalNotification(
  userId: number | number[],
  title: string,
  message: string,
  url?: string,
  data?: any
): Promise<void> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.warn('OneSignal credentials not configured');
    return;
  }

  try {
    const userIds = Array.isArray(userId) ? userId : [userId];
    
    const notification: OneSignalNotification = {
      headings: { en: title },
      contents: { en: message },
      include_external_user_ids: userIds.map(id => id.toString()),
    };

    if (url) {
      notification.url = url;
    }

    if (data) {
      notification.data = data;
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        ...notification,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OneSignal API error:', error);
      throw new Error(`OneSignal API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('OneSignal notification sent:', result);
  } catch (error) {
    console.error('Failed to send OneSignal notification:', error);
  }
}
