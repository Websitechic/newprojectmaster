import { useLocation } from "wouter";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayCircle } from "lucide-react";

export default function GuideVideos() {
  const [location] = useLocation();

  return (
    <div className="flex h-screen">
      <Sidebar currentPath={location} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <PlayCircle className="h-6 w-6 text-blue-600" />
                  Guide Videos
                </h1>
                <p className="text-muted-foreground">
                  Learn how to effectively use our platform with these
                  comprehensive video tutorials
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Platform Navigation Basics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/I0OuqhLFzXw"
                      title="Platform Navigation Basics"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Project Management Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                      title="Project Management Features"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Track Assignment & Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                      title="Task Assignment & Tracking"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Team Communication Tools</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                      title="Team Communication Tools"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Time Tracking & Productivity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                      title="Time Tracking & Productivity"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reporting & Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                      title="Reporting & Analytics"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How to send a message on team chat</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/hXM6eGqkRCg"
                      title="How to send a message on team chat"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How to book a meeting</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/vna0OxMN7qA"
                      title="How to book a meeting"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How to send a direct message</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/3UU2Fq2uuy0"
                      title="How to send a direct message"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How to upload a resource</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/6kej-vc6mNs"
                      title="How to upload a resource"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How to create a task</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/oXMYzxyXbcQ"
                      title="How to create a task"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How to create a project plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/nIuc4IIptEA"
                      title="How to create a project plan"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>How to create a project</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video w-full">
                    <iframe
                      src="https://www.youtube.com/embed/7i8AeShZvTg"
                      title="How to create a project"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full rounded-lg"
                    ></iframe>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <PlayCircle className="h-6 w-6 text-blue-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-2">
                      Need Help?
                    </h3>
                    <p className="text-blue-800 mb-4">
                      Can't find what you're looking for? Contact our support
                      team for personalized assistance.
                    </p>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                      Contact Support
                    </button>
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
