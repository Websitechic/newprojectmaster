
import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";

export default function RateUs() {
  const [location] = useLocation();

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-center">
                  Rate Us
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <p className="text-lg mb-6">
                  We value your feedback! Please take a moment to share your experience with our services.
                </p>
                <a
                  href="https://www.google.com/search?sca_esv=ed31745f76a805c8&hl=en&gl=ng&sxsrf=AE3TifM9pcdA1TsXHO2OiVLR88WzBwvDDw:1753870646265&si=AMgyJEtREmoPL4P1I5IDCfuA8gybfVI2d5Uj7QMwYCZHKDZ-E0yRls-ONRT0asldMxAT0EaQo088dGVGAu6i72i3yykZZYYoXsBTZ7HSXTUjedisInCwKZsl6pmCW1xsoRd6_3FJ6g6aGhxM1hrZ4UDesrUPmdwt8A%3D%3D&q=Websitechic+Digital+Services+Reviews&sa=X&ved=2ahUKEwjg5OimreSOAxXzUkEAHXG9LYEQ0bkNegQIHRAC&cshid=1753870676388306&biw=1280&bih=712&dpr=1.5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200"
                >
                  <Star className="h-4 w-4" />
                  Write a review
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
