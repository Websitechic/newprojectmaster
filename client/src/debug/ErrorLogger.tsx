import { useEffect } from 'react';

/**
 * A component that adds global error handlers to track unhandled errors and rejections
 * This is for debugging purposes only
 */
export function ErrorLogger() {
  useEffect(() => {
    // Handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('UNHANDLED PROMISE REJECTION:', event.reason);
      
      // Try to extract more information from the error
      if (event.reason instanceof Error) {
        console.error('Error message:', event.reason.message);
        console.error('Error stack:', event.reason.stack);
      }
      
      // If it's a fetch error or similar, try to log more details
      if (event.reason?.name === 'TypeError' && event.reason?.message?.includes('fetch')) {
        console.error('Fetch error details:', {
          message: event.reason.message,
          stack: event.reason.stack,
        });
      }
    };

    // Handler for uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('UNCAUGHT ERROR:', event.error);
      console.error('Error message:', event.message);
      console.error('Error stack:', event.error?.stack);
    };

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    // Clean up event listeners
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null; // This component does not render anything
}