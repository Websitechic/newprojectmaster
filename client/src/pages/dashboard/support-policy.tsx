
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Clock, Phone, Mail, MessageSquare } from "lucide-react";

export default function SupportPolicy() {
  const [location] = useLocation();

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
                  <Shield className="h-6 w-6 text-green-600" />
                  Support Policy
                </h1>
                <p className="text-muted-foreground">
                  Our comprehensive support guidelines and service level agreements
                </p>
              </div>
            </div>

            {/* Support Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Support Hours
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">Standard Support</h3>
                    <p className="text-sm text-gray-600 mb-2">Monday - Friday: 9:00 AM - 6:00 PM EST</p>
                    <p className="text-sm text-gray-600">Saturday: 10:00 AM - 2:00 PM EST</p>
                    <Badge className="mt-2" variant="secondary">Response within 4 hours</Badge>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Emergency Support</h3>
                    <p className="text-sm text-gray-600 mb-2">24/7 for critical issues</p>
                    <p className="text-sm text-gray-600">Available for support & maintenance clients</p>
                    <Badge className="mt-2" variant="destructive">Response within 1 hour</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Response Time SLA */}
            <Card>
              <CardHeader>
                <CardTitle>Service Level Agreements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">Priority Level</th>
                        <th className="text-left py-2 px-4">Description</th>
                        <th className="text-left py-2 px-4">Response Time</th>
                        <th className="text-left py-2 px-4">Resolution Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2 px-4">
                          <Badge variant="destructive">Critical</Badge>
                        </td>
                        <td className="py-2 px-4">System down, security breach</td>
                        <td className="py-2 px-4">1 hour</td>
                        <td className="py-2 px-4">4 hours</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-4">
                          <Badge variant="default">High</Badge>
                        </td>
                        <td className="py-2 px-4">Major functionality affected</td>
                        <td className="py-2 px-4">4 hours</td>
                        <td className="py-2 px-4">24 hours</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 px-4">
                          <Badge variant="secondary">Medium</Badge>
                        </td>
                        <td className="py-2 px-4">Minor issues, feature requests</td>
                        <td className="py-2 px-4">8 hours</td>
                        <td className="py-2 px-4">3 days</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-4">
                          <Badge variant="outline">Low</Badge>
                        </td>
                        <td className="py-2 px-4">General inquiries, cosmetic issues</td>
                        <td className="py-2 px-4">24 hours</td>
                        <td className="py-2 px-4">7 days</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Contact Methods */}
            <Card>
              <CardHeader>
                <CardTitle>How to Reach Us</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                    <h3 className="font-semibold mb-2">In-App Messages</h3>
                    <p className="text-sm text-gray-600">Use the direct messaging feature for project-related support</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <Mail className="h-8 w-8 mx-auto mb-2 text-green-600" />
                    <h3 className="font-semibold mb-2">Email Support</h3>
                    <p className="text-sm text-gray-600">support@websitechic.com</p>
                    <p className="text-xs text-gray-500 mt-1">Non-urgent matters</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <Phone className="h-8 w-8 mx-auto mb-2 text-red-600" />
                    <h3 className="font-semibold mb-2">Emergency Hotline</h3>
                    <p className="text-sm text-gray-600">+1 (555) 123-HELP</p>
                    <p className="text-xs text-gray-500 mt-1">Critical issues only</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Support Scope */}
            <Card>
              <CardHeader>
                <CardTitle>What's Covered</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold text-green-600 mb-3">✓ Included Support</h3>
                    <ul className="space-y-2 text-sm">
                      <li>• Bug fixes and technical issues</li>
                      <li>• Performance optimization</li>
                      <li>• Security updates</li>
                      <li>• Minor content updates</li>
                      <li>• Platform guidance and training</li>
                      <li>• Backup and maintenance</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-red-600 mb-3">✗ Additional Services</h3>
                    <ul className="space-y-2 text-sm">
                      <li>• Major feature additions</li>
                      <li>• Design overhauls</li>
                      <li>• Third-party integrations</li>
                      <li>• Custom development</li>
                      <li>• Training for new staff</li>
                      <li>• Data migration projects</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Escalation Process */}
            <Card>
              <CardHeader>
                <CardTitle>Escalation Process</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold">1</div>
                    <div>
                      <h3 className="font-semibold">Initial Contact</h3>
                      <p className="text-sm text-gray-600">Submit your support request through preferred channel</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold">2</div>
                    <div>
                      <h3 className="font-semibold">Technical Team Review</h3>
                      <p className="text-sm text-gray-600">Our technical team assesses and begins resolution</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold">3</div>
                    <div>
                      <h3 className="font-semibold">Management Escalation</h3>
                      <p className="text-sm text-gray-600">For complex issues or if SLA is at risk</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold">4</div>
                    <div>
                      <h3 className="font-semibold">Executive Review</h3>
                      <p className="text-sm text-gray-600">Final escalation level for critical situations</p>
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
