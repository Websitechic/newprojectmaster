
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, X } from "lucide-react";

export function EnableNotificationsPrompt() {
  const [show, setShow] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    // Check current permission
    if ("Notification" in window) {
      setPermission(Notification.permission);
      
      // Show prompt if permission is default (not yet asked)
      if (Notification.permission === "default") {
        // Wait a bit before showing to avoid overwhelming the user
        const timer = setTimeout(() => {
          setShow(true);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleEnableNotifications = async () => {
    try {
      if (typeof window.OneSignalDeferred !== 'undefined') {
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            // First check if push is supported
            const isPushSupported = OneSignal.Notifications.isPushSupported();
            if (!isPushSupported) {
              console.error("Push notifications are not supported on this browser");
              return;
            }

            // Show the native prompt
            await OneSignal.Slidedown.promptPush();
            
            // Wait a bit for user to respond
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Check permission after prompt
            const permission = await OneSignal.Notifications.permissionNative;
            console.log('Permission after prompt:', permission);
            
            if (permission === 'granted') {
              // Ensure user is opted in
              await OneSignal.User.PushSubscription.optIn();
              console.log('User opted in successfully');
              setShow(false);
            }
            
            setPermission(permission);
          } catch (innerError) {
            console.error("Error in OneSignal prompt:", innerError);
          }
        });
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    // Remember dismissal for this session
    sessionStorage.setItem('notifications-prompt-dismissed', 'true');
  };

  // Don't show if already dismissed this session
  if (sessionStorage.getItem('notifications-prompt-dismissed')) {
    return null;
  }

  // Don't show if permission already granted or denied
  if (permission !== "default" || !show) {
    return null;
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 shadow-lg z-50 border-2 border-primary">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Enable Notifications</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Stay updated with real-time messages and updates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Get instant notifications for:
        </p>
        <ul className="text-sm space-y-1 text-muted-foreground ml-4">
          <li>• Direct messages</li>
          <li>• Team chat messages</li>
          <li>• Project updates</li>
          <li>• Task assignments</li>
        </ul>
        <div className="flex gap-2">
          <Button onClick={handleEnableNotifications} className="flex-1">
            Enable Notifications
          </Button>
          <Button variant="outline" onClick={handleDismiss}>
            Later
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
