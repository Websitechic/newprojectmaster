import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Phone } from "lucide-react";

export default function EmergencySupport() {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-hidden">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col min-h-screen w-full min-w-0">
        <Header />
        <div className="flex-1 overflow-auto p-2 sm:p-4 lg:p-6 w-full">
          <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Phone className="h-6 w-6 text-red-600" />
                  Emergency During Off Days
                </h1>
              </div>
            </div>

            <Card>
              <CardContent className="p-8">
                <div className="text-center space-y-4">
                  <p className="text-lg leading-relaxed">
                    Dear Client,
                  </p>
                  <p className="text-lg leading-relaxed">
                    We understand you're experiencing an urgent situation. Kindly reach out to the contact below for immediate assistance:
                  </p>
                  <div className="my-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xl font-semibold text-blue-900">
                      Operations Manager – 07069965611
                    </p>
                  </div>
                  <p className="text-lg leading-relaxed">
                    Please bear with us, as our response time may be slightly delayed while we work to rearrange our schedule to attend to your needs. We appreciate your patience and understanding.
                  </p>
                  <p className="text-lg leading-relaxed mt-6">
                    Warm regards,<br />
                    <span className="font-semibold">The Websitechic Team</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}