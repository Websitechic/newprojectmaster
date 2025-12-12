
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

// Log configuration on startup with validation
const isAppIdValid = !!ONESIGNAL_APP_ID && ONESIGNAL_APP_ID !== 'YOUR_ONESIGNAL_APP_ID' && ONESIGNAL_APP_ID.length > 0;
const isApiKeyValid = !!ONESIGNAL_REST_API_KEY && ONESIGNAL_REST_API_KEY !== 'YOUR_ONESIGNAL_REST_API_KEY' && ONESIGNAL_REST_API_KEY.length > 0;

console.log('🔧 OneSignal Configuration:', {
  appIdConfigured: isAppIdValid,
  restApiKeyConfigured: isApiKeyValid,
  appIdPreview: ONESIGNAL_APP_ID ? ONESIGNAL_APP_ID.substring(0, 8) + '...' : 'NOT_SET',
  restApiKeyPreview: ONESIGNAL_REST_API_KEY ? ONESIGNAL_REST_API_KEY.substring(0, 12) + '...' : 'NOT_SET',
  configurationValid: isAppIdValid && isApiKeyValid
});

if (!isAppIdValid || !isApiKeyValid) {
  console.warn('⚠️⚠️⚠️ OneSignal is NOT properly configured! Notifications will not be sent. ⚠️⚠️⚠️');
}

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
  console.log('📲 sendOneSignalNotification called:', { userId, title, messagePreview: message.substring(0, 50) });
  
  if (!ONESIGNAL_APP_ID || ONESIGNAL_APP_ID === 'YOUR_ONESIGNAL_APP_ID') {
    console.warn('⚠️ OneSignal App ID not configured - skipping notification');
    return;
  }
  
  if (!ONESIGNAL_REST_API_KEY || ONESIGNAL_REST_API_KEY === 'YOUR_ONESIGNAL_REST_API_KEY') {
    console.warn('⚠️ OneSignal REST API Key not configured - skipping notification');
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

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      ...notification,
    };

    console.log('📤 Sending OneSignal notification:', {
      userIds: userIds,
      title,
      messagePreview: message.substring(0, 50),
      payloadKeys: Object.keys(payload),
      payload: JSON.stringify(payload, null, 2)
    });

    console.log('🌐 Making request to OneSignal API...');
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('📥 OneSignal API response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    const responseText = await response.text();
    console.log('📥 OneSignal API response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText.substring(0, 500)
    });

    if (!response.ok) {
      console.error('❌ OneSignal API error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });
      throw new Error(`OneSignal API error: ${response.status} - ${responseText}`);
    }

    const result = JSON.parse(responseText);
    console.log('✅ OneSignal notification sent successfully:', {
      id: result.id,
      recipients: result.recipients,
      errors: result.errors
    });
  } catch (error) {
    console.error('❌ Failed to send OneSignal notification:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error; // Re-throw to let caller handle
  }
}
