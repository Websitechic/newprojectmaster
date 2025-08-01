
import { useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Phone } from "lucide-react";

export default function ReachUsPage() {
  const [location] = useLocation();

  const handleWhatsAppClick = () => {
    // Replace with actual product manager's WhatsApp number
    const phoneNumber = "+1234567890"; // Update this with the actual number
    const message = encodeURIComponent("Hello, I need assistance with my project.");
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentPath={location} />
      
      <div className="flex-1 flex flex-col">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col space-y-6 max-w-2xl mx-auto">
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-2">Reach Out to Product Manager</h1>
              <p className="text-muted-foreground">
                Connect directly with our product manager via WhatsApp for immediate support
              </p>
            </div>

            <Card className="text-center">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-green-100 rounded-full">
                    <MessageCircle className="h-12 w-12 text-green-600" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold">WhatsApp Support</h2>
                <p className="text-muted-foreground">
                  Get instant help and quick responses from our product manager
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Available for:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Project updates and status inquiries</li>
                      <li>Technical support and guidance</li>
                      <li>Feature requests and feedback</li>
                      <li>General project management questions</li>
                    </ul>
                  </div>
                  
                  <Button 
                    onClick={handleWhatsAppClick}
                    className="w-full bg-green-500 hover:bg-green-600 text-white"
                    size="lg"
                  >
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Contact on WhatsApp
                  </Button>
                  
                  <div className="text-xs text-muted-foreground mt-4">
                    <p>Business Hours: Monday - Friday, 9:00 AM - 6:00 PM</p>
                    <p>Response Time: Usually within 30 minutes during business hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Alternative Contact Methods</h3>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Phone Support</p>
                      <p className="text-sm text-muted-foreground">+1 (555) 123-4567</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Email Support</p>
                      <p className="text-sm text-muted-foreground">support@websitechic.com</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
