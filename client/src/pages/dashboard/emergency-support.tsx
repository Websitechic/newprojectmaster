
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Phone, Mail, MessageCircle, Clock, AlertTriangle, Shield } from "lucide-react";

export default function EmergencySupport() {
  const [location] = useLocation();

  const emergencyContacts = [
    {
      type: "Critical System Issues",
      phone: "+1 (555) 911-TECH",
      email: "emergency@websitechic.com",
      description: "Server down, security breach, data loss"
    },
    {
      type: "Website Outages",
      phone: "+1 (555) 999-SITE",
      email: "urgent@websitechic.com", 
      description: "Complete website unavailability"
    },
    {
      type: "Business Critical",
      phone: "+1 (555) 888-BIZ",
      email: "critical@websitechic.com",
      description: "Revenue-impacting issues during business hours"
    }
  ];

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Phone className="h-6 w-6 text-red-600" />
                  Emergency Support During Off Days
                </h1>
                <p className="text-muted-foreground">
                  24/7 emergency support for critical issues that cannot wait until business hours
                </p>
              </div>
            </div>

            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>Emergency support is reserved for critical issues only.</strong> Non-urgent matters should wait for regular business hours. Misuse of emergency contacts may result in additional charges.
              </AlertDescription>
            </Alert>

            {/* When to Use Emergency Support */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  When to Use Emergency Support
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold text-red-600 mb-3">🚨 Emergency Situations</h3>
                    <ul className="space-y-2 text-sm">
                      <li>• Complete website or system outage</li>
                      <li>• Security breaches or suspicious activity</li>
                      <li>• Data loss or corruption</li>
                      <li>• Payment system failures</li>
                      <li>• DNS or domain issues</li>
                      <li>• Critical bugs affecting revenue</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-600 mb-3">⏰ Can Wait Until Business Hours</h3>
                    <ul className="space-y-2 text-sm">
                      <li>• Minor visual issues</li>
                      <li>• Content updates</li>
                      <li>• Feature requests</li>
                      <li>• Training questions</li>
                      <li>• Non-critical bugs</li>
                      <li>• General inquiries</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Contacts */}
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contacts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {emergencyContacts.map((contact, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-semibold text-lg">{contact.type}</h3>
                        <Badge variant="destructive">Emergency</Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">{contact.description}</p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => window.open(`tel:${contact.phone}`)}
                          className="flex items-center gap-2"
                        >
                          <Phone className="h-4 w-4" />
                          {contact.phone}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`mailto:${contact.email}`)}
                          className="flex items-center gap-2"
                        >
                          <Mail className="h-4 w-4" />
                          {contact.email}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Response Times */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Emergency Response Times
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg bg-red-50">
                    <div className="text-2xl font-bold text-red-600 mb-2">15 min</div>
                    <div className="text-sm font-semibold mb-1">Critical Issues</div>
                    <div className="text-xs text-gray-600">System down, security breach</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg bg-orange-50">
                    <div className="text-2xl font-bold text-orange-600 mb-2">30 min</div>
                    <div className="text-sm font-semibold mb-1">High Priority</div>
                    <div className="text-xs text-gray-600">Major functionality affected</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg bg-yellow-50">
                    <div className="text-2xl font-bold text-yellow-600 mb-2">1 hour</div>
                    <div className="text-sm font-semibold mb-1">Urgent Issues</div>
                    <div className="text-xs text-gray-600">Business-impacting problems</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* What to Include */}
            <Card>
              <CardHeader>
                <CardTitle>Information to Provide</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">When contacting emergency support, please provide:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold mb-2">Required Information</h3>
                      <ul className="text-sm space-y-1">
                        <li>• Your name and company</li>
                        <li>• Contact phone number</li>
                        <li>• Nature of the emergency</li>
                        <li>• When the issue started</li>
                        <li>• Impact on your business</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Helpful Details</h3>
                      <ul className="text-sm space-y-1">
                        <li>• Error messages (screenshots)</li>
                        <li>• Steps to reproduce the issue</li>
                        <li>• Affected URLs or systems</li>
                        <li>• Number of users impacted</li>
                        <li>• Any recent changes made</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Escalation and Charges */}
            <Card className="bg-yellow-50 border-yellow-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-yellow-600" />
                  Important Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-yellow-800 mb-2">Emergency Support Charges</h3>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• Emergency support during off-hours may incur additional charges</li>
                      <li>• Support & Maintenance clients: First 2 hours included monthly</li>
                      <li>• Project clients: $150/hour minimum 1 hour charge</li>
                      <li>• False emergencies may be billed at emergency rates</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-yellow-800 mb-2">Response Guarantee</h3>
                    <p className="text-sm text-yellow-700">
                      We guarantee emergency response within stated timeframes. If we miss our response time, 
                      emergency charges will be waived for that incident.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <MessageCircle className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-2">Alternative Contact Methods</h3>
                    <p className="text-blue-800 mb-4">
                      If phone lines are busy or you prefer digital communication, you can also reach us via:
                    </p>
                    <ul className="text-blue-800 space-y-1 text-sm">
                      <li>• WhatsApp: +1 (555) 123-CHAT (for urgent visual confirmations)</li>
                      <li>• Telegram: @WebsitechicEmergency</li>
                      <li>• SMS: +1 (555) 911-TEXT (brief issue description)</li>
                    </ul>
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
