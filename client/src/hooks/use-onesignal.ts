
import { useEffect, useRef } from 'react';

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export function useOneSignal(userId?: number) {
  const isProcessing = useRef(false);

  useEffect(() => {
    const appId = (import.meta.env.VITE_ONESIGNAL_APP_ID as string) || '';
    
    console.log('[OneSignal] Hook triggered');
    console.log('[OneSignal] User ID:', userId);
    console.log('[OneSignal] App ID configured:', !!appId && appId !== 'YOUR_ONESIGNAL_APP_ID');
    
    if (!appId || appId === 'YOUR_ONESIGNAL_APP_ID') {
      console.error('[OneSignal] ❌ App ID not configured');
      return;
    }

    if (!userId) {
      console.log('[OneSignal] ⏸️ Waiting for user ID');
      return;
    }

    // Prevent concurrent processing but allow re-processing on new login
    if (isProcessing.current) {
      console.log('[OneSignal] ⏸️ Already processing, skipping...');
      return;
    }

    const initializeOneSignal = async () => {
      try {
        isProcessing.current = true;
        console.log('[OneSignal] 🚀 Starting subscription process for user:', userId);
        
        // Enhanced mobile and browser detection
        const userAgent = navigator.userAgent;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
        const isSafari = /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent);
        const isAndroid = /Android/i.test(userAgent);
        
        console.log('[OneSignal] 📱 Device Info:', {
          isMobile,
          isIOS,
          isSafari,
          isAndroid,
          userAgent: userAgent.substring(0, 50) + '...'
        });
        
        // Check network connectivity
        if (!navigator.onLine) {
          console.warn('[OneSignal] 🌐 Device is offline, waiting for connection...');
          await new Promise(resolve => {
            const onlineHandler = () => {
              console.log('[OneSignal] 🌐 Device is now online');
              window.removeEventListener('online', onlineHandler);
              resolve(undefined);
            };
            window.addEventListener('online', onlineHandler);
            // Timeout after 30 seconds
            setTimeout(() => {
              window.removeEventListener('online', onlineHandler);
              resolve(undefined);
            }, 30000);
          });
        }
        
        console.log('[OneSignal] 🌐 Network status:', navigator.onLine ? 'online' : 'offline');
        
        // iOS Safari specific handling
        if (isIOS && isSafari) {
          console.log('[OneSignal] 🍎 iOS Safari detected - checking compatibility');
          
          // Check iOS version
          const iOSVersionMatch = userAgent.match(/OS (\d+)_/);
          if (iOSVersionMatch) {
            const iOSVersion = parseInt(iOSVersionMatch[1]);
            console.log('[OneSignal] 🍎 iOS Version:', iOSVersion);
            
            if (iOSVersion < 16) {
              console.error('[OneSignal] ❌ iOS version', iOSVersion, '< 16. Push notifications require iOS 16.4+');
              console.error('[OneSignal] 💡 Please update to iOS 16.4 or later for push notification support');
              isProcessing.current = false;
              return;
            }
          }
        }
        
        // Check service worker support
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.getRegistration();
            console.log('[OneSignal] 👷 Service Worker status:', registration ? 'registered' : 'not registered');
            
            if (!registration) {
              console.log('[OneSignal] 👷 Attempting to register service worker...');
              try {
                await navigator.serviceWorker.register('/OneSignalSDKWorker.js');
                console.log('[OneSignal] ✅ Service worker registered successfully');
              } catch (swRegError) {
                console.warn('[OneSignal] ⚠️ Service worker registration failed:', swRegError);
                // Continue anyway, OneSignal will handle this
              }
            }
          } catch (swError) {
            console.warn('[OneSignal] ⚠️ Service worker check error:', swError);
          }
        } else {
          console.error('[OneSignal] ❌ Service workers not supported in this browser');
          if (isIOS && !isSafari) {
            console.error('[OneSignal] 💡 iOS Chrome/Firefox use Safari WebView. Try Safari browser instead.');
          }
        }
        
        // Wait for OneSignal to be available - adaptive retry strategy
        const maxRetries = isMobile ? (isIOS ? 40 : 30) : 10;
        const baseRetryDelay = isMobile ? (isIOS ? 1500 : 1000) : 500;
        let retries = 0;
        let currentDelay = baseRetryDelay;
        
        console.log('[OneSignal] ⏳ Waiting for OneSignal SDK (max', maxRetries, 'attempts, base delay', baseRetryDelay, 'ms)');
        
        while (typeof window.OneSignalDeferred === 'undefined' && retries < maxRetries) {
          console.log('[OneSignal] ⏳ Waiting for OneSignal SDK to load... (attempt', retries + 1, 'of', maxRetries, ', delay:', currentDelay, 'ms)');
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          
          // Exponential backoff with cap
          currentDelay = Math.min(currentDelay * 1.2, 3000);
          retries++;
        }
        
        if (typeof window.OneSignalDeferred === 'undefined') {
          const totalWaitTime = (maxRetries * baseRetryDelay) / 1000;
          console.error('[OneSignal] ❌ OneSignal SDK failed to load after', maxRetries, 'attempts (~', totalWaitTime, 'seconds)');
          console.error('[OneSignal] 💡 Possible causes:');
          console.error('[OneSignal]    - Network connectivity issues');
          console.error('[OneSignal]    - Script blocked by ad blocker or firewall');
          console.error('[OneSignal]    - CDN unavailable');
          console.error('[OneSignal]    - Browser compatibility issues');
          
          // Store failure in localStorage for debugging
          try {
            localStorage.setItem('onesignal_load_failed', Date.now().toString());
            localStorage.setItem('onesignal_load_failed_device', isMobile ? (isIOS ? 'iOS' : 'Android') : 'Desktop');
          } catch (e) {
            // Ignore localStorage errors
          }
          
          isProcessing.current = false;
          return;
        }
        
        console.log('[OneSignal] ✅ OneSignal SDK loaded successfully after', retries, 'retries', '(total wait:', Math.round(retries * baseRetryDelay / 1000), 'seconds)');
        
        if (!isInitialized && !initPromise) {
          console.log('[OneSignal] 📦 Initializing SDK...');
          
          initPromise = new Promise((resolve, reject) => {
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async (OneSignal: any) => {
              try {
                await OneSignal.init({
                  appId: appId,
                  allowLocalhostAsSecureOrigin: true,
                  notifyButton: {
                    enable: false,
                  },
                });
                
                isInitialized = true;
                console.log('[OneSignal] ✅ SDK initialized successfully');
                resolve();
              } catch (error) {
                console.error('[OneSignal] ❌ Initialization failed:', error);
                isProcessing.current = false;
                reject(error);
              }
            });
          });
          
          await initPromise;
        } else if (initPromise) {
          console.log('[OneSignal] ⏳ Waiting for existing initialization...');
          await initPromise;
        }
        
        // Wait for user to be fully authenticated - longer wait for mobile
        const authWaitTime = isMobile ? 2000 : 1000;
        console.log('[OneSignal] ⏳ Waiting', authWaitTime, 'ms for authentication to stabilize...');
        await new Promise(resolve => setTimeout(resolve, authWaitTime));
        
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            // Set external user ID for this user using the recommended login method
            console.log('[OneSignal] 👤 Setting external user ID:', userId);
            
            // First, ensure any previous user is logged out
            try {
              await OneSignal.logout();
              console.log('[OneSignal] 🔄 Logged out any previous user');
            } catch (logoutError) {
              console.log('[OneSignal] ℹ️ No previous user to logout or logout failed:', logoutError);
            }
            
            // CRITICAL: Wait even longer for logout to fully complete before login
            console.log('[OneSignal] ⏳ Waiting 2.5 seconds for logout to complete...');
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            // Use login method which handles aliases automatically
            try {
              await OneSignal.login(userId.toString());
              console.log('[OneSignal] ✅ Login method succeeded');
              
              // Wait for login to fully process
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Ensure the alias is properly set
              await OneSignal.User.addAlias("external_id", userId.toString());
              console.log('[OneSignal] ✅ External ID alias added');
            } catch (loginError) {
              console.warn('[OneSignal] ⚠️ Login failed, trying direct alias:', loginError);
              try {
                await OneSignal.User.addAlias("external_id", userId.toString());
                console.log('[OneSignal] ✅ External ID alias set successfully');
              } catch (aliasError) {
                console.error('[OneSignal] ❌ Failed to set external ID:', aliasError);
                throw aliasError;
              }
            }
            
            console.log('[OneSignal] ✅ External user ID set successfully');
            
            // Check if push is supported
            const isPushSupported = OneSignal.Notifications.isPushSupported();
            console.log('[OneSignal] 📱 Push supported:', isPushSupported);
            
            if (!isPushSupported) {
              console.warn('[OneSignal] ⚠️ Push notifications not supported on this browser');
              hasSubscribed.current = true; // Mark as processed to avoid retries
              return;
            }
            
            // Check current permission state
            let permission;
            try {
              permission = await OneSignal.Notifications.permissionNative;
              console.log('[OneSignal] 🔐 Native permission:', permission);
            } catch (permError) {
              console.error('[OneSignal] ❌ Error getting permission:', permError);
              return;
            }
            
            // Handle permission states
            if (permission === 'default') {
              // Permission not yet requested - DON'T auto-prompt
              console.log('[OneSignal] 🔔 Permission not yet requested');
              console.log('[OneSignal] 💡 User can enable notifications from their profile or settings');
              
              // Store that we can prompt later if needed
              try {
                localStorage.setItem(`onesignal_can_prompt_${userId}`, 'true');
              } catch (e) {
                console.warn('[OneSignal] Could not set localStorage');
              }
            } else if (permission === 'granted') {
              // Permission already granted - ALWAYS ensure subscription is active on login
              console.log('[OneSignal] ✅ Permission granted - ensuring subscription...');
              
              try {
                // Always opt in on login to ensure fresh subscription
                console.log('[OneSignal] 🔄 Opting in user for this session...');
                await OneSignal.User.PushSubscription.optIn();
                console.log('[OneSignal] ✅ User opted in successfully');
              } catch (optInError) {
                console.error('[OneSignal] ❌ Error opting in user:', optInError);
              }
            } else if (permission === 'denied') {
              console.warn('[OneSignal] ⛔ Notifications blocked by user - cannot subscribe');
              console.warn('[OneSignal] 💡 User needs to enable notifications in browser settings');
            }
            
            // Log final subscription status
            try {
              const subscriptionId = await OneSignal.User.PushSubscription.id;
              const token = await OneSignal.User.PushSubscription.token;
              const optedIn = await OneSignal.User.PushSubscription.optedIn;
              
              console.log('[OneSignal] 📊 Final Status:');
              console.log('   - External User ID:', userId);
              console.log('   - Subscription ID:', subscriptionId ? subscriptionId.substring(0, 8) + '...' : 'None');
              console.log('   - Has Token:', !!token);
              console.log('   - Opted In:', optedIn);
              
              // Store subscription status
              if (optedIn && subscriptionId) {
                try {
                  localStorage.setItem(`onesignal_subscribed_${userId}`, 'true');
                } catch (e) {
                  console.warn('[OneSignal] Could not set localStorage');
                }
              }
            } catch (err) {
              console.log('[OneSignal] ℹ️ Could not get final status:', err);
            }
          } catch (error) {
            console.error('[OneSignal] ❌ Setup error:', error);
          } finally {
            isProcessing.current = false;
          }
        });
        
      } catch (error) {
        console.error('[OneSignal] ❌ Initialization error:', error);
        console.error('[OneSignal] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        isProcessing.current = false;
      }
    };

    initializeOneSignal();
    
    // Cleanup function
    return () => {
      console.log('[OneSignal] Hook cleanup for user:', userId);
      
      // When user changes, logout from OneSignal to remove the old user association
      if (typeof window.OneSignalDeferred !== 'undefined' && userId) {
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          try {
            console.log('[OneSignal] 🔄 Cleanup - Logging out previous user:', userId);
            
            // Detect mobile device
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            console.log('[OneSignal] 📱 Cleanup on mobile:', isMobile);
            
            // First opt out from push
            try {
              await OneSignal.User.PushSubscription.optOut();
              console.log('[OneSignal] ✅ Cleanup - Opted out from push');
              
              // Extra delay for mobile
              if (isMobile) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (optOutError) {
              console.log('[OneSignal] ℹ️ Cleanup - OptOut not needed:', optOutError);
            }
            
            // For mobile, also remove aliases
            if (isMobile) {
              try {
                await OneSignal.User.removeAlias("external_id");
                console.log('[OneSignal] 📱 Cleanup - Removed external ID alias');
                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (aliasError) {
                console.log('[OneSignal] ℹ️ Cleanup - Alias removal not needed:', aliasError);
              }
            }
            
            // Wait for opt out to process
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then logout to dissociate user
            await OneSignal.logout();
            console.log('[OneSignal] ✅ Cleanup - Previous user logged out');
            
            // Longer delay for mobile to ensure cleanup completes
            const cleanupDelay = isMobile ? 1500 : 1000;
            await new Promise(resolve => setTimeout(resolve, cleanupDelay));
          } catch (error) {
            console.warn('[OneSignal] ⚠️ Error in cleanup logout:', error);
          }
        });
      }
      
      // Reset processing flag when user changes
      isProcessing.current = false;
    };
  }, [userId]);
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    OneSignalDeferred: Array<(oneSignal: any) => void>;
  }
}
