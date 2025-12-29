
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
  include_aliases?: {
    external_id: string[];
  };
  target_channel?: string;
  include_player_ids?: string[];
  url?: string;
  data?: any;
  filters?: Array<{ 
    field?: string; 
    relation?: string; 
    value?: string;
    operator?: string;
    filters?: Array<{ field: string; relation: string; value: string }>;
  }>;
}

export async function sendOneSignalNotification(
  userId: number | number[],
  title: string,
  message: string,
  url?: string,
  data?: any
): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           ONESIGNAL NOTIFICATION SERVICE CALLED                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('📲 Input Parameters:');
  console.log(`   - User ID(s): ${Array.isArray(userId) ? userId.join(', ') : userId}`);
  console.log(`   - Title: "${title}"`);
  console.log(`   - Message Preview: "${message.substring(0, 50)}..."`);
  console.log(`   - URL: ${url || 'none'}`);
  console.log(`   - Data: ${data ? JSON.stringify(data) : 'none'}`);
  
  console.log('\n🔧 Configuration Check:');
  console.log(`   - App ID Exists: ${!!ONESIGNAL_APP_ID}`);
  console.log(`   - App ID Valid: ${ONESIGNAL_APP_ID !== 'YOUR_ONESIGNAL_APP_ID'}`);
  console.log(`   - App ID Preview: ${ONESIGNAL_APP_ID ? ONESIGNAL_APP_ID.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`   - App ID Length: ${ONESIGNAL_APP_ID?.length || 0}`);
  console.log(`   - REST API Key Exists: ${!!ONESIGNAL_REST_API_KEY}`);
  console.log(`   - REST API Key Valid: ${ONESIGNAL_REST_API_KEY !== 'YOUR_ONESIGNAL_REST_API_KEY'}`);
  console.log(`   - REST API Key Preview: ${ONESIGNAL_REST_API_KEY ? ONESIGNAL_REST_API_KEY.substring(0, 12) + '...' : 'NOT SET'}`);
  console.log(`   - REST API Key Length: ${ONESIGNAL_REST_API_KEY?.length || 0}`);
  
  if (!ONESIGNAL_APP_ID || ONESIGNAL_APP_ID === 'YOUR_ONESIGNAL_APP_ID') {
    console.error('❌ OneSignal App ID not configured - ABORTING');
    console.error('   Please set ONESIGNAL_APP_ID in Replit Secrets');
    return;
  }
  
  if (!ONESIGNAL_REST_API_KEY || ONESIGNAL_REST_API_KEY === 'YOUR_ONESIGNAL_REST_API_KEY') {
    console.error('❌ OneSignal REST API Key not configured - ABORTING');
    console.error('   Please set ONESIGNAL_REST_API_KEY in Replit Secrets');
    return;
  }
  
  console.log('✅ Configuration valid - proceeding with API call...');

  try {
    const userIds = Array.isArray(userId) ? userId : [userId];
    
    console.log('📊 Processing user IDs:');
    console.log('   - Input:', userIds);
    console.log('   - Input types:', userIds.map(id => typeof id));
    
    // Filter out invalid user IDs and ensure they're numbers
    const validUserIds = userIds
      .filter(id => id !== null && id !== undefined && !isNaN(Number(id)) && Number(id) > 0)
      .map(id => Number(id));
    
    if (validUserIds.length === 0) {
      console.error('❌ No valid user IDs provided');
      console.error('   - Original input:', userIds);
      console.error('   - After filtering:', validUserIds);
      return;
    }
    
    console.log('✓ Valid user IDs:', validUserIds.length, 'out of', userIds.length);
    console.log('✓ Valid user IDs array:', validUserIds);
    
    const notification: OneSignalNotification = {
      headings: { en: title },
      contents: { en: message },
      // Use include_aliases with target_channel for OneSignal Web SDK
      include_aliases: {
        external_id: validUserIds.map(id => id.toString())
      },
      target_channel: 'push'
    };

    if (url) {
      notification.url = url;
      console.log('   - URL set:', url);
    }

    if (data) {
      notification.data = data;
      console.log('   - Data set:', JSON.stringify(data));
    }

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      ...notification,
    };

    console.log('\n📤 Preparing OneSignal API Request:');
    console.log('   - Target User IDs:', validUserIds);
    console.log('   - Title:', title);
    console.log('   - Message Preview:', message.substring(0, 50) + '...');
    console.log('   - Payload Keys:', Object.keys(payload));
    console.log('   - Include Aliases:', JSON.stringify(notification.include_aliases));
    console.log('   - Target Channel:', notification.target_channel);
    console.log('   - Full Payload:', JSON.stringify(payload, null, 2));

    console.log('\n🌐 Making HTTP Request to OneSignal API...');
    console.log('   - Endpoint: https://onesignal.com/api/v1/notifications');
    console.log('   - Method: POST');
    console.log('   - Auth Header: Basic ' + ONESIGNAL_REST_API_KEY.substring(0, 12) + '...');
    
    const startTime = Date.now();
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const responseTime = Date.now() - startTime;

    console.log('\n📥 OneSignal API Response Received:');
    console.log(`   - Response Time: ${responseTime}ms`);
    console.log(`   - Status Code: ${response.status}`);
    console.log(`   - Status Text: ${response.statusText}`);
    console.log(`   - Success: ${response.ok}`);

    const responseText = await response.text();
    console.log('\n📄 Response Body:');
    console.log(responseText);

    if (!response.ok) {
      console.error('\n❌❌❌ ONESIGNAL API ERROR ❌❌❌');
      console.error('   - HTTP Status:', response.status);
      console.error('   - Status Text:', response.statusText);
      console.error('   - Response Body:', responseText);
      console.error('   - User IDs Attempted:', validUserIds);
      console.error('   - Payload Sent:', JSON.stringify(payload, null, 2));
      console.error('═══════════════════════════════════════════════════════════════\n');
      throw new Error(`OneSignal API error: ${response.status} - ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('\n❌ Failed to parse OneSignal response:', parseError);
      console.error('   - Response text:', responseText);
      throw new Error('Invalid JSON response from OneSignal');
    }
    
    // Check if there are errors
    if (result.errors && result.errors.length > 0) {
      const hasSubscriberError = result.errors.some((err: string) => 
        err.includes('not subscribed') || err.includes('No valid player IDs')
      );
      
      if (hasSubscriberError) {
        console.log('\n⚠️⚠️⚠️ ONESIGNAL: NO SUBSCRIBERS FOUND ⚠️⚠️⚠️');
        console.log('   - This means users have not enabled push notifications');
        console.log('   - Users need to:');
        console.log('     1. Grant browser notification permission');
        console.log('     2. Be logged into the app');
        console.log('     3. Have OneSignal SDK properly initialized');
        console.log('   - Notification ID:', result.id || 'None');
        console.log('   - Attempted User IDs:', validUserIds);
        console.log('   - Errors:', result.errors);
        console.log('═══════════════════════════════════════════════════════════════\n');
        return; // Don't throw error for no subscribers
      } else {
        console.error('\n❌❌❌ ONESIGNAL API ERROR ❌❌❌');
        console.error('   - Errors:', result.errors);
        console.error('   - User IDs:', validUserIds);
        console.error('═══════════════════════════════════════════════════════════════\n');
        return;
      }
    }
    
    console.log('\n✅✅✅ ONESIGNAL NOTIFICATION SENT SUCCESSFULLY ✅✅✅');
    console.log('   - Notification ID:', result.id);
    console.log('   - Recipients Count:', result.recipients);
    console.log('   - User IDs:', validUserIds);
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n❌❌❌ ONESIGNAL SERVICE EXCEPTION ❌❌❌');
    console.error('   - Error Type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('   - Error Message:', error instanceof Error ? error.message : error);
    console.error('   - Stack Trace:', error instanceof Error ? error.stack : 'No stack available');
    console.error('═══════════════════════════════════════════════════════════════\n');
    throw error; // Re-throw to let caller handle
  }
}
