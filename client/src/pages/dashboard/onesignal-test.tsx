
import { useUser } from "@/hooks/use-user";
import { useOneSignal } from "@/hooks/use-onesignal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

export default function OneSignalTest() {
  const { user } = useUser();
  
  // Initialize OneSignal for this user
  useOneSignal(user?.id);
  const [status, setStatus] = useState<{
    sdkLoaded: boolean;
    permission: string;
    subscribed: boolean;
    subscriptionId: string | null;
    userId: string | null;
  }>({
    sdkLoaded: false,
    permission: 'unknown',
    subscribed: false,
    subscriptionId: null,
    userId: null,
  });

  const checkStatus = async () => {
    console.log('[OneSignal Test] Checking status...', { userId: user?.id });
    try {
      const OneSignalModule = await import('react-onesignal');
      const OneSignal = OneSignalModule.default;

      const permission = await OneSignal.Notifications.permissionNative;
      const isPushSupported = await OneSignal.Notifications.isPushSupported();
      const subscriptionId = await OneSignal.User.PushSubscription.id;
      const optedIn = await OneSignal.User.PushSubscription.optedIn;

      console.log('[OneSignal Test] Status retrieved:', {
        permission,
        isPushSupported,
        subscriptionId,
        optedIn,
        userId: user?.id
      });

      setStatus({
        sdkLoaded: true,
        permission,
        subscribed: optedIn,
        subscriptionId,
        userId: user?.id?.toString() || null,
      });
    } catch (error) {
      console.error('[OneSignal Test] Error checking OneSignal status:', error);
      setStatus(prev => ({ 
        ...prev, 
        sdkLoaded: false,
        userId: user?.id?.toString() || null 
      }));
    }
  };

  const requestPermission = async () => {
    try {
      const OneSignalModule = await import('react-onesignal');
      const OneSignal = OneSignalModule.default;

      await OneSignal.Slidedown.promptPush();
      
      // Wait and check status
      setTimeout(checkStatus, 2000);
    } catch (error) {
      console.error('Error requesting permission:', error);
    }
  };

  const optIn = async () => {
    try {
      const OneSignalModule = await import('react-onesignal');
      const OneSignal = OneSignalModule.default;

      await OneSignal.User.PushSubscription.optIn();
      
      setTimeout(checkStatus, 1000);
    } catch (error) {
      console.error('Error opting in:', error);
    }
  };

  useEffect(() => {
    if (user?.id) {
      console.log('[OneSignal Test] User authenticated, checking status');
      checkStatus();
      const interval = setInterval(checkStatus, 5000);
      return () => clearInterval(interval);
    } else {
      console.log('[OneSignal Test] No user authenticated yet');
    }
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">OneSignal Test & Debug</h1>
        <p className="text-muted-foreground">
          Check OneSignal subscription status and debug issues
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>OneSignal Status</CardTitle>
          <CardDescription>Current subscription and permission status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                ⚠️ You must be logged in to test OneSignal
              </p>
            </div>
          )}
          
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4 mb-4">
            <p className="text-sm font-medium mb-2">Configuration</p>
            <p className="text-xs text-muted-foreground break-all">
              App ID: {import.meta.env.VITE_ONESIGNAL_APP_ID || 'NOT SET'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">SDK Loaded</p>
              <Badge variant={status.sdkLoaded ? "default" : "destructive"}>
                {status.sdkLoaded ? "Yes" : "No"}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium">Permission</p>
              <Badge variant={
                status.permission === 'granted' ? "default" :
                status.permission === 'denied' ? "destructive" : "secondary"
              }>
                {status.permission}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium">Subscribed</p>
              <Badge variant={status.subscribed ? "default" : "destructive"}>
                {status.subscribed ? "Yes" : "No"}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium">User ID</p>
              <p className="text-sm text-muted-foreground">{status.userId || "Not set"}</p>
            </div>

            <div className="col-span-2">
              <p className="text-sm font-medium">Subscription ID</p>
              <p className="text-sm text-muted-foreground break-all">
                {status.subscriptionId || "Not subscribed"}
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={checkStatus}>Refresh Status</Button>
            <Button onClick={requestPermission} variant="outline">
              Request Permission
            </Button>
            <Button onClick={optIn} variant="outline">
              Opt In
            </Button>
          </div>

          <div className="pt-4 border-t">
            <h3 className="text-sm font-semibold mb-2">Troubleshooting Steps:</h3>
            <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
              <li>Make sure browser allows notifications (check browser settings)</li>
              <li>Click "Request Permission" and allow notifications</li>
              <li>If permission is granted but not subscribed, click "Opt In"</li>
              <li>Check browser console for detailed logs</li>
              <li>Verify VITE_ONESIGNAL_APP_ID is set correctly</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
